// Keeping the page alive once the screen goes off.
//
// A PWA has no background geolocation, so the only lever is to look like
// media playback. This module is that lever, and the properties tested
// here are the ones that decide whether it works at all:
//
//   - the clip must not be muted and must not be digital silence, or the
//     platform does not count it as playing and the whole thing becomes a
//     no-op that looks like it works;
//   - start() must report failure rather than swallow it, because a
//     caller that believes the keep-alive is holding will tell the user
//     to pocket their phone;
//   - pausing from the lock screen must reach the caller, or the
//     recording ends without a word.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispose, isActive, resume, start, stop } from '@/pwa/background-audio';

let created;

beforeEach(() => {
  created = [];
  // happy-dom does not implement media playback, so stand in for it and
  // record what the module asked for.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === 'audio') {
      // `paused` and `ended` are getter-only on a real media element, so
      // they have to be redefined rather than assigned.
      let paused = true;
      Object.defineProperty(el, 'paused', { get: () => paused, configurable: true });
      Object.defineProperty(el, 'ended', { get: () => false, configurable: true });
      el.play = vi.fn(async () => {
        paused = false;
      });
      el.pause = vi.fn(() => {
        paused = true;
      });
      el.__setPaused = (v) => {
        paused = v;
      };
      created.push(el);
    }
    return el;
  });
  global.URL.createObjectURL = vi.fn(() => 'blob:silent');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  dispose();
  vi.restoreAllMocks();
});

describe('the clip is shaped so the platform counts it as playing', () => {
  it('loops, plays inline and is not muted', async () => {
    await start({});
    const audio = created[0];
    expect(audio.loop).toBe(true);
    expect(audio.getAttribute('playsinline')).not.toBeNull();
    // A muted element earns no background time at all.
    expect(audio.muted).toBeFalsy();
    expect(audio.volume).toBe(1);
  });

  it('builds a real waveform rather than digital silence', async () => {
    // Some platforms optimise away a silent buffer, and then nothing is
    // "playing". The clip carries a signal ~90 dB down instead.
    let blob;
    global.URL.createObjectURL = vi.fn((b) => {
      blob = b;
      return 'blob:silent';
    });
    await start({});
    expect(blob.type).toBe('audio/wav');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(44);
    // Past the 44-byte WAV header, at least one sample is non-zero.
    expect(bytes.slice(44).some((v) => v !== 0)).toBe(true);
  });
});

describe('failure is reported, never assumed away', () => {
  it('returns false when playback is refused', async () => {
    const realCreate = document.createElement.bind(document);
    document.createElement.mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'audio') {
        Object.defineProperty(el, 'paused', { get: () => true, configurable: true });
        // What an autoplay policy rejection looks like.
        el.play = vi.fn(async () => {
          throw new Error('NotAllowedError');
        });
        el.pause = vi.fn();
      }
      return el;
    });

    // The caller uses this to decide whether to tell the user they may
    // pocket the phone. Swallowing it would make the app lie.
    expect(await start({})).toBe(false);
    expect(isActive()).toBe(false);
  });

  it('reports success when playback started', async () => {
    expect(await start({})).toBe(true);
    expect(isActive()).toBe(true);
  });
});

describe('the recording follows the keep-alive', () => {
  it('stops playing when asked', async () => {
    await start({});
    stop();
    expect(isActive()).toBe(false);
  });

  it('can be picked back up after the system cut it', async () => {
    await start({});
    created[0].__setPaused(true); // the OS stopped playback on its own
    expect(isActive()).toBe(false);
    expect(await resume()).toBe(true);
    expect(isActive()).toBe(true);
  });

  it('does not resume something that was never started', async () => {
    expect(await resume()).toBe(false);
  });
});

describe('a pause from the lock screen reaches the caller', () => {
  it('wires the media-session handlers', async () => {
    const onStopRequest = vi.fn();
    const handlers = {};
    global.navigator.mediaSession = {
      setActionHandler: (action, fn) => {
        handlers[action] = fn;
      },
      playbackState: 'none',
    };

    await start({ title: 'Trace', onStopRequest });
    // Otherwise the user pauses from the lock screen and the outing stops
    // recording with nothing said.
    expect(typeof handlers.pause).toBe('function');
    handlers.pause();
    expect(onStopRequest).toHaveBeenCalled();

    delete global.navigator.mediaSession;
  });

  it('starts fine on a browser with no media session at all', async () => {
    delete global.navigator.mediaSession;
    expect(await start({ onStopRequest: vi.fn() })).toBe(true);
  });
});
