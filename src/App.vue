<template>
  <div
    id="app"
    :class="{
      'nav-dfm': !homePage() && !$screen.isMobile && !$screen.isTablet && !$screen.isDesktop,
      'home-topoguide': homePage(),
    }"
  >
    <side-menu class="side-menu no-print" :class="{ 'alternative-side-menu': alternativeSideMenu }" />
    <navigation class="navigation no-print" @toggle-side-menu="alternativeSideMenu = !alternativeSideMenu" />
    <div v-if="!$offline.online && !offlineBannerDismissed" class="offline-banner no-print" role="status">
      <router-link :to="{ name: 'offline' }" class="offline-banner-link">
        <fa-icon icon="plug" />
        <span>&nbsp;{{ $gettext('Offline — open my saved topos') }}</span>
      </router-link>
      <button
        class="delete is-small offline-banner-close"
        :aria-label="$gettext('Dismiss')"
        @click="offlineBannerDismissed = true"
      ></button>
    </div>
    <dfm-ad-small v-if="!homePage() && ($screen.isMobile || $screen.isTablet || $screen.isDesktop)" class="ad" />
    <site-notice ref="siteNotice" class="no-print site-notice" />
    <image-viewer ref="imageViewer" />
    <helper-window ref="helper" />
    <alert-window ref="alertWindow" />
    <div v-if="alternativeSideMenu" class="alternative-side-menu-shader" @click="alternativeSideMenu = false" />

    <!-- V3 mobile top bar — sticky title + back button. Replaces the V1
         desktop navbar (hidden by the mobile-shell CSS below). Not
         rendered when the user forced the desktop shell via
         MoreView's "Version ordinateur" toggle. -->
    <mobile-top-bar v-if="!isDesktopShell" />

    <!-- keep router view in last -->
    <div class="page-content is-block-print">
      <!-- Slide-fade transition on route change (#8). Only the entering
           view animates (translate + fade in); leaving view disappears
           instantly — avoids two views overlapping inside the
           position-absolute scroll container and the layout glitches
           that come with it. Keying by $route.name means filter/query
           updates (same component, different querystring) don't replay
           the animation — only real navigation does. -->
      <transition name="route-slide">
        <router-view class="router-view" :key="$route.name || $route.path" />
      </transition>
    </div>
    <gdpr-banner></gdpr-banner>
    <!-- Two coherent worlds, two coherent bars: BottomNav for the
         topoguide tree, ForumBottomNav for the /forum tree. Never
         both, never neither. In desktop shell mode both are skipped
         — the V1 SideMenu owns navigation there. -->
    <bottom-nav v-if="!isDesktopShell && !isForumRoute" />
    <forum-bottom-nav v-if="!isDesktopShell && isForumRoute" />
    <onboarding-tour />
    <pull-to-refresh />
    <outing-session-banner v-if="!isDesktopShell" />
  </div>
</template>

<script>
import BottomNav from './components/BottomNav.vue';
import ForumBottomNav from './components/ForumBottomNav.vue';
import MobileTopBar from './components/MobileTopBar.vue';
import OnboardingTour from './components/OnboardingTour.vue';
import OutingSessionBanner from './components/OutingSessionBanner.vue';
import PullToRefresh from './components/PullToRefresh.vue';
import AlertWindow from './components/alert-window/AlertWindow';
import GdprBanner from './components/gdpr/GdprBanner.vue';
import HelperWindow from './components/helper/HelperWindow';
import ImageViewer from './components/image-viewer/ImageViewer';
import DfmAdSmall from './views/DfmAdSmall.vue';
import Navigation from './views/Navigation';
import SideMenu from './views/SideMenu';
import SiteNotice from './views/SiteNotice';

export default {
  name: 'App',

  components: {
    BottomNav,
    ForumBottomNav,
    DfmAdSmall,
    SideMenu,
    Navigation,
    SiteNotice,
    HelperWindow,
    ImageViewer,
    AlertWindow,
    GdprBanner,
    MobileTopBar,
    OnboardingTour,
    OutingSessionBanner,
    PullToRefresh,
  },

  data() {
    return {
      alternativeSideMenu: false,
      offlineBannerDismissed: false,
      // Per-route scroll positions inside .page-content. Lets a user open
      // a topo, hit Back, and land exactly where they were in the list.
      scrollPositions: Object.create(null),
      // Reactive echo of the app-wide viewport bucket so `isDesktopShell`
      // (below) recomputes on resize. Kept in sync by updateWidth().
      widthBucket: 'mobile',
    };
  },

  computed: {
    // Should the fork render the V1 desktop shell (SideMenu + top
    // Navigation, no BottomNav) instead of the V3 mobile shell?
    // 'desktop' / 'mobile' from appSettings force it; 'auto' defers
    // to the current viewport bucket.
    isDesktopShell() {
      const mode = this.$appSettings?.state?.shellMode;
      if (mode === 'desktop') return true;
      if (mode === 'mobile') return false;
      return this.widthBucket === 'desktop';
    },

    // True whenever the current route is a forum page. Drives the
    // BottomNav vs ForumBottomNav split so the app hosts two
    // coherent worlds side-by-side. Any route name starting with
    // "forum" counts (forum, forum-category, forum-topic,
    // forum-user, forum-categories, forum-search).
    isForumRoute() {
      const name = this.$route?.name || '';
      return name === 'forum' || name.startsWith('forum-');
    },
  },

  watch: {
    $route: 'hideSideMenuOnMobile',
    '$offline.online'(isOnline) {
      // Reset the dismissed state when the user goes back online so the banner
      // shows again if they lose connection a second time.
      if (isOnline) {
        this.offlineBannerDismissed = false;
      }
    },
  },

  mounted() {
    document.getElementById('splashscreen').style.display = 'none';
    this.updateWidth();
    window.addEventListener('resize', this.updateWidth);

    // Per-route scroll restoration on the .page-content scroll surface.
    // Vue Router's built-in scrollBehavior operates on window, but we
    // moved scroll to the inner container — so we wire it up by hand.
    this.removeBeforeEach = this.$router.beforeEach((to, from, next) => {
      const el = document.querySelector('.page-content');
      if (el) this.scrollPositions[from.fullPath] = el.scrollTop;
      next();
    });
    this.removeAfterEach = this.$router.afterEach((to) => {
      this.$nextTick(() => {
        const el = document.querySelector('.page-content');
        if (el) el.scrollTop = this.scrollPositions[to.fullPath] || 0;
      });
    });

    this.warmCriticalChunks();
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.updateWidth);
    if (this.removeBeforeEach) this.removeBeforeEach();
    if (this.removeAfterEach) this.removeAfterEach();
  },

  methods: {
    hideSideMenuOnMobile() {
      this.alternativeSideMenu = false;
    },

    // Lazy-loaded routes (router.js) split the bundle into chunks that
    // load on demand. That's fine online, but a user who has never
    // visited the edit views and then goes offline can't open them —
    // the chunk fetch fails silently and the navigation hangs. We warm
    // the critical chunks (outing creation in particular: deferred-sync
    // depends on it) once the browser is idle so they're cached by the
    // SW for offline use.
    warmCriticalChunks() {
      const warm = () => {
        // Pull one component from each named chunk we ship — webpack
        // hydrates the whole chunk into the SW cache in one go, so
        // any later navigation into that chunk hits a warm cache
        // instead of racing the network. wiki-tools is required by
        // the offline outing queue (#21); view-account is the login
        // path; forum is the one Sixte tapped into and hit a cold-
        // chunk load-error on 2026-09-02 — warming it here removes
        // the transient "not available offline" toast on the first
        // /forum navigation.
        import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/OutingEditionView').catch(() => {});
        import(/* webpackChunkName: "view-account" */ '@/views/user/LoginView').catch(() => {});
        import(/* webpackChunkName: "forum" */ '@/views/forum/ForumView').catch(() => {});
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(warm, { timeout: 5000 });
      } else {
        setTimeout(warm, 2000);
      }

      // Network-failed lazy imports reject silently and the navigation
      // just hangs. Surface it, but stay honest about the cause: the
      // chunk load can fail for many reasons (real offline, transient
      // CDN issue, service-worker cache miss on a stale build) — the
      // old wording accused the user of being offline even when they
      // weren't, which was noisy. If we can, ping the network to give
      // the user a specific diagnosis.
      this.$router.onError((error) => {
        const msg = error?.message || '';
        if (!/Loading chunk|ChunkLoadError|Failed to fetch/i.test(msg)) return;
        import('bulma-toast').then(({ toast }) => {
          // If $offline plugin says we're offline (real ping-verified
          // check now), tell the user that. Otherwise say it's a load
          // hiccup — usually resolves by tapping the link again.
          const looksOffline = this.$offline && this.$offline.online === false;
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4000,
            message: looksOffline
              ? this.$gettext(
                  "Cette page n'est pas encore disponible hors-ligne. Reconnectez-vous au réseau et réessayez."
                )
              : this.$gettext('Chargement de la page interrompu. Réessayez dans un instant.'),
          });
        });
      });
    },
    updateWidth() {
      // allows reactive css when body width changes because map is pinned
      // (unlike the css @media(max-width) this is replacing)

      const bulmaBreakpoints = {
        tablet: 769,
        desktop: 1024,
        widescreen: 1216,
        fullhd: 1408,
      };
      const width = this.$el.offsetWidth;
      let bucket;
      if (width <= bulmaBreakpoints.tablet) {
        bucket = 'mobile';
      } else if (width <= bulmaBreakpoints.desktop) {
        bucket = 'tablet';
      } else {
        bucket = 'desktop';
      }
      this.$el.dataset.width = bucket;
      // Mirror into reactive data so `isDesktopShell` recomputes on
      // resize (dataset writes don't trigger Vue reactivity).
      this.widthBucket = bucket;
    },
    homePage() {
      if (this.$route.path === '/home' || this.$route.path === '/') {
        return true;
      } else {
        return false;
      }
    },
  },
};
</script>

