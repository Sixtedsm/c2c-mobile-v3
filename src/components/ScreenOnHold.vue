<template>
  <div
    v-if="$outingSession.screenOnMode"
    class="screen-on-hold no-print"
    role="dialog"
    :aria-label="$gettext('Écran de veille — enregistrement en cours')"
    @touchstart="beginHold"
    @touchend="endHold"
    @touchcancel="endHold"
    @mousedown="beginHold"
    @mouseup="endHold"
    @mouseleave="endHold"
  >
    <div class="screen-on-hold-body">
      <span class="screen-on-hold-dot" :class="{ 'is-silent': $outingSession.gpsSilent }"></span>
      <p class="screen-on-hold-elapsed">{{ elapsedLabel }}</p>
      <p class="screen-on-hold-stats">
        {{ $outingSession.positions.length }} {{ $gettext('points') }} · {{ traced.value }} {{ traced.unit }}
      </p>
      <p v-if="$outingSession.gpsSilent" class="screen-on-hold-warning">
        {{ $gettext('Aucun point ne rentre') }}
      </p>
      <p class="screen-on-hold-exit">{{ $gettext('Appui long pour sortir') }}</p>
    </div>
  </div>
</template>

<script>
// The Apple answer to a phone in a pocket.
//
// iOS suspends a standalone PWA the moment the screen locks, whatever it
// is playing, so the recording cannot survive the screen going off. What
// it can survive is the screen staying on — and a black page showing six
// words costs almost nothing on an OLED panel, far less than a map.
//
// It doubles as pocket protection: everything here is inert except a
// deliberate long press, so a thigh cannot stop an outing.
//
// Deliberately NOT shown on Android: there the silent-audio keep-alive
// really does let the phone go dark, and asking someone to burn their
// screen for a guarantee they already have would be a worse app.

import { formatElapsed } from '@/pwa/elapsed-label';
import { distance } from '@/pwa/units';

const HOLD_MS = 800;

export default {
  name: 'ScreenOnHold',

  data() {
    return {
      now: Date.now(),
      tickHandle: null,
      holdHandle: null,
    };
  },

  computed: {
    elapsedLabel() {
      return formatElapsed(
        this.$outingSession.startedAt,
        this.now,
        this.$outingSession.pausedMs,
        this.$outingSession.pausedAt
      );
    },
    traced() {
      return distance(this.$outingSession.tracedDistanceMeters, this.$appSettings?.units);
    },
  },

  watch: {
    // Only tick while the hold is actually up. A minute is plenty: the
    // point of this screen is to be cheap, and a per-second repaint on a
    // phone that is meant to last the day is the opposite.
    '$outingSession.screenOnMode': {
      handler(active) {
        if (active) this.startTick();
        else this.stopTick();
      },
      immediate: true,
    },
  },

  beforeDestroy() {
    this.stopTick();
    this.clearHold();
  },

  methods: {
    startTick() {
      if (this.tickHandle) return;
      this.now = Date.now();
      this.tickHandle = window.setInterval(() => {
        this.now = Date.now();
      }, 60000);
    },
    stopTick() {
      if (this.tickHandle) {
        window.clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    },
    beginHold() {
      this.clearHold();
      this.holdHandle = window.setTimeout(() => {
        this.holdHandle = null;
        this.$outingSession.setScreenOnMode(false);
      }, HOLD_MS);
    },
    endHold() {
      this.clearHold();
    },
    clearHold() {
      if (this.holdHandle) {
        window.clearTimeout(this.holdHandle);
        this.holdHandle = null;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.screen-on-hold {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #000;
  color: #6b6b6b;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  // Nothing here is a scroll surface, and a pocket must not be able to
  // drag it.
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  padding: env(safe-area-inset-top) 1rem env(safe-area-inset-bottom);
}

.screen-on-hold-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.screen-on-hold-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7a3a12;
  margin-bottom: 0.6rem;
  animation: screenOnPulse 3s ease-in-out infinite;

  // Recording, but nothing arriving. Amber and still, like every other
  // surface in the app: the pulse is the promise that fixes are landing.
  &.is-silent {
    background: #a35a00;
    animation: none;
  }
}

@keyframes screenOnPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.screen-on-hold-elapsed {
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
}

.screen-on-hold-stats {
  font-size: 0.8rem;
}

.screen-on-hold-warning {
  font-size: 0.8rem;
  color: #a35a00;
}

.screen-on-hold-exit {
  margin-top: 1.6rem;
  font-size: 0.7rem;
  opacity: 0.55;
}
</style>
