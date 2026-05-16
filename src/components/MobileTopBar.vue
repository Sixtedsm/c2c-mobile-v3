<template>
  <header class="mobile-top-bar no-print" :class="{ 'is-transparent': transparent }">
    <button
      v-if="showBack"
      type="button"
      class="top-bar-btn back-btn"
      :aria-label="$gettext('Retour')"
      @click="goBack"
    >
      <fa-icon icon="chevron-left" />
    </button>
    <span v-else class="top-bar-spacer" />

    <h1 class="top-bar-title">{{ title }}</h1>

    <span class="top-bar-spacer" />
  </header>
</template>

<script>
// Tab routes are the destinations reachable from the BottomNav. When the
// user is on one of these, no back button is shown — there's nowhere to
// go "back" to inside the V3 shell.
const TAB_ROUTES = new Set(['topoguide', 'home', 'offline', 'me', 'more']);

// Maps a route name to the title shown on the top bar. The detail views
// fall back to the document title where possible (see titleForRoute).
const ROUTE_TITLES = {
  topoguide: 'Recherche',
  home: 'Récent',
  offline: 'Mes topos',
  me: 'Moi',
  more: 'Plus',
  outings: 'Sorties',
  routes: 'Itinéraires',
  waypoints: 'Points de passage',
  articles: 'Articles',
  books: 'Livres',
  xreports: 'Sérac',
  areas: 'Massifs',
  images: 'Photos',
  maps: 'Cartes',
  profiles: 'Profil',
  account: 'Compte',
  preferences: 'Préférences',
  following: 'Personnes suivies',
  trackers: 'Trackers',
  auth: 'Connexion',
  'auth-sso': 'Connexion',
  yeti: 'Yeti',
  serac: 'À propos de Sérac',
  whatsnew: 'Nouveautés',
  'outings-stats': 'Statistiques',
  'sophie-picture-contest': 'Concours photo',
  'associations-history': 'Historique des associations',
  itinevert: 'Itinevert',
};

export default {
  name: 'MobileTopBar',

  props: {
    // Some screens (the topo detail hero) look better with a translucent
    // top bar floating over the image. Caller sets `transparent` then.
    transparent: { type: Boolean, default: false },
  },

  computed: {
    routeName() {
      return this.$route?.name || '';
    },

    showBack() {
      return !TAB_ROUTES.has(this.routeName) && window.history.length > 1;
    },

    title() {
      return ROUTE_TITLES[this.routeName] || 'Camptocamp';
    },
  },

  methods: {
    goBack() {
      if (window.history.length > 1) {
        this.$router.back();
      } else {
        // No history (e.g. the user opened a deep link directly) — fall
        // back to the recent feed which is the closest thing to a home.
        this.$router.push({ name: 'home' });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
// Fixed (not sticky): the original layout uses body-level scroll so the
// bar would scroll away with the rest of the page if it was sticky inside
// the flex column. position: fixed keeps it pinned to the viewport for
// real native-app feel.
.mobile-top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 26;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 48px;
  padding: env(safe-area-inset-top) 0.25rem 0;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);

  &.is-transparent {
    background: transparent;
    border-bottom: none;
  }
}

.top-bar-btn {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #4a4a4a;
  font-size: 1.1rem;
  cursor: pointer;
  border-radius: 50%;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
}

.top-bar-spacer {
  flex: 0 0 40px;
}

.top-bar-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #4a4a4a;
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