<style lang="scss">
$body-height: calc(100vh - #{$navbar-height});

// V3 native-app feel: html/body lock at 100% height, no scroll on the
// document itself. The page-content below scrolls independently so the
// MobileTopBar and BottomNav stay nailed in place during navigation.
html {
  overflow: hidden;
  height: 100%;
  text-rendering: optimizeLegibility;
  text-size-adjust: 100%;
  // color-scheme is set dynamically by the appSettings plugin from
  // localStorage (light/dark/auto). Default light keeps prior behavior
  // when the plugin hasn't run yet (first paint before JS).
  color-scheme: light;

  // Text size preference (#6) — applied as data-text-size on <html>.
  // Bulma's $body-size (variables.scss) sets html { font-size: 14px }
  // out of the box, so "small" at 14px was indistinguishable from the
  // default and "normal" (no override) silently fell back to 14px too —
  // only "large" was visibly different. Explicit values now, with clear
  // 2/4 px gaps so each step actually shifts the rem-based UI.
  &[data-text-size='small'] {
    font-size: 12px;
  }
  &[data-text-size='normal'] {
    font-size: 14px;
  }
  &[data-text-size='large'] {
    font-size: 18px;
  }
}

// Dark theme (#4) — html[data-theme='dark'] selector out-specifies
// scoped component styles (whose attribute selector .class[data-v-xxx]
// has the same specificity as a class without an element prefix). We
// paint both the V3 shell AND the V1 content surfaces so dark mode
// looks coherent end-to-end — the original "shell-only" approach left
// every feed card glaring white in dark mode and was rejected.
// Approach: remap Bulma's white backgrounds (.card, .box) and the
// generic text colors to a dark palette; keep the orange/blue accents
// intact. Specific V1 surfaces that bake their own colors get spot
// fixes below.
html[data-theme='dark'] {
  body {
    background: #1a1a1a;
    color: #f0f0f0;
  }
  .page-content {
    background: #1a1a1a;
    color: #f0f0f0;
  }
  // Top bar
  .mobile-top-bar {
    background: #232323;
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }
  .top-bar-btn,
  .top-bar-title {
    color: #e5e5e5;
  }
  .top-bar-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }
  // Bottom nav
  .bottom-nav {
    background: #232323;
    border-top-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.4);
  }
  .bottom-nav-link {
    color: #8a8a8a;
    &:hover,
    &:focus {
      color: #ccc;
    }
    &.is-active {
      color: #ff9933;
    }
  }
  // Recolor the pending-sync badge halo to match the dark bottom nav
  // — keeps the orange dot from getting a white ring against #232323.
  .bottom-nav-badge {
    box-shadow: 0 0 0 2px #232323;
  }
  // MeView dashboard
  .me-view .me-header,
  .me-view .action-link {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e5e5;
  }
  .me-view .me-display-name {
    color: #f5f5f5;
  }
  .me-view .me-username,
  .me-view .action-desc,
  .me-view .section-label,
  .me-view .footer-links {
    color: #9a9a9a;
  }
  .me-view .action-icon {
    background: #3a2f1a;
  }
  .me-view .footer-links {
    border-top-color: rgba(255, 255, 255, 0.1);
  }
  .me-view .action-link:hover,
  .me-view .action-link:focus {
    color: #f5f5f5;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  // MoreView tiles
  .more-view .tile-link {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e5e5;
    &:hover,
    &:focus {
      color: #f5f5f5;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }
  }
  .more-view .tile-icon {
    background: #3a2f1a;
  }
  .more-view .subtitle,
  .more-view .tile-desc {
    color: #9a9a9a;
  }
  // Empty state (DocumentsView)
  .documents-view .empty-state {
    color: #9a9a9a;
  }

  // V3 mobile map quick-toggle pill — keep readable on dark
  .ol-control-quick-layers {
    background: rgba(40, 40, 40, 0.92);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    button {
      color: #e5e5e5;
      &:hover {
        background: rgba(255, 255, 255, 0.08);
      }
    }
  }

  // ── V1 content surfaces ────────────────────────────────────────────
  // Bulma .card (FeedCard, DocumentCard wrappers, OutingCard etc.)
  // Card text contrast: V1 scoped CSS on .card-row (CardRow.vue) and
  // FeedCard `.row` hardcode `color: $text` (#4a4a4a from Bulma) which
  // disappears on a dark card. The `.card div` rule below + the
  // html[data-theme='dark'] prefix gives us a (0,1,2) specificity that
  // beats the (0,1,1) of scoped `div[data-v-xxx] { color: ... }`, so
  // every descendant inherits the light text. Same trick for the feed
  // author/info rows.
  .card {
    background: #2a2a2a;
    color: #f0f0f0;
    border-color: rgba(255, 255, 255, 0.08);
  }
  // Pressed / hover / highlighted states (CardContainer.vue scoped):
  // V1 forces a near-white `$hover-background` (#f2f2f2). That made
  // the card unreadable on tap because the text stayed white. Override
  // with a slightly-lifted dark shade and keep the existing box-shadow.
  // Specificity bump: html[data-theme] + .card:hover[data-v-xxx]
  // matches (0,2,2) vs the scoped (0,2,1).
  .card:hover,
  .card:focus,
  .card:active,
  .card.is-highlighted {
    background: #353535;
    color: #f5f5f5;
  }
  .card div,
  .card p,
  .card span,
  .card
    a:not(.button):not(.tag):not(.has-text-primary):not(.has-text-info):not(.has-text-link):not(.has-text-success):not(
      .has-text-warning
    ):not(.has-text-danger) {
    color: #f0f0f0;
  }
  .card .has-text-grey,
  .card .has-text-grey-light,
  .card .has-text-grey-dark {
    color: #c5c5c5 !important;
  }
  .card-content,
  .card-header,
  .card-footer {
    background: transparent;
  }
  .card-footer {
    border-top-color: rgba(255, 255, 255, 0.08);
  }
  .card-footer-item {
    border-right-color: rgba(255, 255, 255, 0.08);
  }
  // FeedCard alternating row separator (Bulma .card-content + custom .row)
  .feed-card .row,
  .feed-card .columns:not(:last-child) {
    border-color: rgba(255, 255, 255, 0.06);
  }
  .feed-card .row,
  .feed-card .row * {
    color: #f0f0f0;
  }

  // .box (used in document detail boxes, profile sidebar, etc.)
  .box {
    background: #2a2a2a;
    color: #e5e5e5;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  // Generic text utilities (Bulma) — bumped a few stops up from the
  // initial pass so dim labels (timestamps, "added an outing" hint
  // text, distance/elevation metadata) actually read on dark cards.
  .has-text-grey-darker,
  .has-text-grey-dark,
  .has-text-dark,
  .has-text-black {
    color: #f0f0f0 !important;
  }
  .has-text-grey {
    color: #c5c5c5 !important;
  }
  .has-text-grey-light {
    color: #a0a0a0 !important;
  }

  // Background utilities (Bulma)
  .has-background-light,
  .has-background-white {
    background-color: #2a2a2a !important;
  }
  .has-background-white-print {
    background-color: transparent !important;
  }

  // Tags (Bulma)
  .tag:not(.is-primary):not(.is-info):not(.is-success):not(.is-warning):not(.is-danger) {
    background: #3a3a3a;
    color: #e5e5e5;
  }
  .tag.is-light {
    background: #3a3a3a !important;
    color: #d5d5d5 !important;
  }

  // Notifications — invert the light "info" panel that V1 uses on edit
  // forms and "no result" boxes.
  .notification {
    background: #2f2f2f;
    color: #e5e5e5;
  }
  .notification.is-info {
    background: #1e3a5f;
    color: #d8e6f5;
  }
  .notification.is-warning {
    background: #5a4a1f;
    color: #f5e8c8;
  }
  .notification.is-danger {
    background: #5a2222;
    color: #f5d6d6;
  }

  // Titles / subtitles (Bulma) — keep them visible
  .title {
    color: #f5f5f5;
  }
  .subtitle {
    color: #b5b5b5;
  }

  // Forms (Bulma inputs/selects/textareas)
  .input,
  .textarea,
  .select select {
    background: #1f1f1f;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
    &::placeholder {
      color: #6b6b6b;
    }
    &:focus {
      border-color: #ff9933;
      box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.25);
    }
  }
  .label {
    color: #e5e5e5;
  }
  .help {
    color: #9a9a9a;
  }

  // Buttons — only the "light" / "text" / undecorated variants need a
  // dark surface; .is-primary/.is-info etc. already pop against any bg.
  .button:not(.is-primary):not(.is-info):not(.is-success):not(.is-warning):not(.is-danger):not(.is-link) {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
    &:hover,
    &:focus {
      background: #353535;
      color: #fff;
      border-color: rgba(255, 255, 255, 0.25);
    }
  }
  .button.is-text {
    background: transparent;
    color: #e5e5e5;
    &:hover,
    &:focus {
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
    }
  }
  .button.is-light {
    background: #2a2a2a !important;
    color: #e5e5e5 !important;
  }

  // Dropdowns (Bulma) — used in DocumentsView document-type picker, etc.
  .dropdown-content {
    background: #2a2a2a;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
  .dropdown-item {
    color: #e5e5e5;
    &:hover,
    &.is-active {
      background: #3a3a3a;
      color: #fff;
    }
  }
  .dropdown-divider {
    background-color: rgba(255, 255, 255, 0.08);
  }

  // Modals (Bulma)
  .modal-card-head,
  .modal-card-foot {
    background: #232323;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .modal-card-body {
    background: #2a2a2a;
    color: #e5e5e5;
  }
  .modal-card-title {
    color: #f5f5f5;
  }
  .modal-background {
    background-color: rgba(0, 0, 0, 0.7);
  }

  // Tabs
  .tabs a {
    color: #b5b5b5;
    border-bottom-color: rgba(255, 255, 255, 0.15);
  }
  .tabs li.is-active a {
    color: #ff9933;
    border-bottom-color: #ff9933;
  }

  // Tables — V1 WhatsNew, AssociationsHistory etc.
  table,
  .table {
    background: transparent;
    color: #e5e5e5;
  }
  .table th {
    background: #232323;
    color: #f5f5f5;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .table td {
    border-color: rgba(255, 255, 255, 0.06);
  }
  .table tr:hover td {
    background: rgba(255, 255, 255, 0.04);
  }

  // V1 ag-grid table (DocumentsView list mode) — its CSS is loaded
  // by the data-table chunk and uses a fixed light palette. Override
  // the surfaces and text so it doesn't burn the user's eyes.
  .ag-theme-balham {
    --ag-background-color: #2a2a2a;
    --ag-header-background-color: #232323;
    --ag-odd-row-background-color: #2a2a2a;
    --ag-foreground-color: #e5e5e5;
    --ag-header-foreground-color: #f5f5f5;
    --ag-border-color: rgba(255, 255, 255, 0.08);
    --ag-row-hover-color: rgba(255, 255, 255, 0.05);
    --ag-secondary-foreground-color: #b5b5b5;
  }

  // Offline view surfaces
  .offline-card,
  .pending-outings {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.08);
  }

  // Generic small-text/muted classes used across V1
  .has-text-info,
  .has-text-link {
    color: #6db4ff;
  }

  // Document-detail surfaces (route/outing/waypoint header rows are
  // already inside .card / .box overrides, but the inner separators
  // and dotted lines need a darker contrast).
  hr {
    background-color: rgba(255, 255, 255, 0.08);
  }

  // Markdown content inside topo descriptions
  .markdown-section,
  .markdown-content {
    color: #e5e5e5;
    a {
      color: #6db4ff;
    }
    code {
      background: #1a1a1a;
      color: #ffd17a;
    }
    pre {
      background: #1a1a1a;
    }
    blockquote {
      border-left-color: rgba(255, 255, 255, 0.2);
      color: #b5b5b5;
    }
  }

  // c2c embedded figure widgets — the legendary white blocks in dark
  // mode. Markdown.vue scopes `figure[c2c\:role='embedded-figure']`
  // with #fafafa background + 1px solid #ddd which renders as a white
  // card-on-dark-page (with the caption text turning unreadable). The
  // descendant prefix `.markdown-content` here bumps specificity to
  // (0,2,2), beating the scoped (0,2,1) and applying a dark surface.
  .markdown-content figure[c2c\:role='embedded-figure'],
  .markdown-section figure[c2c\:role='embedded-figure'],
  .topo-cooked figure[c2c\:role='embedded-figure'] {
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e5e5e5;
  }
  .markdown-content figcaption,
  .markdown-section figcaption,
  .topo-cooked figcaption,
  .markdown-content figure,
  .markdown-section figure,
  .topo-cooked figure {
    color: #d5d5d5;
  }
  // The page that surrounds the description sections itself can leak
  // a .section / .container with white background on some V1 views.
  // Cover the common targets so the doc detail pages don't end up
  // half-light.
  .section,
  .documents-view,
  .container {
    background: transparent;
  }
  // Bulma generic `.content` (the wrapper used for cooked markdown
  // sections) inherits text color from .card but its child p / li /
  // span get explicit colors elsewhere. Push them light.
  .content,
  .content p,
  .content li,
  .content blockquote {
    color: #e5e5e5;
  }
  .content h1,
  .content h2,
  .content h3,
  .content h4,
  .content h5,
  .content h6 {
    color: #f5f5f5;
  }
}

html,
body,
#app {
  height: 100%;
  min-height: 0;
}

