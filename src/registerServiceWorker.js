/* eslint-disable no-console */
import { register } from 'register-service-worker';

if (process.env.NODE_ENV === 'production') {
  register(`${process.env.BASE_URL}service-worker.js`, {
    registered(registration) {
      // Poll for updates every hour while the app is open. This catches
      // updates the user might miss because iOS keeps the standalone PWA
      // alive for days at a time.
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {
            /* ignore */
          });
        }, 60 * 60 * 1000);
      }
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
      if (sessionStorage.getItem('c2cSwReloadedOnUpdate') !== 'true') {
        sessionStorage.setItem('c2cSwReloadedOnUpdate', 'true');
        console.log('New app version available — reloading to apply…');
        window.location.reload();
      }
    },

    error(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}
