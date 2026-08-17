# ROOTS — running & building the app

This is **one** codebase that ships three ways:

1. **Web app** (served from `www/`)
2. **Installable PWA** (Add to Home Screen — works on iOS, Android, desktop)
3. **Native iOS + Android apps** (via Capacitor → App Store / Play Store)

The UI lives in `www/` (single source of truth). Barcode decoding uses self-hosted `zbar-wasm`;
label reading, translation, and approved AI explanations use the protected FastAPI backend;
classification uses the local deterministic JavaScript engine.

---

## 0. Configure the protected backend

Copy `.env.example` to an untracked `.env` and place `GEMINI_API_KEY` there. Start `api:app`, then
set the public backend URL in `www/runtime-config.js`. Never place provider credentials in `www/`
or generated native assets. See `BACKEND_API.md` and `SECURITY.md`.

## Local typography assets still needed

The CSS already uses Sora for display text and Plus Jakarta Sans for interface/body text, with
system fallbacks. To self-host the intended typography without runtime 404s, add these licensed
WOFF2 files and corresponding `@font-face` declarations:

- `www/fonts/sora-600.woff2`
- `www/fonts/sora-700.woff2`
- `www/fonts/plus-jakarta-sans-400.woff2`
- `www/fonts/plus-jakarta-sans-500.woff2`
- `www/fonts/plus-jakarta-sans-600.woff2`

## JavaScript tests

```bash
npm run test:profile
npm run test:engine
npm run test:integration
npm run test:home
npm run test:js
npm run test:review
npm run test:processing
npm run test:report
npm run test:production
npm run test:js       # includes Phase 4A migration and animation regressions
npm run test:restaurants
```

Phase 6A taxonomy, migration, deterministic evidence, search, profile-editor, and handoff coverage
is in `tests/phase6a.test.js` and is included by the full `node --test tests/*.test.js` command.

`test:js` runs the Phase 2A profile, Phase 2B engine, Phase 2C scan-integration, Phase 3A Home,
and Phase 3B image-review suites. `test:review` runs only the Phase 3B camera/crop state checks.
`test:processing` runs the Phase 3C session, timeout, retry, cancellation, network, security,
accessibility, and service-worker checks.
`test:report` covers the Phase 3D report verdict language, reason ordering, evidence labels,
saved-product persistence, safe sharing, and report security boundaries.

## Phase 3D final reports

Live deterministic scan results, current structured history records, and offline Saved products
open the same full-screen report renderer. Reports expose plain-language Safe, Caution, or Avoid
results, ingredient evidence, original/translated/edited label text, local issue reporting, and
share/copy actions. AI receives report context for explanation only and cannot override the
deterministic verdict. Legacy history records retain their compatibility renderer.

### Report modules and public API

- `ROOTS_REPORT.open(scan, options)` opens the report; `close()` and `destroy()` remove its
  delegated listeners. `searchIngredients()`, `toggleSection()`, `toggleIngredient()`,
  `openEvidence()`, and `openOriginalText()` expose view interactions without mutating evaluation.
- `ROOTS_REPORT_ACTIONS` owns Saved-product CRUD, ingredient copying, privacy-bounded sharing,
  AI explanation context, local issue records, URL validation, and safe clipboard fallback.
- Reason chips prioritize allergies, cross-contact, religious, lifestyle, and custom reasons,
  deduplicate labels, and show at most five. Avoid and Caution open first; Preferences remain
  separate; long Safe lists start collapsed and render a 12-item preview.
- Ingredient cards use engine reasons and local ingredient knowledge. Evidence is expressed only
  as Confirmed, Likely, or Needs confirmation. Parent/subingredient nesting is capped at two
  display levels, and possible sources are explicitly labeled as possible.
- Original, translated, and user-edited label text appears in a keyboard-operable modal. Search
  appears at 13 ingredients, matches names/aliases/reasons case-insensitively, and inserts no
  highlighting markup.

### Local records, privacy, and performance

Saved reports use `roots-saved-products-v1`, deduplicate by barcode or normalized product/brand,
and retain the evaluated profile snapshot and engine versions. Saved never means Safe. Report
issues use `roots-report-issues-v1` and remain local. Share payloads exclude raw OCR images, full
profile details, internal rule IDs, debug data, and keys. External/user text is escaped and product
images allow only HTTPS, blob, or trusted app-local paths. Report listeners are delegated, hidden
sections do not attach per-card handlers, Safe rendering is bounded initially, and no AI call is
made during rendering.

