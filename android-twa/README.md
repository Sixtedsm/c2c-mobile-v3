# TWA Android publish — walkthrough for C2C

> Satisfies CDC v1.0 §4.1 (Gouvernance des stores). This folder scaffolds
> a Trusted Web Activity so C2C can wrap the deployed PWA into a Play
> Store app **without any code changes** — the APK ships the URL, not
> the app bundle.

## What this folder is (and isn't)

- **Is**: a bubblewrap manifest + this walkthrough. Everything C2C
  needs to sign, wrap, and upload the PWA as a native Android app.
- **Isn't**: a pre-built APK. The APK must be signed by a key C2C
  owns and never leaves C2C's password manager.

## Prerequisites (one-time)

1. **Google Play Developer account** — 25 USD, one-time, `payable to
c2corg@…` (billing under C2C's name).
2. **Java 17** and **Android SDK cmdline-tools** on the machine that
   will produce the APK.
3. **bubblewrap CLI** — `npm i -g @bubblewrap/cli`.
4. **A keystore** owned by C2C. Generated once, kept forever:
   ```bash
   keytool -genkey -v -keystore c2c-android.keystore \
     -alias c2c -keyalg RSA -keysize 2048 -validity 25000
   ```
   Store the resulting `.keystore` file + passphrase in C2C's password
   manager. **Losing this key locks the org out of publishing updates.**

## First-time build

```bash
cd android-twa/
bubblewrap init --manifest=./twa-manifest.json
# accepts defaults; prompts for keystore path + passphrase from step 4
bubblewrap build
# → produces app-release-signed.apk + a Digital Asset Links snippet
```

The build output includes a **SHA-256 fingerprint** of the signing key.
Copy it into `public/.well-known/assetlinks.json` (replace the
placeholder), commit, and let CI re-deploy so `sixtedsm.github.io`
(or the C2C-owned domain) serves the fingerprint.

## Verify the association

Before uploading to Play, confirm Chrome accepts the association:

```bash
adb install app-release-signed.apk
adb shell am start -a android.intent.action.VIEW \
  -d "https://sixtedsm.github.io/c2c-mobile-v3/" \
  org.camptocamp.mobile
```

The app should launch fullscreen (no URL bar). If a bar is visible,
the assetlinks.json isn't reachable — check
`https://<host>/.well-known/assetlinks.json` returns the fingerprint
JSON with the right `sha256_cert_fingerprints` value.

## Upload to Play

1. Play Console → **Create app** → **Camptocamp** (fill store listing:
   descriptions, screenshots, category, contact email, privacy policy
   URL — all C2C-owned).
2. Production track → **Create release** → upload the signed `.aab`
   (bubblewrap produces one alongside the APK).
3. Rollout 10% → 50% → 100% over ~1 week.

## Update flow

For **content updates** (any change to the PWA): merge to `main`,
deploy runs automatically, and the TWA picks up the new content on the
next app launch. **No APK rebuild.**

For **shell changes** (bubblewrap manifest, permissions, icon, min
Android version): re-run `bubblewrap update` + `bubblewrap build`,
bump `appVersionCode` in `twa-manifest.json`, upload the new AAB.

## Contact for handover

The `android-twa/` scaffold is portable — any C2C machine with the
prerequisites above can produce a signed APK. Sixte is available for
the first build session if C2C wants a walkthrough.

## iOS

Deliberately out of scope for the first release: 99 USD/year Apple
Developer + App Store review that historically rejects
"webview-only" wrappers under §4.2 of the App Store guidelines.
Documented as a follow-up in [docs/HANDOVER-C2C.md](../docs/HANDOVER-C2C.md).
Users on iPhone install the PWA via **Partager → Sur l'écran d'accueil**
today and get a comparable experience.
