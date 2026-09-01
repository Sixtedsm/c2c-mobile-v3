<template>
  <!-- Forum-specific bottom tab bar. Rendered by App.vue in place of
       the general BottomNav whenever the current route is inside the
       /forum tree, so the app hosts two coherent worlds side-by-side
       (topoguide + Discourse) instead of a single nav that dumps the
       user into the wrong world on tap. Same visual system as
       BottomNav so users don't need to relearn the bar. -->
  <nav class="bottom-nav forum-bottom-nav no-print" aria-label="Navigation forum">
    <ul class="bottom-nav-list">
      <li v-for="tab in tabs" :key="tab.key" class="bottom-nav-item">
        <router-link
          :to="tab.to"
          class="bottom-nav-link"
          :class="{ 'is-active': isActive(tab), 'is-return': tab.key === 'return' }"
        >
          <span class="bottom-nav-icon-wrap" :class="{ 'is-avatar': tab.key === 'me' }">
            <fa-icon :icon="tab.icon" class="bottom-nav-icon" />
          </span>
          <span class="bottom-nav-label">{{ tab.label }}</span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script>
// Sibling of BottomNav.vue that only takes over inside /forum/*. The
// items map to the same routes the Discourse mobile UI exposes
// (Latest / Categories / Search / You), plus an explicit "← Topos"
// button so the user always has a clean way back to the topoguide
// world without having to hunt for it in a menu.

export default {
  name: 'ForumBottomNav',

  computed: {
    isLoggedIn() {
      return !!this.$user?.isLogged;
    },
    forumUsername() {
      return this.$user?.forumUsername || null;
    },
    tabs() {
      // "Moi" points to the user's own forum profile when we know
      // their Discourse handle; otherwise it falls back to the app
      // sign-in page so the tab never leads to a dead route.
      const meTo = this.forumUsername
        ? { name: 'forum-user', params: { username: this.forumUsername } }
        : { name: 'auth' };
      return [
        {
          key: 'recent',
          label: this.$gettext('Récent'),
          icon: ['fas', 'clock-rotate-left'],
          to: { name: 'forum' },
          match: ['forum'],
        },
        {
          key: 'categories',
          label: this.$gettext('Catégories'),
          icon: ['fas', 'folder'],
          to: { name: 'forum-categories' },
          // Highlight both the dedicated categories list and the
          // per-category topic listings — the user is still "in
          // categories" when browsing a specific one.
          match: ['forum-categories', 'forum-category'],
        },
        {
          key: 'search',
          label: this.$gettext('Rechercher'),
          icon: ['fas', 'magnifying-glass'],
          to: { name: 'forum-search' },
          match: ['forum-search'],
        },
        {
          key: 'me',
          label: this.$gettext('Moi'),
          icon: ['fas', 'user'],
          to: meTo,
          // Active only when the profile page is showing the CURRENT
          // user's forum profile — visiting someone else's profile
          // shouldn't light up "Moi".
          match: ['forum-user'],
        },
        {
          key: 'return',
          label: this.$gettext('Topos'),
          icon: ['fas', 'mountain'],
          to: { name: 'home' },
          // Deliberately never active — this is an escape hatch back
          // to the topoguide world, not a persistent tab.
          match: [],
        },
      ];
    },
  },

  methods: {
    isActive(tab) {
      const name = this.$route.name;
      if (!name) return false;
      if (!tab.match.includes(name)) return false;
      // Extra check for the "Moi" tab: highlight only when the
      // profile shown is actually the current user's.
      if (tab.key === 'me' && name === 'forum-user') {
        return String(this.$route.params.username) === String(this.forumUsername);
      }
      return true;
    },
  },
};
</script>

<style lang="scss" scoped>
// Inherits every dimension and behaviour from the topoguide's
// .bottom-nav (same fixed positioning, same 56 px inner height,
// same safe-area padding, same z-index). Only the forum-specific
// tweaks live here so the two bars really feel like siblings.
.forum-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 28;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  padding-bottom: calc(6px + env(safe-area-inset-bottom));
  padding-top: 4px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
}

.bottom-nav-list {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  height: 56px;
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
  gap: 3px;
  color: #9a9a9a;
  text-decoration: none;
  font-size: 0.75rem;
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
  // "Retour Topos" gets a subtle grey outline instead of the orange
  // active color — makes it read as a "return" affordance rather
  // than a peer tab.
  &.is-return {
    color: #6b6b6b;
    &:hover,
    &:focus {
      color: #4a4a4a;
    }
  }
}

.bottom-nav-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bottom-nav-icon {
  font-size: 1.3rem;
}
// Square-with-rounded-corners for the forum "Moi" avatar icon,
// echoing the top-right avatar convention on MobileTopBar (round =
// topo, square = forum). Keeps the two nav bars visually consistent
// so users always know which world they are in.
.bottom-nav-icon-wrap.is-avatar {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.05);
}

.bottom-nav-label {
  line-height: 1;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-bottom-nav {
    background: #232323;
    border-top-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.4);
  }
  .forum-bottom-nav .bottom-nav-link {
    color: #8a8a8a;
    &:hover,
    &:focus {
      color: #ccc;
    }
    &.is-active {
      color: #ff9933;
    }
    &.is-return {
      color: #b5b5b5;
      &:hover,
      &:focus {
        color: #e5e5e5;
      }
    }
  }
  .forum-bottom-nav .bottom-nav-icon-wrap.is-avatar {
    background: rgba(255, 255, 255, 0.08);
  }
}
</style>
