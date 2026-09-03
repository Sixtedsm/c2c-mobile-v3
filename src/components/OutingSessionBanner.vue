<template>
  <div v-if="visible" class="outing-session-banner no-print" role="status">
    <button type="button" class="outing-session-banner-btn" @click="goToTopo">
      <span
        class="outing-session-banner-dot"
        :class="{
          'is-recording': $outingSession.gpsTracking,
          'is-paused': $outingSession.paused || $outingSession.recordingInterrupted,
        }"
      ></span>
      <span class="outing-session-banner-text">
        <strong>{{ statusLabel }}</strong>
        <small>{{ elapsedLabel }}{{ metricsLabel }}</small>
      </span>
      <fa-icon icon="chevron-right" />
    </button>
    <!-- The banner is the surface a paused outing is most likely to be
         seen from — the user has wandered off the topo page — so the way
         back belongs here and not only in the topo header menu. -->
    <button
      v-if="$outingSession.paused || $outingSession.recordingInterrupted"
      type="button"
      class="outing-session-banner-resume"
      @click="resumeOuting"
    >
      <fa-icon icon="play" />
      &nbsp;{{ $gettext('Reprendre') }}
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
import { distance } from '@/pwa/units';

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
    // Three states, and the third is the one that matters: the app was
    // killed mid-recording and came back looking like a normal outing.
    statusLabel() {
      if (this.$outingSession.recordingInterrupted) return this.$gettext('Enregistrement interrompu');
      if (this.$outingSession.paused) return this.$gettext('Sortie en pause');
      return this.$gettext('Sortie en cours');
    },

    elapsedLabel() {
      return formatElapsed(
        this.$outingSession.startedAt,
        this.now,
        this.$outingSession.pausedMs,
        this.$outingSession.pausedAt
      );
    },
    metricsLabel() {
      const metres = this.$outingSession.tracedDistanceMeters;
      if (metres < 50) return '';
      const shown = distance(metres, this.$appSettings?.units);
      return ` · ${shown.value} ${shown.unit}`;
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
    resumeOuting() {
      this.$outingSession.resume();
    },

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
  // Just above the BottomNav (66 + safe-area). The margin keeps it
  // pinned inside the safe area on iPhone home-indicator devices.
  bottom: calc(66px + env(safe-area-inset-bottom) + 8px);
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

  // Amber and deliberately still. A paused outing must not borrow the
  // live pulse — that pulse is the promise that fixes are arriving.
  &.is-paused {
    background: #ff9933;
    animation: none;
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

.outing-session-banner-resume {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  margin-left: 0.4rem;
  padding: 0.5rem 0.8rem;
  border: 0;
  border-radius: 999px;
  background: #ff9933;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
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
