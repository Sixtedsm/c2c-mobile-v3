import Vue from 'vue';
import Router from 'vue-router';

import config from '@/js/config';
import constants from '@/js/constants';
// Task 3 (latency): synchronously import only the views the user is
// likely to hit during the first 30 seconds — Home (Récent), the four
// big-doc detail views (RouteView/OutingView/WaypointView/XreportView),
// DocumentsView (used by every listing route), OfflineView (Mes topos),
// MoreView and MeView (BottomNav). Everything else lazy-loads on demand
// so the initial JS bundle stops dragging the cold start.
import DocumentsView from '@/views//documents/DocumentsView';
import MoreView from '@/views/MoreView';
import OutingView from '@/views/document/OutingView';
import RouteView from '@/views/document/RouteView';
import WaypointView from '@/views/document/WaypointView';
import XreportView from '@/views/document/XreportView';
import OfflineView from '@/views/offline/OfflineView';
import HomeView from '@/views/portals/HomeView';
import NotFoundView from '@/views/static-views/NotFoundView';
import MeView from '@/views/user/MeView';

// Lazy-import wrapper with automatic retries. Chunk fetches transiently
// fail all the time on mobile — the SW cache is cold, the network
// hiccups for one RTT, a captive-portal probe is running, whatever.
// Vue Router 3 surfaces those failures via router.onError with no way
// to retry the pending navigation cleanly, so we retry the import
// itself: 2 additional attempts, 400 ms then 900 ms apart. Only if
// all three attempts fail does the error bubble up to router.onError
// (which then shows a toast — see App.vue warmCriticalChunks). Every
// `component: lazy(() => import(...))` in this file is wrapped so no
// route is left unprotected. Cost: a few bytes and a maybe-100-ms
// delay when the very first attempt was going to succeed anyway
// (we DO await it before returning, so nothing changes for the
// happy path — the retries only run on failure).
const lazy =
  (importer, attempts = 3) =>
  async () => {
    const delaysMs = [0, 400, 900];
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      if (delaysMs[i]) await new Promise((r) => setTimeout(r, delaysMs[i]));
      try {
        return await importer();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };

// Rarely-visited or post-login views — lazy chunks so they don't bloat
// the initial bundle. Grouped into a few named chunks for cache reuse.
const AreaView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/AreaView'));
const ArticleView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ArticleView'));
const BookView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/BookView'));
const ImageView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ImageView'));
const MapView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/MapView'));
const ProfileView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ProfileView'));
const DocumentsPrintingView = lazy(() =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/documents/DocumentsPrintingView')
);
const ItinevertView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/portals/ItinevertView.vue'));
const SophiePictureContestView = lazy(() =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/portals/SophiePictureContestView')
);
const OutingsStatsView = lazy(() =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/portals/outings-stats/OutingsStatsView')
);
const SeracView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/static-views/SeracView'));
const TopoguideView = lazy(() => import(/* webpackChunkName: "view-secondary" */ '@/views/static-views/TopoguideView'));

// Auth / account views — gated behind auth most of the time.
const AccountView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/AccountView'));
const AppSettingsView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/AppSettingsView'));
const FollowingView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/FollowingView'));
const LoginView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/LoginView'));
const PreferencesView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/PreferencesView'));
const TrackersExchangeTokenView = lazy(() =>
  import(/* webpackChunkName: "view-account" */ '@/views/user/TrackersExchangeTokenView')
);
const TrackersView = lazy(() => import(/* webpackChunkName: "view-account" */ '@/views/user/TrackersView'));

// lazy-load components
// actually, only diff is quite big, because of diff computation
// but lets group together this three views.
const AreaEditionView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/AreaEditionView'));
const ArticleEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ArticleEditionView')
);
const BookEditionView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/BookEditionView'));
const ImageEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ImageEditionView')
);
const MapEditionView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/MapEditionView'));
const OutingEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/OutingEditionView')
);
const ProfileEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ProfileEditionView')
);
const RouteEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/RouteEditionView')
);
const WaypointEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/WaypointEditionView')
);
const XreportEditionView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/XreportEditionView')
);
const WhatsNewView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/WhatsNewView.vue`));
const HistoryView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/HistoryView.vue`));
const AssociationsHistoryView = lazy(() =>
  import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/AssociationsHistoryView.vue`)
);
const DiffView = lazy(() => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/DiffView.vue`));
const YetiView = lazy(() => import(/* webpackChunkName: "yeti" */ `@/views/portals/YetiView.vue`));

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/topoguide', name: 'topoguide', component: TopoguideView },
  { path: '/itinevert', name: 'itinevert', component: ItinevertView },
  { path: '/serac', name: 'serac', component: SeracView },
  { path: '/whatsnew', name: 'whatsnew', component: WhatsNewView },
  { path: '/associations-history', name: 'associations-history', component: AssociationsHistoryView },
  { path: '/auth', name: 'auth', component: LoginView },
  { path: '/auth-sso', name: 'auth-sso', component: LoginView },
  { path: '/account', name: 'account', component: AccountView, meta: { requiresAuth: true } },
  { path: '/following', name: 'following', component: FollowingView, meta: { requiresAuth: true } },
  { path: '/preferences', name: 'preferences', component: PreferencesView, meta: { requiresAuth: true } },
  { path: '/trackers', name: 'trackers', component: TrackersView, meta: { requiresAuth: true } },
  {
    path: '/trackers/:vendor/exchange-token',
    name: 'trackers-exchange-token',
    component: TrackersExchangeTokenView,
    meta: { requiresAuth: true },
  },
  { path: '/yeti/:document_id(\\d+)?/:page?', name: 'yeti', component: YetiView },
  { path: '/outings-stats', name: 'outings-stats', component: OutingsStatsView },
  { path: '/sophie-picture-contest/:year(\\d+)?', name: 'sophie-picture-contest', component: SophiePictureContestView },
  { path: '/offline', name: 'offline', component: OfflineView },
  { path: '/more', name: 'more', component: MoreView },
  { path: '/me', name: 'me', component: MeView },
  { path: '/app-settings', name: 'app-settings', component: AppSettingsView },

  // V3 native forum client (Discourse JSON API). Stays inside the app
  // instead of redirecting to forum.camptocamp.org.
  {
    path: '/forum',
    name: 'forum',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumView')),
  },
  {
    path: '/forum/c/:slug/:id(\\d+)',
    name: 'forum-category',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumCategoryView')),
    props: true,
  },
  {
    path: '/forum/t/:id(\\d+)/:slug?',
    name: 'forum-topic',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumTopicView')),
    props: true,
  },
  {
    path: '/forum/u/:username',
    name: 'forum-user',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumUserView')),
    props: true,
  },
  {
    // Dedicated categories page — landing route for the "Catégories"
    // tab of the forum bottom-nav. Same data as the categories block
    // on /forum, but full screen with its own active state.
    path: '/forum/categories',
    name: 'forum-categories',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumCategoriesView')),
  },
  {
    // Dedicated search page — landing route for the "Rechercher" tab
    // of the forum bottom-nav. Query survives in the URL (?q=…) so
    // the search is shareable and reload-safe.
    path: '/forum/search',
    name: 'forum-search',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumSearchView')),
  },
  {
    // Full-screen "new topic" composer. Optional ?category=<id> to
    // pre-select a category (used by the FAB button when the user is
    // browsing a specific category).
    path: '/forum/new-topic',
    name: 'forum-new-topic',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumNewTopicView')),
    meta: { requiresAuth: true },
  },
  {
    // User's own bookmarks — the Discourse "sauvegardés" inbox.
    path: '/forum/bookmarks',
    name: 'forum-bookmarks',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumBookmarksView')),
    meta: { requiresAuth: true },
  },
  {
    // Notifications inbox (the bell in the top bar links here).
    path: '/forum/notifications',
    name: 'forum-notifications',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumNotificationsView')),
    meta: { requiresAuth: true },
  },
  {
    // Topics carrying a given Discourse tag. Landing route for the
    // "Étiquettes populaires" pills on ForumView and the tag pills on
    // TopicRow. Tag name lives in the URL segment (no id — Discourse
    // uses the tag name itself as the key).
    path: '/forum/tag/:tag',
    name: 'forum-tag',
    component: lazy(() => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumTagView')),
    props: true,
  },
];

