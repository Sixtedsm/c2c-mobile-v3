# V3 mobile — architecture

> Snapshot for whoever picks up maintenance. Reads in ~10 minutes.

## What V3 is

V3 = the official `c2corg/c2c_ui` codebase (Vue 2 SPA) forked to
`Sixtedsm/c2c-mobile-v3`, with a **mobile shell** layered on top and a
handful of **local plugins** that add field-oriented capabilities. Every
V1 view and business rule is reused as-is — the shell wraps them, it
doesn't replace them.

Rule of thumb: **if it exists in V1 upstream, we use it**. When we
absolutely need V3-only behavior we add a scoped override (component,
plugin, stylesheet) that layers on top rather than forking the V1 file.

## Top-level layout

```
src/
  App.vue                       V3 shell (top bar + bottom nav + banners)
  main.js                       Vue plugin wiring (registration order matters)
  components/                   V3-specific components (see below)
  views/                        V1 views (mostly untouched) + V3 additions
  js/vue-plugins/               Cross-cutting concerns exposed as vm.$X
  js/apis/c2c/                  Camptocamp v6 API client (V1 code)
  pwa/offline-store.js          IndexedDB persistence layer
  assets/sass/                  Global stylesheets, including mobile-fixes
```

## V3-specific plugins (all live at `vm.$X`)

| Plugin           | Exposes             | Owns                                                                  |
| ---------------- | ------------------- | --------------------------------------------------------------------- |
| `offline`        | `vm.$offline`       | Saved docs, folders, day-packs, pending outings, sync loop, PWA badge |
| `outing-session` | `vm.$outingSession` | Live outing state, GPS watch (batter-guarded), positions, GPX export  |
| `app-settings`   | `vm.$appSettings`   | Dark theme + text-size prefs (persisted in localStorage)              |
| `screen`         | `vm.$screen`        | Responsive breakpoints (V1)                                           |

Registration order in `main.js` is deliberate: `localStorage` first
(other plugins may need it), then app-settings (applies before Vue mounts
to avoid FOUC), then offline, then outing-session (depends on offline
via `queueOuting`).

## V3-specific components

Shell:

- `MobileTopBar.vue` — 52 px sticky top bar (back / title / search / add / user)
- `BottomNav.vue` — 5-tab bottom nav (Recherche / Récent / Mes topos / Moi / Plus)
- `PullToRefresh.vue` — native gesture, fires `v3:refresh`, safety-timer-guarded
- `OnboardingTour.vue` — 4-slide first-launch modal, replayable from AppSettings
- `OutingSessionBanner.vue` — floating pill when a session is active on another topo
- `LogoCtc.vue` — inline SVG (theme-aware fill for dark mode)

Field UX:

- `StartOutingControl.vue` — start/pause/finish sortie + GPS + save-as-draft flow
- `views/documents/utils/NearMeButton.vue` — geoloc → bbox filter for listings

Views (V3-only):

- `views/user/MeView.vue` — dashboard "Moi"
- `views/user/AppSettingsView.vue` — theme + text-size + replay onboarding
- `views/MoreView.vue` — tile grid "Plus" + desktop escape hatch
- `views/offline/OfflineView.vue` — saved docs listing + purge + storage bar

## Offline model

Storage: **IndexedDB via `idb-keyval`** (see `src/pwa/offline-store.js`).
Two logical stores keyed by prefix:

- `doc:<type>/<id>/<lang>` → the C2C cooked document, saved at time T,
  plus a `folderId` (nullable).
- `folder:<id>` → user-created folder (id + display name).

Plus one queue:

- `queue:pending-outings` → array of outings created offline waiting to
  be published, each carrying `{ id, payload, title, photos: File[],
attempts, lastError }`.

