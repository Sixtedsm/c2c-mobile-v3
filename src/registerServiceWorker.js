/* eslint-disable no-console */
import { register } from 'register-service-worker';

// Mirror of the outing-session plugin's storage key. Read directly from
// localStorage rather than through the plugin: this module runs at boot,
// outside the Vue tree, and must not pull the session singleton (and the
// geolocation machinery behind it) into the entry chunk just to ask one
// question.
const SESSION_STORAGE_KEY = 'v3.outingSession';
// Mirrors MAX_STALE_MS in src/js/vue-plugins/outing-session.js.
const MAX_STALE_MS = 48 * 3600 * 1000;
const SESSION_RECHECK_MS = 30 * 1000;

function outingInProgress() {
  // Same reading as the session plugin's loadSnapshot(): a blob it would
  // discard is not an outing in progress. This used to trust any
  // `sessionActive` and treat an unreadable blob as a recording, so a
  // phone with a forgotten session deferred every update — and every fix
  // — for as long as the blob stayed there.
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session?.sessionActive) return false;
    return !(session.startedAt && Date.now() - session.startedAt > MAX_STALE_MS);
  } catch {
    return false;
  }
}

if (process.env.NODE_ENV === 'production') {
  register(`${process.env.BASE_URL}service-worker.js`, {
    registered(registration) {
      if (!registration) return;

      // Aggressive update detection so a user who hits the deployed URL
      // gets the latest build without having to manually clear caches.
      // Check immediately on registration, again whenever the tab regains
      // focus (covering iOS PWAs that stay alive for days), and as a final
      // safety net once an hour.
      const tryUpdate = () =>
        registration.update().catch(() => {
          /* ignore — offline, server hiccup, etc. */
        });

      tryUpdate();
      setInterval(tryUpdate, 60 * 60 * 1000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryUpdate();
      });
      window.addEventListener('focus', tryUpdate);
    },

    updated() {
      // A new service worker has installed AND activated (we use skipWaiting
      // + clients.claim() inside the SW). The page in memory is still running
      // the old JS bundle, which references the old chunk hashes — any lazy
      // import (e.g. opening "+ Outing" which pulls wiki-tools.js) will fail
      // because the new SW only precaches the new chunk hashes. Reload so we
      // bring the page in sync with the active SW.
      //
      // sessionStorage guard prevents an infinite reload loop in the unlikely
      // case where the activation race triggers an immediate second "updated".
      if (sessionStorage.getItem('c2cSwReloadedOnUpdate') === 'true') return;

      // …but never on top of an outing in progress. A reload restarts the
      // session with gpsTracking off by design (the plugin refuses to
      // silently re-arm the GPS after a restart), so applying an update
      // mid-outing ends the recording — and the user is on a mountain,
      // not watching the screen. Gilles guessed exactly this when a build
      // went out during his outing (mail 2026-09-04); he was right, and it
      // is a deploy the app should have declined to apply.
      //
      // The stale bundle is the lesser problem: lazy chunks can 404 until
      // the reload happens, and the page is walking, not navigating.
      const applyUpdate = () => {
        if (outingInProgress()) return false;
        sessionStorage.setItem('c2cSwReloadedOnUpdate', 'true');
        console.log('New app version available — reloading to apply…');
        window.location.reload();
        return true;
      };

      if (applyUpdate()) return;

      console.log('New app version available — deferred, an outing is in progress.');
      const handle = setInterval(() => {
        if (applyUpdate()) clearInterval(handle);
      }, SESSION_RECHECK_MS);
    },

    error(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}
