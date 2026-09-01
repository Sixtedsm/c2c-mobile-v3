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
      <router-link v-else :to="{ name: 'home' }" class="top-bar-logo" aria-label="Camptocamp.org">
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
        <button type="button" class="top-bar-btn" :aria-label="$gettext('Rechercher')" @click="openSearch">
          <fa-icon icon="search" />
        </button>

        <join-us-link v-if="!$user.isLogged" class="top-bar-btn join-btn" :aria-label="$gettext('Adhérer')">
          <icon-join-us />
        </join-us-link>

        <dropdown-button ref="addMenu" class="is-right top-bar-btn add-btn">
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

        <!-- Notifications bell — only inside /forum/*, only when the
             user is logged. Shows a count badge from Discourse. Tap
             opens the in-app notifications inbox. Mirrors what
             forum.camptocamp.org has in its own top-right corner. -->
        <router-link
          v-if="isForumRoute && $user.isLogged"
          :to="{ name: 'forum-notifications' }"
          class="top-bar-btn top-bar-bell"
          :aria-label="$gettext('Notifications')"
        >
          <fa-icon icon="bell" />
          <span v-if="unreadNotifCount > 0" class="top-bar-bell-badge" :aria-label="$gettext('notifications non lues')">
            {{ unreadNotifCount > 9 ? '9+' : unreadNotifCount }}
          </span>
        </router-link>

        <!-- Profile shortcut — context-aware:
             on /forum/* it opens the user's Discourse forum profile,
             everywhere else the C2C "Moi" page (which itself links
             to the wiki profile). Matches how camptocamp.org and
             forum.camptocamp.org each expose their own avatar
             shortcut in the top-right, without kicking the user
             out to a different tab. Shows the Discourse avatar
             when we have one, otherwise the generic user icon. -->
        <router-link
          v-if="$user.isLogged"
          :to="profileShortcutTo"
          class="top-bar-btn top-bar-avatar"
          :class="{ 'is-forum': isForumRoute }"
          :aria-label="profileShortcutLabel"
        >
          <img v-if="myAvatarUrl && !avatarFailed" :src="myAvatarUrl" :alt="$user.userName" @error="onAvatarError" />
          <fa-icon v-else icon="user" />
        </router-link>
        <login-button v-else class="top-bar-btn" :aria-label="$gettext('Se connecter')">
          <fa-icon icon="user" />
        </login-button>
      </div>
    </template>
  </header>
</template>

<script>
import LogoCtc from './LogoCtc.vue';

import forum from '@/js/apis/forum';

// Routes considered "tabs" — the ones the BottomNav (or
// ForumBottomNav) sits on top of. On these, the top-bar shows the
// logo + no back arrow. Add the forum tab routes here so their
// header matches the top-level tabs of the topoguide world.
const TAB_ROUTES = new Set(['topoguide', 'home', 'offline', 'me', 'more', 'forum', 'forum-categories', 'forum-search']);
// Static — used as a v-for source. No reactive deps, no need for a
// per-render computed. Hoisted to module scope.
const ADDABLE_TYPES = ['outing', 'route', 'waypoint', 'article', 'book', 'xreport'];

export default {
  name: 'MobileTopBar',

  components: { LogoCtc },

  props: {
    transparent: { type: Boolean, default: false },
  },

  data() {
    return {
      searchOpen: false,
      // Fall back to the generic fa-icon when the <img> fails (404,
      // network, CORS on the actual bitmap). Reset when the URL
      // changes so a fresh template gets a fresh loading attempt.
      avatarFailed: false,
      // Discourse unread-notifications count, driving the top-bar
      // bell badge on /forum/*. Refreshed on route change into the
      // forum tree so it stays honest without a periodic poller.
      unreadNotifCount: 0,
    };
  },

  computed: {
    routeName() {
      return this.$route?.name || '';
    },

    showBack() {
      // Always show back on non-tab routes. goBack() falls back to push
      // home when history is empty, so we no longer need the unreliable
      // window.history.length check (which counted across the whole tab
      // session — false positives on fresh tab opens at deep URLs).
      return !TAB_ROUTES.has(this.routeName);
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
        forum: this.$gettext('Camptocamp'),
        'forum-category': this.$gettext('Camptocamp'),
        'forum-topic': this.$gettext('Camptocamp'),
        'forum-user': this.$gettext('Camptocamp'),
        'forum-categories': this.$gettext('Camptocamp'),
        'forum-search': this.$gettext('Camptocamp'),
        'outings-stats': this.$gettext('Statistiques'),
        'sophie-picture-contest': this.$gettext('Concours photo'),
        'associations-history': this.$gettext('Historique des associations'),
        itinevert: this.$gettext('Itinevert'),
      };
      return titles[this.routeName] || 'Camptocamp';
    },

    addableTypes() {
      return ADDABLE_TYPES;
    },

    // Route the top-right shortcut points to. On forum pages we open
    // the Discourse profile — mirrors the two-nav split of the web
    // site (forum.camptocamp.org has its own avatar in its own top
    // bar). If we don't have a forum username, fall back to /me so
    // the icon never leads to a dead route.
    isForumRoute() {
      return this.routeName.startsWith('forum');
    },
    profileShortcutTo() {
      if (this.isForumRoute && this.$user.forumUsername) {
        return { name: 'forum-user', params: { username: this.$user.forumUsername } };
      }
      return { name: 'me' };
    },
    profileShortcutLabel() {
      return this.isForumRoute && this.$user.forumUsername
        ? this.$gettext('Mon profil forum')
        : this.$gettext('Mon compte');
    },
    // Discourse avatar for the current user (same picture the site
    // displays via SSO). Null while the async fetch is still in flight
    // on first login — the <fa-icon> falls back visually.
    myAvatarUrl() {
      return this.$user.avatarUrl?.(48) || null;
    },
  },

  watch: {
    $route() {
      // Auto-close the search panel whenever the user navigates.
      this.searchOpen = false;
      // Refresh the notifications badge whenever the user lands on
      // the forum world — cheap poll piggy-backed on navigation
      // rather than a periodic timer that fires forever.
      this.refreshUnreadNotifs();
    },
    // A fresh URL means a fresh loading attempt — clear the failed
    // flag so we don't stay on the fa-icon fallback after a valid
    // template arrives later.
    myAvatarUrl() {
      this.avatarFailed = false;
    },
  },

  mounted() {
    this.refreshUnreadNotifs();
  },

  methods: {
    onAvatarError() {
      // eslint-disable-next-line no-console
      console.warn('[MobileTopBar] avatar image failed to load:', this.myAvatarUrl);
      this.avatarFailed = true;
    },

    // Fetch the unread notification count from Discourse. Skipped
    // silently when the user isn't logged in or we're not in the
    // forum tree (Discourse's session cookie may not be there,
    // and the badge is only visible on /forum/* anyway).
    async refreshUnreadNotifs() {
      if (!this.$user?.isLogged || !this.isForumRoute) {
        this.unreadNotifCount = 0;
        return;
      }
      try {
        const res = await forum.getNotifications({ recent: true, limit: 30 }).promise_;
        const list = res?.data?.notifications || [];
        this.unreadNotifCount = list.filter((n) => !n.read).length;
      } catch {
        // 401 (not logged into Discourse), CORS, offline — silent.
        this.unreadNotifCount = 0;
      }
    },

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

.top-bar-avatar {
  overflow: hidden;
  padding: 2px;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }

  // Match camptocamp.org's convention: the wiki avatar is round, the
  // forum avatar is square (a small rounded square) so the user
  // instantly sees which side of the site they're on. Same rule
  // applies to the fallback fa-icon glyph so the shape reads even
  // before the Discourse avatar_template resolves.
  &.is-forum {
    padding: 3px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.05);
    img {
      border-radius: 4px;
    }
  }
}

// Forum notification bell — floating badge in the top-right of the
// bell icon showing the unread-notif count. Kept small so it doesn't
// crowd the neighbouring avatar shortcut.
.top-bar-bell {
  position: relative;
}
.top-bar-bell-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #ff9933;
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 0 0 2px white;
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
  &:hover {
    background: #e6791f;
    color: white;
  }
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
  ::v-deep .add-trigger:hover {
    background: #3ec46d;
  }
  ::v-deep .dropdown-menu {
    z-index: 30;
  }
}

.search-wrap {
  flex: 1;
  display: flex;
  align-items: center;

  ::v-deep .input,
  ::v-deep input[type='search'],
  ::v-deep input[type='text'] {
    width: 100%;
    height: 36px;
    font-size: 16px; // prevents iOS auto-zoom
  }
}
</style>
