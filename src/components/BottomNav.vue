<template>
  <!-- Mobile-first bottom tab bar. Always rendered so the V3 shell is
       visible no matter the viewport. -->
  <nav class="bottom-nav no-print" aria-label="Navigation principale">
    <ul class="bottom-nav-list">
      <li v-for="tab in tabs" :key="tab.key" class="bottom-nav-item">
        <router-link :to="tab.to" class="bottom-nav-link" :class="{ 'is-active': isActive(tab) }">
          <span class="bottom-nav-icon-wrap">
            <fa-icon :icon="tab.icon" class="bottom-nav-icon" />
            <!-- Pending-sync badge (#21) — shows on the "Mes topos" tab when
                 outings created offline are waiting to be published. -->
            <span
              v-if="tab.key === 'saved' && pendingCount"
              class="bottom-nav-badge"
              :aria-label="$gettext('Sorties en attente de publication')"
            >{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
          </span>
          <span class="bottom-nav-label">{{ tab.label }}</span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script>
export default {
  name: 'BottomNav',

  computed: {
    pendingCount() {
      // #21 badge — visible when outings created offline are queued.
      // Defensive: $offline may not exist in dev/test contexts.
      return this.$offline?.pendingOutings?.length || 0;
    },

    tabs() {
      const isLoggedIn = !!this.$user.isLogged;
      return [
        {
          key: 'search',
          label: this.$gettext('Recherche'),
          icon: ['fas', 'magnifying-glass'],
          to: { name: 'topoguide' },
          match: ['topoguide', 'routes', 'waypoints', 'areas', 'maps', 'images'],
        },
        {
          key: 'recent',
          label: this.$gettext('Récent'),
          icon: ['fas', 'clock'],
          // The c2c.org homepage feed is the real activity feed (latest
          // outings + topo edits + Discourse posts). /outings is just the
          // raw outings listing — Sixte explicitly wants the feed.
          to: { name: 'home' },
          match: ['home'],
        },
        {
          key: 'saved',
          label: this.$gettext('Mes topos'),
          icon: ['fas', 'bookmark'],
          to: { name: 'offline' },
          match: ['offline'],
        },
        {
          key: 'me',
          label: this.$gettext('Moi'),
          icon: ['fas', 'user'],
          // /me is the V3 dashboard. Logged-out users see a sign-in CTA;
          // logged-in users get cards for their outings/routes/contributions
          // plus the account settings shortcuts.
          to: { name: 'me' },
          match: ['me', 'account', 'auth', 'auth-sso', 'preferences', 'following', 'trackers', 'app-settings'],
        },
        {
          key: 'more',
          label: this.$gettext('Plus'),
          icon: ['fas', 'bars'],
          to: { name: 'more' },
          // Curated subset matching MoreView (Itinéraires / Articles /
          // Sérac / Yeti / Forum). 'topoguide' lives under the search tab.
          match: ['more', 'articles', 'xreports', 'yeti', 'serac'],
        },
      ];
    },
  },

  methods: {
    isActive(tab) {
      // First tab whose match list contains the current route name wins.
      const name = this.$route.name;
      if (!name) return false;
      return tab.match.includes(name);
    },
  },
};
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 28;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  // Padding-bottom keeps a 4px floor (Android where safe-area is 0)
  // plus the env() inset (iOS home indicator). Total nav height ~52px
  // on Android, ~52 + indicator on iPhones with notches.
  padding-bottom: calc(4px + env(safe-area-inset-bottom));
  padding-top: 2px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
}

.bottom-nav-list {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  height: 46px;
}

.bottom-nav-item {
  flex: 1;
  display: flex;
}

.bottom-nav-link {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #9a9a9a;
  text-decoration: none;
  font-size: 0.7rem;
  font-weight: 500;
  transition: color 0.15s;

  &:hover,
  &:focus {
    color: #4a4a4a;
    text-decoration: none;
  }

  &.is-active {
    color: #ff9933;
  }
}

.bottom-nav-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.bottom-nav-icon {
  font-size: 1.1rem;
}

// Pending-sync badge (#21). Anchored top-right of the icon, small and
// orange so it reads as a notification without dominating the tab.
.bottom-nav-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #ff9933;
  color: white;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  border-radius: 7px;
  text-align: center;
  box-shadow: 0 0 0 2px white;
}

.bottom-nav-label {
  line-height: 1;
}
</style>
