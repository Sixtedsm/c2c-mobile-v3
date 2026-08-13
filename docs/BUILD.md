# Build & deploy

## Local

```bash
npm install                 # ~2 min on first run
npm run serve               # dev server at http://localhost:8080
```

The dev server uses `BUILD_ENV=local` — same code paths as prod, no
minification, hot reload.

## Prod build (V3 target for GitHub Pages)

```bash
npm run build:v3            # outputs to /dist, publicPath = /c2c-mobile-v3/
```

The `build:v3` script is a Vue CLI 5 build with `BUILD_ENV=github-v3`,
which tells `vue.config.js` to:

- set `publicPath: '/c2c-mobile-v3/'` (GitHub Pages sub-path)
- disable source maps (smaller artifact)
- enable the PWA plugin (service worker, manifest)

## Other build targets

| Script                 | Env        | Output                             | Used by                         |
| ---------------------- | ---------- | ---------------------------------- | ------------------------------- |
| `npm run serve`        | local      | dev server                         | local dev                       |
| `npm run build`        | camptocamp | dist for prod camptocamp.org       | upstream V1 (not us)            |
| `npm run build:github` | github     | GitHub Pages root                  | not currently used on this fork |
| `npm run build:v3`     | github-v3  | GitHub Pages under /c2c-mobile-v3/ | production deploy               |

## CI + deploy

Two GitHub Actions workflows:

| File                           | Trigger           | What it does                                |
| ------------------------------ | ----------------- | ------------------------------------------- |
| `.github/workflows/ci.yml`     | PR + push to main | `npm run lint:no-fix` + `npm run build:v3`  |
| `.github/workflows/deploy.yml` | push to main      | `npm run build:v3` + upload to GitHub Pages |

CI must pass before a merge; deploy runs after every merge to `main`.

Manual re-deploy: **Actions tab → Deploy V3 to GitHub Pages →
"Run workflow"** on the `main` branch.

## Publishing a new version

1. Bump `version` in `package.json` (semver: patch for fixes, minor for
   features, major for breaking).
2. Commit + push to `main`.
3. Deploy workflow runs; new version is live at
   `https://sixtedsm.github.io/c2c-mobile-v3/` within ~2 min.
4. PWA users get the update the next time they open the app (service
   worker's `skipWaiting` behavior — see `src/registerServiceWorker.js`).

## Landing page

`public/landing.html` is a plain HTML file — no build step, copied
as-is to `/dist/landing.html` by Vue CLI's static asset handling.

## Troubleshooting

**Build fails with `Cannot find module '...'`** — usually a lockfile
drift. Delete `node_modules/` + `package-lock.json`, re-run
`npm install`.

**Deploy succeeds but GitHub Pages 404s** — check `Settings → Pages →
Source` is set to "GitHub Actions" (not "Deploy from a branch").
`actions/configure-pages@v5` with `enablement: true` in `deploy.yml`
handles this on first run but can drift if manually changed.

**Service worker serves a stale build** — hard-reload in DevTools
(Application → Service workers → Update on reload), or bump `version`
in `package.json` and re-deploy; the SW cache key includes the build
hash.
