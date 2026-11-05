// The ad script must start once, and only after the page has loaded:
// injected at import time it ran on every app start ahead of the app's own
// render, and before its slot existed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adScripts = () => document.querySelectorAll('script#ad_script');

describe('loadAdScript', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.head.innerHTML = '';
    // happy-dom would otherwise really download the script from the ad network.
    window.happyDOM.settings.disableJavaScriptFileLoading = true;
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for the load event, then injects the script once', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const { loadAdScript } = await import('@/js/ads');

    loadAdScript();
    loadAdScript(); // a second slot on the same page
    vi.runAllTimers();
    expect(adScripts()).toHaveLength(0);

    window.dispatchEvent(new Event('load'));
    vi.runAllTimers();
    expect(adScripts()).toHaveLength(1);
  });

  it('injects right away (on idle) when the page is already loaded', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const { loadAdScript } = await import('@/js/ads');

    loadAdScript();
    vi.runAllTimers();
    expect(adScripts()).toHaveLength(1);
    expect(adScripts()[0].src).toContain('admysports.com');
  });
});
