# Handover checklist — Camptocamp maintenance takeover

> Satisfies CDC v1.0 §3.1 (Maintenabilité) and §3.2 (Réversibilité).

When C2C is ready to take over maintenance of the mobile app, the
transfer is designed to be a single Saturday of work. Nothing on this
fork depends on a personal account, a paid service, or an undocumented
build step.

## What you get, day 1

| Asset                  | Where                               | Notes                                                |
| ---------------------- | ----------------------------------- | ---------------------------------------------------- |
| Source code            | `github.com/Sixtedsm/c2c-mobile-v3` | AGPL-3.0-or-later (same as upstream `c2corg/c2c_ui`) |
| CI workflow            | `.github/workflows/ci.yml`          | lint + build on every PR + push                      |
| Deploy workflow        | `.github/workflows/deploy.yml`      | push to `main` → GitHub Pages                        |
| Architecture doc       | `ARCHITECTURE.md`                   | ~10 min read, covers the shell + plugins             |
| Build doc              | `docs/BUILD.md`                     | local dev + prod build + troubleshooting             |
| Test suite             | `tests/unit/pwa/`                   | 107 tests, `npm test`, run by CI on every PR         |
| Dependency inventory   | `docs/DEPENDENCIES.md`              | versions + licences, `node tools/licenses.cjs`       |
| This checklist         | `docs/HANDOVER-C2C.md`              | you're reading it                                    |
| Handover session state | Sixte's memory notes                | transferred separately if useful                     |

## What you need to set up on your side

1. **A GitHub org / user account** to host the fork.
   - Fork `Sixtedsm/c2c-mobile-v3` under `c2corg/` (or any C2C-owned
     namespace).
   - Both workflows work as-is under any org — no hardcoded owner.
2. **GitHub Pages** enabled on the fork.
   - `Settings → Pages → Source: GitHub Actions`.
   - The `deploy.yml` workflow enables it automatically on first run
     (`actions/configure-pages@v5` with `enablement: true`).
3. **The domain choice**: default is
   `https://<owner>.github.io/c2c-mobile-v3/`. If C2C wants a subdomain
   like `mobile.camptocamp.org`:
   - Add a `CNAME` file to `/public` with the target hostname.
   - Set the DNS `CNAME` record from `mobile.camptocamp.org` to
     `<owner>.github.io`.
   - `vue.config.js` publicPath needs to change from `/c2c-mobile-v3/`
     to `/` (edit the `BUILD_ENV=github-v3` branch).

## What is _not_ needed

- **No developer account** — the app is a PWA, not published to any
  store. Users install via "Add to home screen" in their browser.
- **No SaaS / analytics account** — Google Analytics is present but
  disabled by default; enables only after the user opts in via the
  GDPR banner. To swap for Plausible or drop entirely: comment the
  `Vue.use(VueAnalytics, …)` block in `src/main.js`.
- **No API keys / secrets** — the app talks to the public C2C v6 API
  at `api.camptocamp.org` (read + authenticated write) and to
  `forum.camptocamp.org` (Discourse). Everything C2C already runs.
- **No proprietary maps** — tiles are OpenTopoMap by default, with
  IGN / SwissTopo / satellite as user-selectable layers. All public
  or already-C2C-provisioned endpoints.
- **No paid CDN / hosting** — GitHub Pages is free for public repos.

## Later, if you want to publish on stores (CDC §4.1)

Not required for the PWA to work, but if C2C wants Play Store presence:

- **Android via TWA** (~4-6h + $25 one-time Google Play account):
  - Use `@bubblewrap/cli` to wrap the PWA URL into a TWA APK.
  - The APK is signed with a key that C2C controls (produce with
    `keytool`, store in the C2C password manager).
  - Publish to Play Console under a C2C-owned developer account.
  - Update flow: C2C bumps `version` in `package.json`, deploys the
    PWA, and the TWA picks up the new version on next launch (no APK
    republish needed unless native shell changes).
- **iOS via Capacitor** ($99/year Apple Developer + risk of review
  rejection for "webview wrapper"): defer unless there's a strong
  driver. PWA install on iOS works today via "Ajouter à l'écran
  d'accueil" and delivers a comparable experience.

## Onboarding a new contributor

```bash
git clone https://github.com/<owner>/c2c-mobile-v3
cd c2c-mobile-v3
npm install
npm run serve
```

Then read `ARCHITECTURE.md`.

## Code review rules

Required by CDC §3.1. These are the rules this fork has actually been
run on, not a generic checklist.

**CI is the floor, not the review.** `lint:no-fix`, `npm test` and
`build:v3` all have to pass before a merge. They catch formatting and
crashes; they say nothing about whether the change is right.

**Keep the fork thin.** ~95% of this repo is upstream `c2corg/c2c_ui`
and that ratio is the fork's whole maintenance argument: the more that
stays upstream, the more C2C gets for free. So, in order of preference:
use the V1 component as-is, extend it behind a flag, and only then write
something V3-specific. A PR that reimplements an existing V1 component
should be sent back — that is the single most expensive mistake
available here. Where a V3 change touches an upstream file, mark it with
a `// V3` comment so the next upstream sync can see it.

