<template>
  <header class="mobile-top-bar no-print" :class="{ 'is-transparent': transparent, 'is-search-open': searchOpen }">

    <!-- Search-open mode: the input fills the bar -->
    <template v-if="searchOpen">
      <button
        type="button"
        class="top-bar-btn back-btn"
        :aria-label="$gettext('Fermer la recherche')"
        @click="closeSearch"
      >
        <fa-icon icon="chevron-left" />
      </button>
      <div class="search-wrap">
        <input-document
          ref="searchInput"
          :document-type="['waypoint', 'route', 'article', 'book']"
          propose-creation
          show-more-results-link
          clear-input-on-toggle
          @input="onSearchPick"
        />
      </div>
    </template>

    <!-- Normal mode -->
    <template v-else>
      <!-- Left: back arrow or logo -->
      <button
        v-if="showBack"
        type="button"
        class="top-bar-btn back-btn"
        :aria-label="$gettext('Retour')"
        @click="goBack"
      >
        <fa-icon icon="chevron-left" />
      </button>
      <router-link
        v-else
        :to="{ name: 'home' }"
        class="top-bar-logo"
        aria-label="Camptocamp.org"
      >
        <img src="@/assets/img/logo.svg" alt="" />
      </router-link>

      <!-- Center: current tab/page title -->
      <h1 class="top-bar-title">{{ title }}</h1>

      <!-- Right: action buttons -->
      <div class="top-bar-actions">
        <button
          type="button"
          class="top-bar-btn"
          :aria-label="$gettext('Rechercher')"
          @click="openSearch"
        >
          <fa-icon icon="search" />
        </button>

        <join-us-link
          v-if="!$user.isLogged"
          class="top-bar-btn join-btn"
          :aria-label="$gettext('Adhérer')"
        >
          <icon-join-us />
        </join-us-link>

        <dropdown-button
          ref="addMenu"
          class="is-right top-bar-btn add-btn"
        >
          <span slot="button" class="add-trigger" :title="$gettext('Ajouter un contenu')">
            <fa-icon icon="plus" />
          </span>
          <add-link
            v-for="dt of addableTypes"
            :key="dt"
            :document-type="dt"
            class="dropdown-item is-size-6"
            @click.native="$refs.addMenu.isActive = false"
          >
            <icon-document :document-type="dt" fixed-width />
            <span>
              {{ $documentUtils.getCreationTitle(dt) | uppercaseFirstLetter }}
            </span>
          </add-link>
        </dropdown-button>

        <router-link
          v-if="$user.isLogged"
          :to="{ name: 'me' }"
          class="top-bar-btn"
          :aria-label="$gettext('Mon compte')"
        >
          <fa-icon icon="user" />
        </router-link>
        <login-button
          v-else
          class="top-bar-btn"
          :aria-label="$gettext('Se connecter')"
        >
          <fa-icon icon="user" />
        </login-button>
      </div>
    </template>
  </header>
</template>

<script>
const TAB_ROUTES = new Set(['topoguide', 'home', 'offline', 'me', 'more']);

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
  profiles: 'Profils',
  profile: 'Profil',
  outing: 'Sortie',
  route: 'Itinéraire',
  waypoint: 'Point de passage',
  article: 'Article',
  book: 'Livre',
  xreport: 'Récit',
  area: 'Massif',
  image: 'Photo',
  map: 'Carte',
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
    transparent: { type: Boolean, default: false },
  },

  data() {
    return { searchOpen: false };
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

    addableTypes() {
      return ['outing', 'route', 'waypoint', 'article', 'book', 'xreport'];
    },
  },

  watch: {
    $route() {
      // Auto-close the search panel whenever the user navigates.
      this.searchOpen = false;
    },
  },

  methods: {
    goBack() {
      if (window.history.length > 1) {
        this.$router.back();
      } else {
        this.$router.push({ name: 'home' });
      }
    },

    openSearch() {
      this.searchOpen = true;
      // Focus the input on next tick so the keyboard opens immediately.
      this.$nextTick(() => {
        const inp = this.$refs.searchInput;
        if (inp?.$el?.querySelector) {
          const realInput = inp.$el.querySelector('input');
          if (realInput) realInput.focus();
        }
      });
    },

    closeSearch() {
      this.searchOpen = false;
    },

    onSearchPick() {
      // The InputDocument router-pushes the picked result itself; this hook
      // just ensures the search bar collapses behind it.
      this.searchOpen = false;
    },
  },
};
</script>

<style lang="scss" scoped>
.mobile-top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 26;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 52px;
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
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #4a4a4a;
  font-size: 1.1rem;
  cursor: pointer;
  border-radius: 4px;
  text-decoration: none;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #4a4a4a;
  }
}

.back-btn {
  margin-right: 0.25rem;
}

.top-bar-logo {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 0.4rem;

  img {
    height: 28px;
    width: auto;
    display: block;
  }
}

.top-bar-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #4a4a4a;
  margin: 0 0.25rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.top-bar-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
}

// Join-us: orange "+bonhomme" — matches the V1 c2c-color button.
.join-btn {
  background: #ff9933;
  color: white;
  &:hover { background: #e6791f; color: white; }
}

// Add: green "+" — matches the V1 is-success button.
.add-btn {
  // dropdown-button wraps the trigger; style its inner trigger span
  ::v-deep .add-trigger {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #48c774;
    color: white;
    border-radius: 4px;
    cursor: pointer;
  }
  ::v-deep .add-trigger:hover { background: #3ec46d; }
  ::v-deep .dropdown-menu { z-index: 30; }
}

.search-wrap {
  flex: 1;
  display: flex;
  align-items: center;

  ::v-deep .input,
  ::v-deep input[type="search"],
  ::v-deep input[type="text"] {
    width: 100%;
    height: 36px;
    font-size: 16px; // prevents iOS auto-zoom
  }
}
</style>