body {
  overflow: hidden;
}

#app {
  position: relative;
  overflow: hidden;
}

.navigation {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 25;
}

.offline-banner {
  position: fixed;
  top: $navbar-height;
  left: 0;
  right: 0;
  z-index: 24;
  background: hsl(48, 100%, 67%);
  color: hsl(0, 0%, 21%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.15rem 0.6rem;
  font-size: 0.8rem;
  line-height: 1;
  min-height: 1.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);

  .offline-banner-link {
    color: hsl(0, 0%, 21%);
    text-decoration: none;
    flex: 1;
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .offline-banner-close {
    flex-shrink: 0;
  }
}

.side-menu {
  width: $sidemenu-width;
  height: 100vh;
  position: fixed;
  top: 0px;
  z-index: 30;
  transition: 0.3s;
}

.alternative-side-menu-shader {
  z-index: 29;
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.2);
}

.site-notice {
  position: absolute;
  top: $navbar-height;
  width: 100%;
  z-index: 20;
  box-shadow: 0 5px 10px 0px rgba(10, 10, 10, 0.5);
}

// V3 page-content in mobile shell mode: single scroll surface pinned
// between the fixed MobileTopBar and BottomNav. In desktop shell mode
// (opt-in via MoreView → "Version ordinateur") the V1 layout takes
// over and we let its own rules position the content — see the
// `html[data-shell='desktop']` override further down.
html[data-shell='mobile'] .page-content {
  position: absolute;
  top: calc(52px + env(safe-area-inset-top));
  // Bottom nav bumped 52 → 66 px after beta feedback (patapouet, forum
  // 2026-08-10). Top stays at 52 (MobileTopBar unchanged).
  bottom: calc(66px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  // Native-feel: only this surface scrolls. Disable rubber-band bounce
  // outside the content area (some webviews leak it).
  overscroll-behavior: contain;
  display: flex;
  flex-flow: column;
}

// V3 ditches the V1 desktop SideMenu and top Navigation in favor of the
// BottomNav-only shell — but ONLY in mobile shell mode. The desktop
// shell needs the V1 chrome back, so scope the hide to mobile.
@media screen {
  html[data-shell='mobile'] .side-menu,
  html[data-shell='mobile'] .navigation {
    display: none !important;
  }
  // Home-topoguide used to reserve padding for the V1 navbar; not needed
  // on the mobile shell either.
  html[data-shell='mobile'] .home-topoguide .page-content {
    padding-top: 0 !important;
  }
}

// Desktop shell: let the V1 layout breathe. Undo the mobile-shell
// html { overflow: hidden; height: 100% } so the page scrolls the way
// camptocamp.org does, and unlock body scroll too.
html[data-shell='desktop'] {
  overflow: auto;
  height: auto;

  body {
    overflow: auto;
    height: auto;
  }

  #app {
    overflow: visible;
    height: auto;
    min-height: 100vh;
  }
}