**Anything that can lose or falsify user data needs a test.** Concretely:
the offline store, the sync queue, GPS tracking, the outing session, and
anything feeding the fields published to the API. Every regression this
project has had was in that list — a screen lock silently ending a
recording, a pause inflating the published distance, a save mode
promising offline access it did not have. The test should fail against
the code as it was before the fix; if it passes both ways it is not
guarding anything.

**Say why, not what, in comments.** The diff already shows what changed.
What the next maintainer cannot recover is the constraint behind it —
which is why the interesting comments in this codebase point at a
specific failure.

**Small PRs.** One lot, one concern. Doc updates ship with the change
they describe, in the same PR — the stale claims fixed in this very
section are what happens otherwise.

## Known deferred work

The following were identified during Sixte's initial pass but
consciously deferred — they're not blockers but should land in the
first C2C-maintained release cycle:

1. **Component tests** — the unit suite covers the plugins and the
   pure helpers, but no component is mounted. The offline listing and
   the outing control both carry real logic in their computeds now.
2. **End-to-end tests** — Cypress against the deployed PWA would catch
   integration regressions (offline save round-trip, GPS session,
   forum reply). Unit tests cannot see a broken service-worker route.
3. **Accessibility audit** — the shell was hand-tuned but no `axe-core`
   pass has been run.
4. **Plausible or C2C-hosted analytics** — the existing Google
   Analytics setup is opt-in via GDPR and satisfies "analytics sobres"
   for now, but a self-hosted alternative would remove any Google
   dependency.
5. **FontAwesome tree-shake** — 6.7.2 is imported one icon at a time
   (~50 icons) but the loader isn't pruning aggressively. Estimated
   ~20 KB gzipped saveable.
6. **Bulma 1.x migration** — Bulma 0.9 is used today; 1.x brings
   native CSS variables which would replace half of our dark-mode
   overrides.
7. **Vue 3 migration** — Vue 2 EOL was December 2023. Not urgent while
   the app is stable, but worth planning with C2C's upstream `c2c_ui`
   roadmap.

## What stays blocked until C2C hosts the app

The app runs from `sixtedsm.github.io`. The forum runs on
`forum.camptocamp.org`. That is a cross-site relationship, so the
browser will not attach the user's Discourse session cookie to requests
the app makes — `withCredentials: true` is set on `authAxios`
(`src/js/apis/forum.js`) and is not enough on its own.

Everything below therefore works only for a user who already holds a
session cookie for `forum.camptocamp.org` in the same browser, and
nothing in the app can create one. Hosting the app on a camptocamp.org
domain removes the whole class of problem at once — this is not a list
of bugs to fix one by one.

| Feature                           | Endpoint                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| Post / edit a reply, open a topic | `POST /posts.json`, `PUT /posts/:id.json`                      |
| Like and unlike                   | `POST /post_actions.json`, `DELETE /post_actions/:id.json`     |
| Flag a post                       | `POST /post_actions.json`                                      |
| Bookmarks: add, remove, list      | `POST`/`DELETE /bookmarks.json`, `GET /u/:user/bookmarks.json` |
| Notification inbox, mark read     | `GET /notifications.json`, `PUT /notifications/mark-read.json` |
| Watch a topic ("Surveiller")      | `POST /t/:id/notifications.json`                               |
| Private messages: inbox, send     | `GET /topics/private-messages/:user`, `POST /posts.json`       |
| Unread / new topic tabs           | `GET /unread.json`, `GET /new.json`                            |
| Image upload to the forum         | `POST /uploads.json`                                           |

Reading the forum — topics, posts, categories, tags, search — needs no
cookie and works today.

Two more things wait on a C2C-owned domain:

- **Play Store publication.** `android-twa/twa-manifest.json` pins
  `host: sixtedsm.github.io`. A Trusted Web Activity is bound to its
  domain through a Digital Asset Links file served from that domain, so
  the store listing cannot be transferred by editing a manifest — it has
  to be rebuilt against the C2C host.
- **Anything cookie- or origin-scoped later**: push subscriptions, SSO
  callbacks. None are implemented today; they would all be blocked the
  same way if they were.

## Who to contact for handover

- Sixte (`sixtedesaintmartin@gmail.com`) is committed to a smooth
  transfer: walkthrough call, first 2-3 questions after C2C onboards,
  code review of the first C2C PR.
- The fork stays visible at `Sixtedsm/c2c-mobile-v3` until C2C
  confirms the migration is done — no rug-pull.

## Reversibility summary (CDC §3.2 point-by-point)

- [x] Code source — public, AGPL
- [x] Scripts de build — `npm run build:v3` (`vue.config.js`)
- [x] Documentation — `README.md`, `ARCHITECTURE.md`, `docs/BUILD.md`,
      `docs/DEPENDENCIES.md`, `docs/CDC.md`, this file
- [x] Accès aux dépôts — GitHub, transferable via fork
- [x] Configuration CI/CD — `.github/workflows/*.yml`, portable
- [x] Clés / certificats — none needed today; documented for the TWA
      path above
- [x] Documentation de publication App Store / Play Store — see the
      "if you want to publish on stores" section above. The procedure is
      documented; the publication itself waits on a C2C-owned domain, see
      "What stays blocked until C2C hosts the app".
- [x] Liste des dépendances et licences — [`docs/DEPENDENCIES.md`](DEPENDENCIES.md),
      regenerated by `node tools/licenses.cjs`
- [x] Aucune dépendance bloquante à un prestataire — confirmed above
