/* eslint-disable no-console */
import { register } from 'register-service-worker';

import router from '@/js/vue-plugins/router';

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

      const reload = () => {
        sessionStorage.setItem('c2cSwReloadedOnUpdate', 'true');
        console.log('New app version available — reloading to apply…');
        window.location.reload();
      };
      // Never on top of a form: its author may be away syncing a watch (see
      // OutingTracePicker). Nor on the page reached by leaving it, which shows
      // the toast confirming the save and offers « Ajouter des images »: wait
      // for the next change of page after that one. A page of the old version
      // that fails to load (its chunks are gone from the server) reloads too.
      // Wiki forms only: anywhere else (forum included) it reloads at once.
      const isForm = (route) => /-(add|edit)$/.test(route.name || '');
      if (!isForm(router.currentRoute)) return reload();
      router.afterEach((to, from) => {
        if (to.path !== from.path && !isForm(to) && !isForm(from)) reload();
      });
      router.onError(() => {
        if (!isForm(router.currentRoute)) reload();
      });
    },

    error(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}
