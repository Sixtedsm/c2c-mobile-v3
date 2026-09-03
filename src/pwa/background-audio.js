// Keeping the page alive while the screen is off.
//
// The problem this exists for: a PWA has no background geolocation. When
// the screen goes off, iOS suspends the page outright and Android
// throttles it, so `watchPosition` stops delivering and an outing records
// nothing until the user looks at their phone again.
//
// The only lever a web page has is to look like something the OS must
// keep running, and the one category that qualifies is media playback. A
// page holding an <audio> element that is actually playing is treated as
// a media session and keeps its timers and its geolocation callbacks
// alive in the background.
//
// This is a workaround, not an API, and it deserves to be described as
// one:
//
//   - It is reliable on Android Chrome. On iOS it is much less certain —
//     Apple has narrowed this over releases — which is exactly why the
//     session counts how many fixes actually arrive while hidden, rather
//     than assuming any of this worked.
//   - It puts a media control on the lock screen. Unavoidable: that
//     control *is* what earns the background time.
//   - Playback must start from a user gesture. Starting an outing is one,
//     which is why start() is called from there and never from a timer.
//   - Digital silence is optimised away by some platforms, so the clip
//     carries a signal ~90 dB down: inaudible, but real audio.
//
// The screen wake lock is kept alongside rather than replaced. The two do
// not overlap: the browser drops the wake lock the moment the page is
// hidden, so it only ever covers the case where the user is looking at
// the app, and this covers the case where they are not.

const SAMPLE_RATE = 8000;
const DURATION_S = 1;

// A one-second mono 16-bit WAV, built here rather than shipped as an
// asset so there is no binary in the repository to explain.
function buildSilentWavBlob() {
  const samples = SAMPLE_RATE * DURATION_S;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, samples * 2, true);

  // Amplitude 1 of 32767. Below the threshold of hearing on any device,
  // and still a non-zero waveform, which some platforms require before
  // they will call this "playing".
  for (let i = 0; i < samples; i += 1) {
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

let element = null;
let objectUrl = null;

function ensureElement() {
  if (element) return element;
  objectUrl = URL.createObjectURL(buildSilentWavBlob());
  element = document.createElement('audio');
  element.src = objectUrl;
  element.loop = true;
  // Inline playback: without this iOS may hand the clip to the fullscreen
  // player, which is both absurd and fatal to the page.
  element.setAttribute('playsinline', '');
  element.preload = 'auto';
  // Not muted, deliberately. A muted element does not count as playing
  // media and earns no background time at all — which would make the
  // whole thing a no-op that looks like it works.
  element.volume = 1;
  return element;
}

// Describe the session, so the lock-screen control says what it is
// instead of appearing as an unexplained player.
function describeSession(title, onStopRequest) {
  const session = navigator.mediaSession;
  if (!session) return;
  try {
    if (window.MediaMetadata) {
      session.metadata = new window.MediaMetadata({
        title: title || 'Enregistrement de la trace',
        artist: 'Camptocamp',
      });
    }
    session.playbackState = 'playing';
    // The user can pause from the lock screen. That would silently end
    // the recording, so treat it as an explicit request to stop and let
    // the caller decide what to tell them.
    session.setActionHandler('pause', () => {
      if (typeof onStopRequest === 'function') onStopRequest();
    });
    session.setActionHandler('stop', () => {
      if (typeof onStopRequest === 'function') onStopRequest();
    });
    // Playing again should not be a way to half-restart tracking.
    session.setActionHandler('play', () => {
      element?.play?.().catch(() => {});
      session.playbackState = 'playing';
    });
  } catch {
    // MediaSession is advisory; failing to describe it changes nothing
    // about whether the page stays alive.
  }
}

function clearSession() {
  const session = navigator.mediaSession;
  if (!session) return;
  try {
    session.playbackState = 'none';
    for (const action of ['play', 'pause', 'stop']) {
      session.setActionHandler(action, null);
    }
  } catch {
    /* advisory */
  }
}

export function isSupported() {
  return typeof document !== 'undefined' && typeof window !== 'undefined' && typeof Blob !== 'undefined';
}

// Must be called from a user gesture. Resolves true when playback really
// started — a rejected promise here means the page will be suspended the
// moment the screen goes off, and the caller should say so rather than
// let the user believe the outing is being recorded.
export async function start({ title, onStopRequest } = {}) {
  if (!isSupported()) return false;
  try {
    const audio = ensureElement();
    if (!audio.paused) return true;
    await audio.play();
    describeSession(title, onStopRequest);
    return true;
  } catch {
    return false;
  }
}

export function stop() {
  clearSession();
  if (!element) return;
  try {
    element.pause();
    element.currentTime = 0;
  } catch {
    /* already gone */
  }
}

// True while the clip is actually playing. Checked when the page comes
// back to the foreground: the OS can stop playback on its own, and a
// keep-alive that has quietly died is worth knowing about.
export function isActive() {
  return !!element && !element.paused && !element.ended;
}

// Try to pick playback back up after the OS interrupted it. Not always
// allowed outside a gesture, so the result is reported rather than
// assumed.
export async function resume() {
  if (!element) return false;
  try {
    await element.play();
    if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
    return true;
  } catch {
    return false;
  }
}

// Only for tests and teardown: releases the object URL.
export function dispose() {
  stop();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  element = null;
}