const addDocumentTypeView = function (def, viewComponent, editionComponent) {
  routes.push({
    path: '/' + def.documentType + 's',
    name: def.documentType + 's',
    component: DocumentsView,
  });

  routes.push({
    path: '/' + def.documentType + 's/print',
    name: def.documentType + 's-print',
    component: DocumentsPrintingView,
  });

  routes.push({
    path: '/' + def.documentType + 's/:id(\\d+)/:lang?/:title?',
    name: def.documentType,
    component: viewComponent,
  });

  routes.push({
    path: '/' + def.documentType + 's/version/:id(\\d+)/:lang/:version',
    name: def.documentType + '-version',
    component: viewComponent,
  });

  routes.push({
    path: '/' + def.documentType + 's/history/:id(\\d+)/:lang',
    name: def.documentType + '-history',
    component: HistoryView,
  });

  routes.push({
    path: '/' + def.documentType + 's/edit/:id(\\d+)/:lang',
    name: def.documentType + '-edit',
    component: editionComponent,
    meta: { requiresAuth: true },
  });

  routes.push({
    path: '/' + def.documentType + 's/add/:lang',
    name: def.documentType + '-add',
    component: editionComponent,
    meta: { requiresAuth: true },
  });

  routes.push({
    path: '/' + def.documentType + 's/diff/:id(\\d+)/:lang/:versionFrom/:versionTo',
    name: def.documentType + '-diff',
    component: DiffView,
  });
};

