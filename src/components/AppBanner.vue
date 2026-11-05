<template>
  <aside v-if="visible" class="app-banner no-print" :aria-label="$gettext('Application Camptocamp')">
    <button type="button" class="delete app-banner-close" :aria-label="$gettext('Dismiss')" @click="dismiss" />

    <div class="app-banner-icon">
      <fa-icon icon="mobile-screen" />
    </div>

    <div class="app-banner-body">
      <p class="app-banner-title">{{ $gettext('Camptocamp a son application') }}</p>
      <p class="app-banner-text">
        {{
          $gettext(
            "Vos topos hors ligne, vos sorties saisies sans réseau, le fil des dernières sorties : installez-la sur votre téléphone, gratuitement et sans passer par un magasin d'applications."
          )
        }}
      </p>
      <div class="app-banner-actions">
        <button v-if="install.deferredPrompt" type="button" class="app-banner-button" @click="promptInstall">
          <fa-icon icon="download" />
          {{ $gettext("Installer l'application") }}
        </button>
        <router-link :to="{ name: 'app-guide' }" class="app-banner-link">
          {{ install.deferredPrompt ? $gettext('En savoir plus') : $gettext("Comment l'installer ?") }}
        </router-link>
      </div>
    </div>

    <!-- On a computer, the way to the phone is a scan away. -->
    <figure v-if="qrSvg" class="app-banner-qr">
      <span v-html="qrSvg" />
      <figcaption>{{ $gettext('Scannez avec votre téléphone') }}</figcaption>
    </figure>
  </aside>
</template>

<script>
import install, { devicePlatform, promptInstall } from '@/pwa/install';

// Home-page banner announcing the app (Sixte, 2026-11-06). Hidden once the
// app is installed, or for good once closed on this device.
const STORAGE_KEY = 'v3.appBannerDismissed';

function wasDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default {
  name: 'AppBanner',

  data() {
    return { install, dismissed: wasDismissed(), qrSvg: null };
  },

  computed: {
    visible() {
      return !this.install.installed && !this.dismissed;
    },
  },

  mounted() {
    // The QR code only helps on a computer; phones never load the encoder.
    if (this.visible && devicePlatform() === 'desktop') {
      import(/* webpackChunkName: "qr" */ 'uqr').then(({ renderSVG }) => {
        this.qrSvg = renderSVG(new URL(process.env.BASE_URL, window.location.origin).href);
      });
    }
  },

  methods: {
    promptInstall,
    dismiss() {
      this.dismissed = true;
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // storage blocked: it will show again next visit, nothing worse
      }
    },
  },
};
</script>

<style scoped lang="scss">
.app-banner {
  position: relative;
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem 2.5rem 1rem 1rem;
  border-left: 4px solid $color-base-c2c;
  border-radius: 6px;
  background: #fff5e6;
  color: #4a4a4a;
}

.app-banner-close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
}

.app-banner-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: $color-base-c2c;
  color: white;
  font-size: 1.5rem;
}

.app-banner-body {
  flex: 1;
  min-width: 0;
}

.app-banner-title {
  margin: 0 0 0.2rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.app-banner-text {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  line-height: 1.4;
}

.app-banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.app-banner-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: $color-base-c2c;
  color: white;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #e6791f;
  }
}

.app-banner-link {
  font-weight: 600;
}

.app-banner-qr {
  flex: none;
  width: 104px;
  margin: 0;
  text-align: center;
  font-size: 0.7rem;
  color: #6b6b6b;

  ::v-deep svg {
    display: block;
    width: 104px;
    height: 104px;
    padding: 4px;
    background: white;
    border-radius: 4px;
  }
}

// Narrow screens: icon above nothing, text takes the width.
@media screen and (max-width: $tablet) {
  .app-banner-icon {
    width: 40px;
    height: 40px;
    font-size: 1.25rem;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] .app-banner {
  background: #3a2f1a;
  color: #f0f0f0;

  .app-banner-qr {
    color: #b5b5b5;
  }
}
</style>