Phase 3E adds static-shell caching boundaries, lifecycle cleanup, bounded inputs, responsive
regressions, production icon/splash assets, and release checks. Real screen readers, device text
scaling, native share sheets, older WebViews, low-memory devices, and large production reports
still require physical-device validation.

Production OCR/barcode reports use `ROOTS_SCAN_PIPELINE` and `ROOTS_DIETARY_ENGINE`.

## Phase 4A compatibility

The current profile schema is version 2. Do not write new `strict_jain` or `custom_jain` entries.
Old schema-v1 profiles are normalized automatically and preserved in a local backup. Historical
reports and Saved records are not rewritten; their visible Jain labels are normalized when shown,
while rechecks always use the current canonical `jain` options.

The Home scan illustration is generated by `home-animation.js`; there is no external Lottie or
camera image asset. Its phone is opaque until the `complete` state and fades only in `exiting`.

## Phase 4B restaurant provider

Restaurant discovery has no hardcoded Google, Mapbox, OpenStreetMap, Photon, Pelias, or Nominatim
dependency. A deployment must supply a provider object implementing:

```js
searchRestaurants({ meal, location, radius, signal })
reverseGeocode({ latitude, longitude, signal })
autocomplete({ query, signal })
```

The app requests browser geolocation only after `Use My Location` is pressed. Provider secrets
must be protected by an appropriate backend when the chosen provider requires credentials.
Restaurant lists may be cached locally for 30 minutes. Phase 4C normalized menus may be saved for
offline reopening; raw photos, network responses in Cache Storage, and compatibility results are not.

## Phase 4C menu modules

- `restaurant-menu-provider.js`: safe official-first sources and backend-ready fetch boundary.
- `restaurant-menu-import.js`: bounded image/camera/PDF/text/manual sessions and cleanup.
- `restaurant-menu-ocr.js`: sequential Gemini extraction and content-hash reuse.
- `restaurant-menu-parser.js`: deterministic menu structure and duplicate review.
- `restaurant-menu-storage.js`: schema migration, freshness, lookup, and bounded LRU.
- `restaurant-menu-review.js`: accessible import, page ordering, correction, restore, and save.

Blocked remote pages return `requires_backend_proxy`; the frontend is not an arbitrary URL proxy.
Embedded-text PDFs are supported. Image-only PDF rendering remains unavailable until a pinned,
maintained, license-reviewed local implementation is chosen.

Run `npm run test:menus` for the Phase 4C regression suite.

## Phase 4D deterministic restaurant analysis

Phase 4D loads after the Phase 4C menu modules. It requires
`ingredient-knowledge.js`, `ingredient-parser.js`, `dietary-rules.js`, and the active profile.
Run `npm run test:restaurant-evidence` for focused evidence-engine tests or `npm run test:js` for
the complete regression suite.

Compatibility reports are derived locally and cached under `roots-restaurant-evidence-cache-v1`
using menu normalization state plus profile update state. Editing a menu or changing the profile
invalidates the signature. The cache is bounded to 25 reports and is never placed in Cache Storage.
No Gemini key or restaurant network provider is required for deterministic evaluation.

## Phase 4E ranking modules

- `restaurant-ranking.js`: ranking version, centralized weights, match categories, evidence,
  intent, variety, freshness, sorting, and filters.
- `restaurant-ranking-storage.js`: profile/menu/location/version cache identity and expiration.
- `restaurant-results-view.js`: progressive personalized cards, sorting, filters, and result states.
- `restaurant-detail-view.js`: match hero, explanations, and personalized dish sections.
- `restaurant-comparison.js`: local comparison state capped at three restaurants.

Run `npm run test:restaurant-ranking` for focused Phase 4E tests. Best Match is the default. Final
tie-breaking order is match category, internal evidence-based value, distance, then stable provider
order. General ratings never enter the calculation.

## Phase 4F-A meal builder modules

Restaurant detail loads `restaurant-meal-engine.js`, `restaurant-meal-storage.js`, and
`restaurant-order-builder.js`. Construction requires the normalized menu in
`ROOTS_MENU_STORAGE` and reuses the generated Phase 4D report. Live modifier, side, drink, dessert,
portion, comparison, and review updates require no network request.

Run `npm run test:restaurant-meal` for focused deterministic meal tests. The complete regression
command remains `npm run test:js`. The service worker includes the modules in
`roots-shell-v4fa-1`.

## Phase 4F-B restaurant memory modules

- `restaurant-meal-storage.js`: saved schema, migration, per-record storage, CRUD, archive,
  restore, duplicate, snapshots, and bounded index.