addDocumentTypeView(constants.objectDefinitions.area, AreaView, AreaEditionView);
addDocumentTypeView(constants.objectDefinitions.article, ArticleView, ArticleEditionView);
addDocumentTypeView(constants.objectDefinitions.book, BookView, BookEditionView);
addDocumentTypeView(constants.objectDefinitions.image, ImageView, ImageEditionView);
addDocumentTypeView(constants.objectDefinitions.map, MapView, MapEditionView);
addDocumentTypeView(constants.objectDefinitions.outing, OutingView, OutingEditionView);
addDocumentTypeView(constants.objectDefinitions.profile, ProfileView, ProfileEditionView);
addDocumentTypeView(constants.objectDefinitions.route, RouteView, RouteEditionView);
addDocumentTypeView(constants.objectDefinitions.waypoint, WaypointView, WaypointEditionView);
addDocumentTypeView(constants.objectDefinitions.xreport, XreportView, XreportEditionView);

routes.push({ path: '*', name: '404', component: NotFoundView });

Vue.use(Router);

const router = new Router({
  routes,
  mode: config.routerMode,

  scrollBehavior(to, from, savedPosition) {
    // https://router.vuejs.org/guide/advanced/scroll-behavior.html#scroll-behavior
    // and
    // https://github.com/vuejs/vue-router/blob/dev/examples/scroll-behavior/app.js

    let position = {};

    if (to.hash) {
      // actually, scroll behavior is not fired at initial load
      // so let document-view-mixin handle hash use case, as it's the
      // only use case for a new-born tab
      // See https://github.com/vuejs/vue-router/issues/2358

      // when it will be fixed, remove scrollToHash function, and simply replace the return by this two lines :

      //   position.selector = to.hash;
      //   position.offset = { y: 50 }; // navbar height

      return false;
    } else if (savedPosition) {
      position = savedPosition;
    } else {
      // don't need to wait any data, scroll to top
      return { x: 0, y: 0 };
    }

    // we'll wait for trigger-scroll event
    return new Promise((resolve) => {
      // we add an once handler on the event
      // view will trigger it once data are present
      this.app.$root.$once('trigger-scroll', () => {
        resolve(position);
      });
    });
  },
});

// authentication guard
router.beforeEach((to, from, next) => {
  const vm = router.app;
  if (to.matched.some((record) => record.meta.requiresAuth) && !vm.$user.isLogged) {
    next({ name: 'auth', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});

export default router;