// V1 tables (WhatsNew, AssociationsHistory, etc.) are wide desktop layouts.
// Wrap them so they scroll horizontally on small screens instead of pushing
// content off-screen and forcing the whole page to swipe.
.section table,
.page-content table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.home-topoguide {
  .page-content {
    padding-top: $navbar-height;
  }

  .ams-ad {
    margin-left: auto !important;
    padding-top: 0px !important;
  }
}

.nav-dfm {
  $body-height-ad: calc(100vh - #{$navbarad-height});

  html,
  body,
  #app {
    min-height: $body-height-ad;
  }

  .site-notice {
    top: $navbarad-height;
  }

  .page-content {
    padding-top: $navbarad-height;
  }
}

@media screen {
  [data-width='mobile'] {
    .side-menu {
      left: -$sidemenu-width;
    }

    .alternative-side-menu {
      left: 0;
    }

    .page-content,
    .ad {
      margin-left: 0;
    }
    .ad {
      padding-top: $navbar-height;
    }

    .section {
      padding: 0.75rem !important;
    }

    .box:not(:last-child),
    .feed-card {
      margin-bottom: 0.75rem !important;
    }
  }

  [data-width='tablet'] {
    .side-menu {
      left: -$sidemenu-width;
    }

    .alternative-side-menu {
      left: 0;
    }

    .page-content,
    .ad {
      margin-left: 0;
    }

    .ad {
      padding-top: $navbar-height;
    }
  }

  [data-width='desktop'] {
    .side-menu {
      left: 0;
    }
    .page-content,
    .ad {
      margin-left: $sidemenu-width;
    }

    .ad {
      padding-top: $navbar-height;
    }

    .site-notice {
      padding-left: $sidemenu-width;
    }
  }
}

