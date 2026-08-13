<template>
  <span class="near-me">
    <button
      type="button"
      class="button is-small near-me-btn"
      :class="{ 'is-active': isActive }"
      :disabled="busy"
      :title="isActive ? $gettext('Filtre distance actif — appuyez pour ajuster') : $gettext('Rechercher près de moi')"
      :aria-label="$gettext('Rechercher près de moi')"
      @click="open"
    >
      <fa-icon :icon="busy ? 'rotate' : 'location-crosshairs'" :class="{ 'fa-spin': busy }" />
      <span class="near-me-label is-hidden-mobile">
        &nbsp;{{ isActive ? currentRadius + ' km' : $gettext('Près de moi') }}
      </span>
      <span v-if="isActive" class="near-me-badge-mobile is-hidden-tablet"> &nbsp;{{ currentRadius }} </span>
    </button>

    <div v-if="showPicker" class="near-me-modal" role="dialog" @click.self="cancel">
      <div class="near-me-card">
        <h3 class="near-me-title">{{ $gettext('Rechercher près de moi') }}</h3>
        <p class="near-me-subtitle">
          {{ $gettext('Rayon autour de votre position :') }}
        </p>
        <div class="near-me-options">
          <button
            v-for="opt in radiusOptions"
            :key="opt"
            type="button"
            class="near-me-option"
            :class="{ 'is-selected': selectedRadius === opt }"
            @click="selectedRadius = opt"
          >
            {{ opt }} km
          </button>
        </div>
        <div class="near-me-actions">
          <button v-if="isActive" type="button" class="button is-text is-danger" @click="clearFilter">
            {{ $gettext('Retirer le filtre') }}
          </button>
          <button type="button" class="button is-text" @click="cancel">{{ $gettext('Annuler') }}</button>
          <button type="button" class="button is-primary" @click="apply">{{ $gettext('Appliquer') }}</button>
        </div>
      </div>
    </div>
  </span>
</template>

<script>
// "Près de moi" (CDC §2.3): geolocate → compute a bbox around the user
// → set `bbox=w,s,e,n` (EPSG:3857) in the route query so the existing
// API filter picks it up. No new API path, no client-side filtering —
// stays inside the V1 documents-listing plumbing.

import { toast } from 'bulma-toast';

import { geolocationErrorMessage } from '@/js/geolocation-error-message';
import ol from '@/js/libs/ol';
import { bboxFromLonLatRadius } from '@/pwa/geo-bbox';

const RADIUS_OPTIONS_KM = [10, 25, 50, 100];
const DEFAULT_RADIUS_KM = 25;

export default {
  name: 'NearMeButton',

  data() {
    return {
      showPicker: false,
      selectedRadius: DEFAULT_RADIUS_KM,
      busy: false,
    };
  },

  computed: {
    radiusOptions() {
      return RADIUS_OPTIONS_KM;
    },

    isActive() {
      return Boolean(this.$route.query.bbox);
    },

    // Best-effort read of the radius the user last picked, stored in the
    // route query so the button label stays honest across reloads.
    currentRadius() {
      return Number(this.$route.query.nmr) || DEFAULT_RADIUS_KM;
    },
  },

  methods: {
    open() {
      if (this.busy) return;
      this.selectedRadius = this.currentRadius;
      this.showPicker = true;
    },

    cancel() {
      this.showPicker = false;
    },

    clearFilter() {
      const query = { ...this.$route.query };
      delete query.bbox;
      delete query.nmr;
      this.$router.push({ query }).catch(() => {});
      this.showPicker = false;
    },

    async apply() {
      this.showPicker = false;
      this.busy = true;
      // Split the geo-permission path from the downstream path so we
      // don't route a JS crash (bbox math, router.push, etc.) through
      // the "Géolocalisation refusée…" branch of the toast — that used
      // to swallow every error under the same wording.
      let position;
      try {
        position = await this.getCurrentPosition();
      } catch (err) {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 5000,
          message: geolocationErrorMessage(err, this.$gettext),
        });
        this.busy = false;
        return;
      }
      try {
        const bbox = this.computeBbox(position.coords, this.selectedRadius);
        const query = {
          ...this.$route.query,
          bbox,
          nmr: this.selectedRadius,
          offset: undefined,
        };
        this.$router.push({ query }).catch(() => {});
      } catch (err) {
        toast({
          type: 'is-danger',
          position: 'bottom-center',
          duration: 5000,
          message: this.$gettext("Impossible d'appliquer le filtre : ") + (err?.message || err?.name || String(err)),
        });
      } finally {
        this.busy = false;
      }
    },

    getCurrentPosition() {
      return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
          reject({ code: 2 });
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 10_000,
        });
      });
    },

    // Thin wrapper — the actual math lives in @/pwa/geo-bbox so it's
    // unit-testable without booting Vue or OpenLayers ES modules.
    computeBbox(coords, radiusKm) {
      return bboxFromLonLatRadius(ol, coords.longitude, coords.latitude, radiusKm);
    },
  },
};
</script>

<style lang="scss" scoped>
.near-me-btn {
  background: transparent;
  color: #337ab7;
  border: 1px solid #337ab7;

  @media screen and (max-width: 768px) {
    padding-left: 0.45rem;
    padding-right: 0.45rem;
  }

  &:hover:not([disabled]),
  &:focus:not([disabled]) {
    background: #e6f0f8;
    color: #275e8f;
    border-color: #275e8f;
  }

  &.is-active {
    background: #337ab7;
    color: white;

    &:hover:not([disabled]),
    &:focus:not([disabled]) {
      background: #275e8f;
      color: white;
    }
  }
}

.near-me-badge-mobile {
  font-size: 0.7rem;
  font-weight: 600;
}

.near-me-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 1rem;
}

.near-me-card {
  background: white;
  border-radius: 10px;
  padding: 1.25rem;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.near-me-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0 0 0.4rem;
}

.near-me-subtitle {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0 0 0.9rem;
}

.near-me-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.near-me-option {
  padding: 0.6rem 0.4rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.15);
  color: #4a4a4a;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;

  &:hover,
  &:focus {
    outline: none;
    border-color: #337ab7;
  }

  &.is-selected {
    background: #e6f0f8;
    border-color: #337ab7;
    color: #275e8f;
  }
}

.near-me-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-wrap: wrap;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .near-me-btn {
    background: transparent;
    color: #6db4ff;
    border-color: #6db4ff;
    &:hover:not([disabled]),
    &:focus:not([disabled]) {
      background: rgba(109, 180, 255, 0.12);
      color: #b0d4ff;
    }
    &.is-active {
      background: #337ab7;
      color: #fff;
    }
  }
  .near-me-card {
    background: #2a2a2a;
    color: #e5e5e5;
  }
  .near-me-title {
    color: #f5f5f5;
  }
  .near-me-subtitle {
    color: #9a9a9a;
  }
  .near-me-option {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
    &.is-selected {
      background: rgba(109, 180, 255, 0.15);
      border-color: #6db4ff;
      color: #b0d4ff;
    }
  }
}
</style>