- `restaurant-order-history.js`: separate ordered occurrences and optional outcome notes.
- `restaurant-memory-search.js`: local search, filters, and stable sorts.
- `restaurant-order-recheck.js`: current profile/menu lookup, change detection, deterministic
  reevaluation, confirmation aging, and conservative similar-dish candidates.
- `restaurant-memory-view.js`: Saved cards, history, details, personal confirmations, copy/share,
  and separate data-retention controls.

Run `npm run test:restaurant-memory`. The offline shell is `roots-shell-v4fb-1`; private records
remain outside Cache Storage. Offline Order Again uses a cached menu when present and otherwise
labels the historical record as not refreshed.

## Phase 4G-A communication modules

- `restaurant-question-engine.js`: deterministic evidence-to-question mapping.
- `restaurant-question-storage.js`: saved sets and validated translation cache.
- `restaurant-question-translation.js`: translate-only Gemini adapter with structural validation.
- `restaurant-question-actions.js`: copy, share, print, and device text-to-speech.
- `restaurant-communication-view.js`: accessible staff-question interface and print layout.

Run `npm run test:restaurant-questions`. Saved sets and
translations remain private local records outside Cache Storage. Generation, cached translations,
copy, print, and device speech work offline. Only new translations require Gemini/network access.

## Phase 4G-B Dining Assistant modules

- `restaurant-dining-assistant.js`: evidence normalization, guarded explanation, offline fallback,
  bounded explanation cache, current-session conversation, and structured staff responses.
- `restaurant-dining-card.js`: deterministic cards and structurally validated translation.
- `restaurant-ingredient-explorer.js`: local glossary and ingredient knowledge search.
- `restaurant-dining-assistant-view.js`: accessible assistant, Decision Tree, cards, and explorer.

Run `npm run test:dining-assistant`. Conversation history
is never persisted. Static modules are cached; private records and AI responses are not service-
worker entries. Deterministic explanations, cards, and ingredient search work offline.

## Phase 4G-C Travel Mode

Run `npm run test:travel`. The shell cache is `roots-shell-v4gc-1`.

## Phase 4H personalization

Run `npm run test:personalization`. Phase 4H has no provider setup and adds no network request.
Favorites, Grocery Mode, recommendation inputs, and unified search remain local. Product
alternatives are selected only from previously stored Safe records; restaurant and meal
recommendations must retain compatible deterministic verdicts. The app-shell cache is
`roots-shell-v4h-1` and contains the four Phase 4H modules, never their localStorage data.

## Phase 5A performance verification

Run `npm run test:performance`, then the complete regression suite. The critical shell cache is
`roots-shell-v5a-1`; feature scripts used after navigation enter `roots-features-v5a-1`.
Development measurements can be enabled locally with `?rootsPerformance=1`; they remain in memory.
See `PERFORMANCE.md` for measurements, cache boundaries, and limitations.

Travel modules are static app-shell assets. Destinations, installed packs, saved cards, and recent
phrases are private IndexedDB records and never enter Cache Storage. Packs validate schema,
language, region, required arrays, profile fingerprint, and a 512 KB limit before storage. A
failed update leaves the installed pack intact.

Offline: setup shell, installed packs, cards, glossary, source/translated text, and device TTS.
Online/configured Gemini is required only for unavailable translations. Physical-device QA should
verify installed voices, Wake Lock behavior, print layouts, and VoiceOver/TalkBack.

Restrict the key's quota/API access in Google AI Studio — it ships inside the app bundle, since
the app calls Gemini only through the protected backend.

---

## 1. Web / PWA (no tooling needed)

```bash
npm run dev
# open http://127.0.0.1:5500
```
`npm run dev` starts both the frontend and the protected FastAPI service. `npm run serve` starts
only the static frontend, so label OCR, translation, and AI tools are unavailable in that mode.
On a phone browser, use the browser menu → **Add to Home Screen** to install it as a PWA.

---

## 2. Native iOS + Android (Capacitor)

