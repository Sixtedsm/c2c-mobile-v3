// Subscribe a view to the V3 pull-to-refresh gesture (#7). The view must
// expose a `pullRefresh()` method (or a `load()` fallback) that re-fetches
// its data. The mixin emits `v3:refresh-done` when the returned promise
// settles so the indicator stops spinning instead of timing out at 4s.

export default {
  mounted() {
    this.$_pullRefreshHandler = () => {
      const fn = this.pullRefresh || this.load;
      if (typeof fn !== 'function') {
        window.dispatchEvent(new CustomEvent('v3:refresh-done'));
        return;
      }
      let result;
      try {
        result = fn.call(this);
      } catch {
        window.dispatchEvent(new CustomEvent('v3:refresh-done'));
        return;
      }
      Promise.resolve(result).finally(() => {
        window.dispatchEvent(new CustomEvent('v3:refresh-done'));
      });
    };
    window.addEventListener('v3:refresh', this.$_pullRefreshHandler);
  },

  beforeDestroy() {
    if (this.$_pullRefreshHandler) {
      window.removeEventListener('v3:refresh', this.$_pullRefreshHandler);
    }
  },
};
