// What this browser will actually let a recording do in the background,
// and therefore what the app is allowed to promise.
//
// The two platforms are not the same and cannot be made the same by
// wishing:
//
//   Android Chrome keeps watchPosition delivering once the tab is
//   backgrounded (with an OS notification), and does not freeze origins
//   that are playing audio. The silent clip in background-audio.js is
//   therefore the right lever: the phone can go in a pocket, screen off.
//
//   iOS suspends the process of a standalone PWA when the screen locks,
//   audio or no audio — background playback stops with it. No amount of
//   JavaScript changes that. What *is* available is the Screen Wake Lock
//   (Safari 16.4+, and finally working in installed PWAs from iOS 18.4),
//   so the honest route to parity is to keep the screen on rather than
//   pretend to survive it going off.
//
// So: one named strategy per platform, each stating what it guarantees,
// instead of one generic warning that was true nowhere.

export const POCKET = 'pocket'; // screen may go off — Android, desktop
export const SCREEN_ON = 'screen-on'; // screen must stay on — iOS

// iOS and iPadOS, including an iPad reporting itself as a Mac.
//
// navigator.standalone is the reliable tell: it exists only on WebKit
// for iOS/iPadOS, and is `false` in the browser and `true` from the home
// screen. The user-agent check is only the iPadOS-13+ fallback, where
// Safari claims to be a Macintosh but has touch points, and no desktop
// Mac ever does.
export function isApple(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;
  if (typeof nav.standalone === 'boolean') return true;
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

// Installed to the home screen, on either platform.
export function isStandalone(
  nav = typeof navigator !== 'undefined' ? navigator : null,
  win = typeof window !== 'undefined' ? window : null
) {
  if (nav && nav.standalone === true) return true;
  try {
    return !!win?.matchMedia?.('(display-mode: standalone)')?.matches;
  } catch {
    return false;
  }
}

export function hasWakeLock(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return !!nav?.wakeLock?.request;
}

// Everything the UI and the session need, in one read.
export function describePlatform(
  nav = typeof navigator !== 'undefined' ? navigator : null,
  win = typeof window !== 'undefined' ? window : null
) {
  const apple = isApple(nav);
  return {
    apple,
    standalone: isStandalone(nav, win),
    wakeLock: hasWakeLock(nav),
    // The lever that is worth pulling here. On Apple the silent audio is
    // not merely useless — it costs a lock-screen media control, and a
    // media control is a button that stops the recording by accident.
    strategy: apple ? SCREEN_ON : POCKET,
    // Whether the silent keep-alive clip is worth starting at all.
    usesBackgroundAudio: !apple,
  };
}
