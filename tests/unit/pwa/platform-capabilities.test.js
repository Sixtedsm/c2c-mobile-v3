// Which background strategy a device can actually honour.
//
// Sixte's constraint was parity without compromise: both platforms must
// work, with the app detecting which one it is on. They cannot be made
// identical — iOS suspends a standalone PWA when the screen locks, audio
// or no audio — so parity means one honest strategy each rather than one
// generic warning that was true on neither.

import { describe, expect, it } from 'vitest';

import { describePlatform, hasWakeLock, isApple, isStandalone, POCKET, SCREEN_ON } from '@/pwa/platform-capabilities';

const IPHONE = {
  standalone: false,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148',
  maxTouchPoints: 5,
};
const IPHONE_INSTALLED = { ...IPHONE, standalone: true };
// iPadOS 13+ claims to be a Mac. Only the touch points give it away.
const IPAD_DESKTOP_UA = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  maxTouchPoints: 5,
};
const MAC = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  maxTouchPoints: 0,
};
const ANDROID = {
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  maxTouchPoints: 5,
};

describe('isApple', () => {
  it('recognises an iPhone in Safari and installed to the home screen', () => {
    // navigator.standalone exists only on WebKit for iOS/iPadOS — its
    // presence is the tell, its value only says where it is running.
    expect(isApple(IPHONE)).toBe(true);
    expect(isApple(IPHONE_INSTALLED)).toBe(true);
  });

  it('recognises an iPad pretending to be a Mac', () => {
    expect(isApple(IPAD_DESKTOP_UA)).toBe(true);
  });

  it('does not mistake a real Mac for one', () => {
    // A desktop Mac reports no touch points, and it is not a device
    // anyone records an outing on.
    expect(isApple(MAC)).toBe(false);
  });

  it('says no for Android and for nothing at all', () => {
    expect(isApple(ANDROID)).toBe(false);
    expect(isApple(null)).toBe(false);
    expect(isApple({})).toBe(false);
  });
});

describe('isStandalone', () => {
  it('trusts navigator.standalone on Apple', () => {
    expect(isStandalone(IPHONE_INSTALLED, null)).toBe(true);
    expect(isStandalone(IPHONE, { matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it('falls back to the display-mode query elsewhere', () => {
    expect(isStandalone(ANDROID, { matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(isStandalone(ANDROID, { matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it('survives a browser that throws on the query', () => {
    expect(
      isStandalone(ANDROID, {
        matchMedia() {
          throw new Error('nope');
        },
      })
    ).toBe(false);
  });
});

describe('hasWakeLock', () => {
  it('detects the API without calling it', () => {
    expect(hasWakeLock({ wakeLock: { request: () => {} } })).toBe(true);
    expect(hasWakeLock({})).toBe(false);
    expect(hasWakeLock(null)).toBe(false);
  });
});

describe('describePlatform', () => {
  it('gives Apple the screen-on strategy and no silent audio', () => {
    const platform = describePlatform(IPHONE_INSTALLED, null);
    expect(platform.apple).toBe(true);
    expect(platform.strategy).toBe(SCREEN_ON);
    // The clip would not extend an iOS recording by a second, and it
    // would put a pause button on the lock screen — which is a button
    // that stops the outing by accident.
    expect(platform.usesBackgroundAudio).toBe(false);
  });

  it('gives Android the pocket strategy', () => {
    const platform = describePlatform(ANDROID, { matchMedia: () => ({ matches: false }) });
    expect(platform.strategy).toBe(POCKET);
    expect(platform.usesBackgroundAudio).toBe(true);
  });

  it('reports the wake lock separately from the strategy', () => {
    // An older iOS without a working wake lock still gets the screen-on
    // strategy; it simply cannot enforce it, and the UI has to say so
    // rather than silently pick the wrong promise.
    expect(describePlatform({ ...IPHONE, wakeLock: undefined }, null).wakeLock).toBe(false);
    expect(describePlatform({ ...IPHONE, wakeLock: { request: () => {} } }, null).wakeLock).toBe(true);
  });
});
