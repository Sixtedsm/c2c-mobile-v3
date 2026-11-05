const AD_SCRIPT_URL = 'https://static.admysports.com/hb/site/camptocamp/hb_camptocamp.js';

let requested = false;

// The header-bidding script sets off ~35 requests to ~20 ad networks and
// over a second of main-thread work on a mid-range phone (Lighthouse,
// 2026-11-05: 1.4 s of the 2.1-2.7 s blocking time). It used to be injected
// when the ad component module was imported, i.e. at every app start, before
// the page had rendered and before its slot existed ("Ad slot not found" in
// the console). It now starts once, when a slot is in the page and the page
// has finished loading, so the app's own first render and first taps go first.
export function loadAdScript() {
  if (requested || document.getElementById('ad_script')) {
    return;
  }
  requested = true;

  const inject = () => {
    const s = document.createElement('script');
    s.id = 'ad_script';
    s.src = AD_SCRIPT_URL;
    s.async = true;
    document.head.appendChild(s);
  };
  // Safari has no requestIdleCallback.
  const whenIdle = () =>
    window.requestIdleCallback ? window.requestIdleCallback(inject, { timeout: 3000 }) : setTimeout(inject, 0);

  if (document.readyState === 'complete') {
    whenIdle();
  } else {
    window.addEventListener('load', whenIdle, { once: true });
  }
}
