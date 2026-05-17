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
    <site-notice ref="siteNotice no-print" class="no-print site-notice" />
    <image-viewer ref="imageViewer" />
    <helper-window ref="helper" />
    <alert-window ref="alertWindow" />
    <div v-if="alternativeSideMenu" class="alternative-side-menu-shader" @click="alternativeSideMenu = false" />

    <!-- V3 mobile top bar — sticky title + back button. Replaces the V1
         desktop navbar that we hide everywhere via CSS below. -->
    <mobile-top-bar />

    <!-- keep router view in last -->
    <div class="page-content is-block-print">
      <router-view class="router-view" />
    </div>
    <gdpr-banner></gdpr-banner>
    <bottom-nav />
  </div>
</template>

<script>
import AlertWindow from './components/alert-window/AlertWindow';
import BottomNav from './components/BottomNav.vue';
import GdprBanner from './components/gdpr/GdprBanner.vue';
import HelperWindow from './components/helper/HelperWindow';
import ImageViewer from './components/image-viewer/ImageViewer';
import MobileTopBar from './components/MobileTopBar.vue';
import DfmAdSmall from './views/DfmAdSmall.vue';
import Navigation from './views/Navigation';
import SideMenu from './views/SideMenu';
import SiteNotice from './views/SiteNotice';

export default {
  name: 'App',

  components: {
    BottomNav,
    DfmAdSmall,
    SideMenu,
    Navigation,
    SiteNotice,
    HelperWindow,
    ImageViewer,
    AlertWindow,
    GdprBanner,
    MobileTopBar,
  },

  data() {
    return {
      alternativeSideMenu: false,
      offlineBannerDismissed: false,
      // Per-route scroll positions inside .page-content. Lets a user open
      // a topo, hit Back, and land exactly where they were in the list.
      scrollPositions: Object.create(null),
    };
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
      if (width <= bulmaBreakpoints.tablet) {
        this.$el.dataset.width = 'mobile';
      } else if (width <= bulmaBreakpoints.desktop) {
        this.$el.dataset.width = 'tablet';
      } else {
        this.$el.dataset.width = 'desktop';
      }
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
  // Task 11: V3 mirrors the camptocamp.org website which is light-only.
  // Force the light scheme so the browser doesn't auto-darken form inputs,
  // scrollbars or default backgrounds when the OS is in dark mode. Avoids
  // the half-broken dark experience V1 has in places.
  color-scheme: light only;
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

// V3 page-content is the single scroll surface — pinned between the
// fixed MobileTopBar and BottomNav. Everything else (decor) stays put,
// like a native app's main content area.
.page-content {
  position: absolute;
  top: calc(52px + env(safe-area-inset-top));
  bottom: calc(52px + env(safe-area-inset-bottom));
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
// BottomNav-only shell. Hide them everywhere so we don't end up with two
// navigation systems and a duplicated "Plus" entry.
@media screen {
  .side-menu,
  .navigation {
    display: none !important;
  }
  // Home-topoguide used to reserve padding for the V1 navbar; not needed.
  .home-topoguide .page-content {
    padding-top: 0 !important;
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

@media print {
  /* print styles go here */
  .page-content {
    padding-top: 0;
  }

  html {
    font-size: 12px !important;
  }
}
</style>
