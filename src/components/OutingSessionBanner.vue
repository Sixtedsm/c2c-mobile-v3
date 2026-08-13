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
// state and this would be redundant.
//
// Sits inside the App shell above the BottomNav, low-z so it doesn't
// cover modals. Tapping it navigates back to the topo so the user can
// stop / adjust / add photos.

const TAB_ROUTES_WITH_HEADER_CONTROL = new Set(['route', 'outing']);

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
    onOwnTopo() {
      // Same topo the session was started on — the in-header control
      // owns the UI in that case.
      if (!this.active) return false;
      const t = this.topoRef;
      const route = this.$route;
      if (!TAB_ROUTES_WITH_HEADER_CONTROL.has(route.name)) return false;
      return (
        (route.name === t.type || (route.name === 'outing' && t.type === 'route')) &&
        String(route.params.id) === String(t.id)
      );
    },
    visible() {
      return this.active && !this.onOwnTopo;
    },
    elapsedLabel() {
      const started = this.$outingSession.startedAt;
      if (!started) return '';
      const sec = Math.floor((this.now - started) / 1000);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
    },
    metricsLabel() {
      const km = this.$outingSession.tracedDistanceMeters / 1000;
      if (km < 0.05) return '';
      return ` · ${km.toFixed(1)} km`;
    },
  },

  mounted() {
    this.tickHandle = window.setInterval(() => {
      this.now = Date.now();
    }, 30000);
  },

  beforeDestroy() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
  },

  methods: {
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