**Prerequisites**
- [Node.js](https://nodejs.org) 18+ (`brew install node`)
- iOS: macOS + Xcode + CocoaPods (`sudo gem install cocoapods`)
- Android: Android Studio (with an SDK + emulator)

**First-time setup**
```bash
npm install
npx cap add ios
npx cap add android
npm run assets          # generates app icons + splash from resources/
npx cap sync
```

**Run**
```bash
npm run open:ios        # opens Xcode  -> press Play
npm run open:android    # opens Android Studio -> press Run
# or directly:
npx cap run ios
npx cap run android
```

**After editing anything in `www/`:** `npx cap sync` (copies web assets into the native projects).

---

## 3. Native permissions (one-time, after `cap add`)

Camera + photo library only — the restaurant finder (and its location permission) was removed.

**iOS** — add to `ios/App/App/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Used to scan product barcodes and ingredient labels with your camera.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to read an ingredient label from a photo you choose.</string>
```

**Android** — add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

> The label-photo fallback uses an `<input type="file" capture>`, which triggers the native
> camera/photo picker on both platforms — no extra plugin required. The live barcode scanner
> uses plain `getUserMedia` + a self-hosted `zbar-wasm` decoder (see `CLAUDE.md`).

---

## App identity
- Working app name: **ROOTS**
- Bundle/App ID: `app.ahimsabytes.butisitjain` (set in `capacitor.config.json` and the Xcode
  project's `PRODUCT_BUNDLE_IDENTIFIER` — keep both in sync if it ever changes)
- The existing bundle ID is retained deliberately because changing it would create a different
  App Store/Play Store identity; treat any future change as a migration, not a cosmetic rename.
- Icon/splash source: `resources/icon.png`, `resources/splash.png`

## Version bumps (before each App Store submission)
Three places must move together:
1. `package.json` → `"version"`
2. Xcode project → `MARKETING_VERSION` (user-facing version, e.g. `2.0`) and
   `CURRENT_PROJECT_VERSION` (build number — must increase every upload, even within the same
   marketing version) in `ios/App/App.xcodeproj/project.pbxproj`
3. `SUBMISSION.md`'s "What's New" notes, for App Store Connect's release notes field

## Phase 5B design-system verification

The UI foundation is split between `www/design-system.css` and `www/ui-system.js`. The CSS file
owns semantic colors, typography, spacing, radii, elevation, motion, reusable controls, cards,
forms, sheets, loading states, and responsive/accessibility variants. The JavaScript controller
provides optional haptics, safe live-region toasts, loading-button semantics, and keyboard/pointer
modality. It does not change feature behavior.

Run:

```powershell
node --test tests/design-system.test.js
node --test tests/*.test.js
```

Then verify light, dark, system, reduced-motion, increased-contrast, keyboard focus, 200% text,
320/375/390/414/430px widths, tablet, and short landscape layouts. The Phase 5B shell cache is
`roots-shell-v5c-1`. Full component guidance is in `DESIGN_SYSTEM.md`.

`@capacitor/haptics` is a Phase 5B runtime dependency. After `npm install`, run `npx cap sync` when
the `ios/` or `android/` projects exist. This repository snapshot has neither generated platform
directory, so Phase 5B does not edit or sync generated native source.

## Phase 5C UX verification

Run `node --test tests/ux-5c.test.js` and the complete JavaScript suite. Then follow the scenarios
and viewport matrix in `UX_AUDIT.md`. Verify the first-run Welcome and Set Up Later paths with clean
storage; Home scan ordering; all four Saved categories and arrow-key behavior; browser/native Back;
AI disclosures; light/dark/reduced-motion; and offline shell installation. The shell cache is
`roots-shell-v5c-1`.
# Phase 5D production security gate

Before a production build, set the HTTPS backend URL in `www/runtime-config.js`, configure exact
`ALLOWED_ORIGINS`, rotate any formerly browser-exposed provider key, and verify no secret appears in
`www/` or generated native assets. Run the complete JavaScript, legacy Python, and security suites,
then audit locked dependencies. The service worker caches only static assets and intentionally
bypasses `/v1/` provider routes.

Native projects are generated artifacts. After they exist, run `npm run sync` and audit Android and
iOS manifests for camera/location descriptions, absence of background location, cleartext traffic,
and unintended permissions before signing. See `SECURITY.md` and `PHASE_5E_HANDOFF.md`.

## Phase 6B explanation verification

Detailed and Simple explanations use the protected `POST /v1/ai/explain` route. Configure
`GEMINI_API_KEY` only in the backend environment. Quick explanations and Technical Evidence work
without the backend. The service worker caches only static explanation modules; generated output
stays in bounded local storage and `/v1/` responses are never cached.

Run `node --test tests/phase6b.test.js`, the complete JavaScript suite, and
`.\.venv\Scripts\python.exe -m unittest test_security.py`. See
`EXPLANATION_ARCHITECTURE.md` for schemas, privacy, caching, and fallback behavior.
