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
        <logo-ctc />
      </router-link>

      <!-- Center: current tab/page title -->
      <h1 class="top-bar-title">{{ title }}</h1>

      <!-- Right: action buttons -->
      <div class="top-bar-actions">
        <!-- Help: same target as the V1 SideMenu, the C2C help article. -->
        <router-link
          :to="{ name: 'article', params: { id: 106732 } }"
          class="top-bar-btn"
          :aria-label="$gettext('Aide')"
          :title="$gettext('Aide')"
        >
          <fa-icon icon="circle-info" />
        </router-link>
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
import LogoCtc from './LogoCtc.vue';

const TAB_ROUTES = new Set(['topoguide', 'home', 'offline', 'me', 'more']);

export default {
  name: 'MobileTopBar',

  components: { LogoCtc },

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
      // Route → translated label. Strings wrapped in $gettext so the V1
      // gettext extractor picks them up and they get translated to en/de/
      // it/es/ca/eu like the rest of the V1 strings.
      const titles = {
        topoguide: this.$gettext('Recherche'),
        home: this.$gettext('Récent'),
        offline: this.$gettext('Mes topos'),
        me: this.$gettext('Moi'),
        more: this.$gettext('Plus'),
        outings: this.$gettext('Sorties'),
        routes: this.$gettext('Itinéraires'),
        waypoints: this.$gettext('Points de passage'),
        articles: this.$gettext('Articles'),
        books: this.$gettext('Livres'),
        xreports: this.$gettext('Sérac'),
        areas: this.$gettext('Massifs'),
        images: this.$gettext('Photos'),
        maps: this.$gettext('Cartes'),
        profiles: this.$gettext('Profils'),
        profile: this.$gettext('Profil'),
        outing: this.$gettext('Sortie'),
        route: this.$gettext('Itinéraire'),
        waypoint: this.$gettext('Point de passage'),
        article: this.$gettext('Article'),
        book: this.$gettext('Livre'),
        xreport: this.$gettext('Récit'),
        area: this.$gettext('Massif'),
        image: this.$gettext('Photo'),
        map: this.$gettext('Carte'),
        account: this.$gettext('Compte'),
        preferences: this.$gettext('Préférences'),
        following: this.$gettext('Personnes suivies'),
        trackers: this.$gettext('Trackers'),
        auth: this.$gettext('Connexion'),
        'auth-sso': this.$gettext('Connexion'),
        yeti: this.$gettext('Yeti'),
        serac: this.$gettext('À propos de Sérac'),
        whatsnew: this.$gettext('Nouveautés'),
        'outings-stats': this.$gettext('Statistiques'),
        'sophie-picture-contest': this.$gettext('Concours photo'),
        'associations-history': this.$gettext('Historique des associations'),
        itinevert: this.$gettext('Itinevert'),
      };
      return titles[this.routeName] || 'Camptocamp';
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

    onSearchPick(document) {
      // InputDocument emits the picked doc via @input but does NOT navigate
      // by itself (it's a generic selector — used in filters too). When it's
      // wired as a search bar, we have to do the router.push ourselves.
      this.searchOpen = false;
      if (!document || !document.document_id || !document.type) return;
      const docType = this.$documentUtils.getDocumentType(document.type);
      if (!docType) return;
      this.$router
        .push({
          name: docType,
          params: {
            id: String(document.document_id),
            lang: this.$language?.current || this.$route.params.lang || 'fr',
          },
        })
        .catch(() => {
          // Navigating to the page we're already on throws NavigationDuplicated;
          // benign, swallow it.
        });
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

  // Sizes both the old <img> path (now removed) and the new LogoCtc SVG.
  img,
  .logo-ctc {
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
