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

// Rarely-visited or post-login views — lazy chunks so they don't bloat
// the initial bundle. Grouped into a few named chunks for cache reuse.
const AreaView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/AreaView');
const ArticleView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ArticleView');
const BookView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/BookView');
const ImageView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ImageView');
const MapView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/MapView');
const ProfileView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/document/ProfileView');
const DocumentsPrintingView = () =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/documents/DocumentsPrintingView');
const ItinevertView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/portals/ItinevertView.vue');
const SophiePictureContestView = () =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/portals/SophiePictureContestView');
const OutingsStatsView = () =>
  import(/* webpackChunkName: "view-secondary" */ '@/views/portals/outings-stats/OutingsStatsView');
const SeracView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/static-views/SeracView');
const TopoguideView = () => import(/* webpackChunkName: "view-secondary" */ '@/views/static-views/TopoguideView');

// Auth / account views — gated behind auth most of the time.
const AccountView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/AccountView');
const AppSettingsView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/AppSettingsView');
const FollowingView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/FollowingView');
const LoginView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/LoginView');
const PreferencesView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/PreferencesView');
const TrackersExchangeTokenView = () =>
  import(/* webpackChunkName: "view-account" */ '@/views/user/TrackersExchangeTokenView');
const TrackersView = () => import(/* webpackChunkName: "view-account" */ '@/views/user/TrackersView');

// lazy-load components
// actually, only diff is quite big, because of diff computation
// but lets group together this three views.
const AreaEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/AreaEditionView');
const ArticleEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ArticleEditionView');
const BookEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/BookEditionView');
const ImageEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ImageEditionView');
const MapEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/MapEditionView');
const OutingEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/OutingEditionView');
const ProfileEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/ProfileEditionView');
const RouteEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/RouteEditionView');
const WaypointEditionView = () =>
  import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/WaypointEditionView');
const XreportEditionView = () => import(/* webpackChunkName: "wiki-tools" */ '@/views/wiki/edition/XreportEditionView');
const WhatsNewView = () => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/WhatsNewView.vue`);
const HistoryView = () => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/HistoryView.vue`);
const AssociationsHistoryView = () =>
  import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/AssociationsHistoryView.vue`);
const DiffView = () => import(/* webpackChunkName: "wiki-tools" */ `@/views/wiki/DiffView.vue`);
const YetiView = () => import(/* webpackChunkName: "yeti" */ `@/views/portals/YetiView.vue`);

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
    component: () => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumView'),
  },
  {
    path: '/forum/c/:slug/:id(\\d+)',
    name: 'forum-category',
    component: () => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumCategoryView'),
    props: true,
  },
  {
    path: '/forum/t/:id(\\d+)/:slug?',
    name: 'forum-topic',
    component: () => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumTopicView'),
    props: true,
  },
  {
    path: '/forum/u/:username',
    name: 'forum-user',
    component: () => import(/* webpackChunkName: "forum" */ '@/views/forum/ForumUserView'),
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
