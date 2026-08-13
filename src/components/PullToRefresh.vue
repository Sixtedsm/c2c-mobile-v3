<template>
  <div
    class="pull-to-refresh"
    :class="{ 'is-visible': pulling || refreshing }"
    :style="indicatorStyle"
    aria-hidden="true"
  >
    <fa-icon :icon="refreshing ? 'rotate' : 'arrow-down'" :class="{ 'fa-spin': refreshing, 'is-ready': ready }" />
  </div>
</template>

<script>
// Pull-to-refresh (#7). Attaches to the V3 scroll container .page-content
// and triggers a window-level `v3:refresh` event when the user pulls past
// the threshold from scrollTop=0. Views opt in by listening to that event
// in their mounted() and calling their own reload(). Plain pointer events
// — no library, ~120 LOC. Disabled when prefers-reduced-motion is set.

const THRESHOLD = 70; // pixels the user must pull to trigger refresh
const MAX_PULL = 110; // visual cap on how far the indicator can travel

export default {
  name: 'PullToRefresh',

  data() {
    return {
      pulling: false,
      refreshing: false,
      pullY: 0,
      startY: 0,
      el: null,
      enabled: true,
    };
  },

  computed: {
    ready() {
      return this.pullY >= THRESHOLD;
    },
    indicatorStyle() {
      if (this.refreshing) {
        return { transform: `translate(-50%, ${THRESHOLD * 0.6}px)` };
      }
      if (this.pulling) {
        const y = Math.min(this.pullY, MAX_PULL);
        return { transform: `translate(-50%, ${y * 0.6}px)`, opacity: Math.min(1, y / THRESHOLD) };
      }
      return { transform: 'translate(-50%, -40px)', opacity: 0 };
    },
  },

  mounted() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.enabled = false;
      return;
    }
    this.el = document.querySelector('.page-content');
    if (!this.el) return;
    this.el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.el.addEventListener('touchend', this.onTouchEnd);
    this.el.addEventListener('touchcancel', this.onTouchEnd);

    this.onSyncDone = () => {
      this.refreshing = false;
      // Clear the safety timeout if the listener responded before 4s —
      // otherwise a stale timeout could fire during a *later* refresh
      // and cancel that one prematurely.
      if (this._safetyTimer) {
        clearTimeout(this._safetyTimer);
        this._safetyTimer = null;
      }
    };
    window.addEventListener('v3:refresh-done', this.onSyncDone);
  },

  beforeDestroy() {
    if (this.el) {
      this.el.removeEventListener('touchstart', this.onTouchStart);
      this.el.removeEventListener('touchmove', this.onTouchMove);
      this.el.removeEventListener('touchend', this.onTouchEnd);
      this.el.removeEventListener('touchcancel', this.onTouchEnd);
    }
    if (this.onSyncDone) {
      window.removeEventListener('v3:refresh-done', this.onSyncDone);
    }
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer);
    }
  },

  methods: {
    onTouchStart(e) {
      if (!this.enabled || this.refreshing) return;
      if (this.el.scrollTop > 0) return;
      this.startY = e.touches[0].clientY;
      this.pulling = true;
      this.pullY = 0;
    },

    onTouchMove(e) {
      if (!this.pulling || this.refreshing) return;
      const dy = e.touches[0].clientY - this.startY;
      // Only react to downward pulls; if user pulls up just cancel.
      if (dy < 0) {
        this.pulling = false;
        return;
      }
      // Block native scroll while pulling so the page doesn't rubber-band
      // away the gesture (only when we're past a small dead zone to avoid
      // grabbing every micro-touch).
      if (dy > 6 && this.el.scrollTop === 0) {
        e.preventDefault();
      }
      this.pullY = dy;
    },

    onTouchEnd() {
      if (!this.pulling) return;
      const triggered = this.pullY >= THRESHOLD;
      this.pulling = false;
      this.pullY = 0;
      if (triggered) {
        this.refreshing = true;
        window.dispatchEvent(new CustomEvent('v3:refresh'));
        // Safety net: if nobody handles the refresh (no listener responded
        // with v3:refresh-done), stop spinning after 4s rather than hanging.
        // Track the timer so onSyncDone can clear it — otherwise a stale
        // safety timer from this pull could cancel a *later* refresh.
        // (No pre-clear needed: onTouchEnd early-returns while refreshing
        // is true, so we can't reach this with a live timer.)
        this._safetyTimer = setTimeout(() => {
          this.refreshing = false;
          this._safetyTimer = null;
        }, 4000);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.pull-to-refresh {
  position: fixed;
  top: calc(52px + env(safe-area-inset-top));
  left: 50%;
  z-index: 27;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ff9933;
  font-size: 1rem;
  transform: translate(-50%, -40px);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.18s ease, opacity 0.18s ease;

  .is-ready {
    transform: rotate(180deg);
    transition: transform 0.15s;
  }
}

.pull-to-refresh.is-visible {
  transition: none; // follow the finger live, no smoothing
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .pull-to-refresh {
    background: #2a2a2a;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }
}
</style>
