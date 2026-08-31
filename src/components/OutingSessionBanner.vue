<template>
  <div v-if="visible" class="outing-session-banner no-print" role="status">
    <button type="button" class="outing-session-banner-btn" @click="goToTopo">
      <span class="outing-session-banner-dot" :class="{ 'is-recording': $outingSession.gpsTracking }"></span>
      <span class="outing-session-banner-text">
        <strong>{{ $gettext('Sortie en cours') }}</strong>
        <small>{{ elapsedLabel }}{{ metricsLabel }}</small>
      </span>
      <fa-icon icon="chevron-right" />
    </button>
  </div>
</template>

<script>
// Global reminder that an outing session is running. Only visible when
// the user is NOT already on the topo the session is anchored to —
// otherwise the StartOutingControl in the header already shows the
// state and this banner would duplicate it.
//
// Sits inside the App shell above the BottomNav. Tapping it navigates
// back to the topo so the user can stop / adjust / add photos.

import { formatElapsed } from '@/pwa/elapsed-label';

export default {
  name: 'OutingSessionBanner',

  data() {
    return {
      now: Date.now(),
      tickHandle: null,
    };
  },

  computed: {
    topoRef() {
      return this.$outingSession?.topoRef || null;
    },
    active() {
      return !!(this.$outingSession?.sessionActive && this.topoRef);
    },
    // True when the user is currently viewing the topo where the
    // session was started — in that case the in-header control shows
    // the state, so this banner would be redundant. Uses a strict
    // match on route name + id so an unrelated outing page still
    // displays the banner (previous implementation used to swallow
    // every outing page, hiding the banner too aggressively).
    onOwnTopo() {
      if (!this.active) return false;
      const t = this.topoRef;
      const route = this.$route;
      return route.name === t.type && String(route.params.id) === String(t.id);
    },
    visible() {
      return this.active && !this.onOwnTopo;
    },
    elapsedLabel() {
      return formatElapsed(this.$outingSession.startedAt, this.now);
    },
    metricsLabel() {
      const km = this.$outingSession.tracedDistanceMeters / 1000;
      if (km < 0.05) return '';
      return ` · ${km.toFixed(1)} km`;
    },
  },

  watch: {
    // Only run the elapsed-time tick while there's actually a session
    // to display. Idle branches (no session, or user on the session's
    // own topo) don't schedule the interval at all.
    visible: {
      handler(now) {
        if (now) this.startTick();
        else this.stopTick();
      },
      immediate: true,
    },
  },

  beforeDestroy() {
    this.stopTick();
  },

  methods: {
    startTick() {
      if (this.tickHandle) return;
      this.now = Date.now();
      this.tickHandle = window.setInterval(() => {
        this.now = Date.now();
      }, 30000);
    },
    stopTick() {
      if (this.tickHandle) {
        window.clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    },
    goToTopo() {
      if (!this.topoRef) return;
      this.$router
        .push({
          name: this.topoRef.type,
          params: {
            id: String(this.topoRef.id),
            lang: this.topoRef.lang,
          },
        })
        .catch(() => {
          /* NavigationDuplicated is benign */
        });
    },
  },
};
</script>

<style lang="scss" scoped>
.outing-session-banner {
  position: fixed;
  left: 0;
  right: 0;
  // Just above the BottomNav (52 + safe-area). The margin keeps it
  // pinned inside the safe area on iPhone home-indicator devices.
  bottom: calc(52px + env(safe-area-inset-bottom) + 8px);
  z-index: 27;
  display: flex;
  justify-content: center;
  padding: 0 0.75rem;
  pointer-events: none;
}

.outing-session-banner-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.85rem 0.5rem 0.7rem;
  background: #4a4a4a;
  color: white;
  border: none;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1.2;
  max-width: 100%;
}

.outing-session-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a8a8a8;
  flex: 0 0 auto;

  &.is-recording {
    background: #e54545;
    animation: bannerPulse 1.5s ease-in-out infinite;
  }
}

@keyframes bannerPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.6;
  }
}

.outing-session-banner-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  gap: 1px;

  strong {
    font-weight: 600;
  }
  small {
    font-size: 0.7rem;
    opacity: 0.85;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .outing-session-banner-btn {
    background: #ff9933;
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }
}
</style>