The service worker (Workbox, configured by Vue CLI's PWA plugin) caches
the app shell + prefetched images and tiles. Prefetched URLs are
**exactly** the URLs the browser will request at runtime — so the
cooker's `c2c:url-proxy` variants (avif/webp/original) are all fetched
in `no-cors` mode so the SW captures opaque responses that match the
runtime `<img>` requests.

## Sync rules

1. `$offline.pendingOutings` is watched by the bottom-nav badge.
2. Sync fires on: `online` event, app start (if online + queue not
   empty), and after a `queueOuting()` call.
3. Per queued item:
   - If it has `photos: File[]`, upload each through `uploadFile()`
     (V1 helper, handles EXIF + resize), collect the returned image
     documents, POST `/images/list` to register them, attach the new
     `document_id`s to `payload.associations.images`.
   - POST `/outings` with the enriched payload.
4. Any error (network / auth / 400) leaves the item in the queue with
   `attempts` incremented + `lastError` set. Retried at the next sync.

## Outing lifecycle

```
User taps "Démarrer la sortie"
   → $outingSession.start({type, id, lang}, {track: true|false})
   → sessionActive=true, gpsTracking=track, positions=[]
   → localStorage snapshot on every change

Tracking:
   watchPosition() at ~5 s, jitter-filtered at 3 m, altitude → gain/loss

Tab hidden (phone locked, browser backgrounded):
   → wasTrackingBeforeHide=true, gpsTracking=false (battery guard)
Tab visible again:
   → gpsTracking=true (restore user intent)

User taps "Arrêter":
   → 3 choices modal:
     (a) Save as draft → mini form (activity/date/title/description/photos)
                       → $offline.queueOuting(payload, {photos})
                       → $outingSession.stop()
     (b) Export GPX only → download .gpx → $outingSession.stop()
     (c) Discard → $outingSession.discardTrace() + stop()
```

## Route flow (V1, unchanged) + V3 additions

Route hits `RouteView.vue` which uses:

- `DocumentViewHeader.vue` (V1 + V3 mods) — title + button-bar +
  **StartOutingControl** injected for `documentType === 'route'`
- `MapBox.vue` (V1 + V3 fullscreen overlay for mobile)
- `ToolBox.vue` (V1 + V3 "Pack sortie du jour" button, confirm-before-delete)

`DocumentsView.vue` (listings) uses:

- V1 filters (`QueryItems`)
- **`NearMeButton`** (V3, next to BulkOfflineButton) — pushes `bbox` to
  the route query, API filters server-side

## Dark mode strategy

`html[data-theme=dark]` is set by `$appSettings.apply()` at module load,
before Vue mounts. Global SCSS (in `App.vue` `<style>` block) uses
`html[data-theme=dark] .selector` which out-specifies scoped V1 rules —
so we don't have to fork every V1 component to paint it dark.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` builds `npm run build:v3`
and publishes `/dist` to GitHub Pages at
`https://sixtedsm.github.io/c2c-mobile-v3/`.

Landing page (`public/landing.html`) is a **static, pre-boot** smart
redirect: mobile UAs auto-forward to the PWA, desktop shows a chooser
that remembers the pick in localStorage. It's the single link to share.

## CI

`.github/workflows/ci.yml` runs `npm run lint:no-fix` + `npm run
build:v3` on every PR + push to main. There's no automated test suite
yet — see [docs/HANDOVER-C2C.md](docs/HANDOVER-C2C.md) for the recommended
next steps.

## What's V3-only vs. what's upstream

- **Upstream V1 (~95% of code)**: all doc views, all edition views, API
  client, i18n, form scaffolding, MapView / OlMap (with a handful of V3
  scoped tweaks marked with `// V3` comments), the entire routing table.
- **V3-only (~5%)**: the plugins + components + views listed above,
  plus `assets/sass/mobile-fixes.scss` + `edition-mobile.scss`.

That ratio matters: it's the answer to "how much extra maintenance is
this fork?" — the more we stay above 95%, the more work upstream C2C
does for free.

## Reversibility

Everything needed to transfer maintenance to C2C is public:

- Code: `Sixtedsm/c2c-mobile-v3` (this repo)
- Build & deploy: `.github/workflows/deploy.yml` (runs on any GitHub org)
- Landing: `public/landing.html` (static, portable)
- No proprietary services, no C2C-side secrets

Full handover checklist: [docs/HANDOVER-C2C.md](docs/HANDOVER-C2C.md).
