import Vue from 'vue';

// What this browser offers for installing the app, kept reactive so the
// welcome tour, the home banner and the guide page update by themselves:
//   - Chrome, Edge, Samsung Internet fire `beforeinstallprompt`, which we keep
//     to open their native install dialog from our own button;
//   - Safari on iOS has no API: the user goes through the Share sheet;
//   - an installed app runs in `standalone` display mode, and then there is
//     nothing left to offer.
const install = Vue.observable({
  deferredPrompt: null,
  installed: false,
});

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );
}

install.installed = isStandalone();

window.addEventListener('beforeinstallprompt', (event) => {
  // Keep it for our button instead of Chrome's own mini-bar.
  event.preventDefault();
  install.deferredPrompt = event;
});

window.addEventListener('appinstalled', () => {
  install.installed = true;
  install.deferredPrompt = null;
});

export function devicePlatform() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ presents itself as a Mac; the touch screen gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

// Opens the browser's own install dialog. Resolves to true if accepted.
export async function promptInstall() {
  const event = install.deferredPrompt;
  if (!event) {
    return false;
  }
  // A captured prompt can be shown only once.
  install.deferredPrompt = null;
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}

export default install;