.router-view {
  flex-grow: 1;
}

// Route slide-fade (#8). Subtle 200ms slide-from-bottom + opacity.
// `enter` only — leave is instant to dodge layout flicker inside the
// position-absolute .page-content.
.route-slide-enter-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.route-slide-enter {
  transform: translateY(10px);
  opacity: 0;
}
.route-slide-enter-to {
  transform: translateY(0);
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .route-slide-enter-active {
    transition: none;
  }
  .route-slide-enter {
    transform: none;
  }
}

@media print {
  /* print styles go here */
  .page-content {
    padding-top: 0;
  }

  html {
    font-size: 12px !important;
  }
}

// HomeView "Dashboard / Activity feed" toggle (V1 HomeView.vue) —
// on narrow columns the flex container's `justify-content:
// space-between` shrinks the toggle label enough that its two
// spans wrap onto multiple lines and the pill breaks visually
// (Sixte's report 2026-09-01). Force the toggle to never render
// below its content width and keep the labels on one line. Kept
// in the global App.vue instead of forking HomeView.vue so an
// upstream c2c_ui merge doesn't drop the fix.
.toggleContainer {
  white-space: nowrap;
  min-width: max-content;
  flex-shrink: 0;
}
.toggleContainer > span {
  white-space: nowrap;
}
</style>
