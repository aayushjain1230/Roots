# ROOTS engineering context

ROOTS is a framework-free HTML/CSS/JavaScript application packaged for web, PWA, iOS, and Android
through Capacitor. The shared frontend lives in `www/`. It is not a Flutter application.

## Architecture

The active scan path is:

`barcode/label evidence -> ROOTS_SCAN_PIPELINE -> ROOTS_INGREDIENT_PARSER -> ROOTS_DIETARY_ENGINE -> ROOTS_REPORT`

- Open Food Facts supplies barcode product evidence.
- Gemini extracts/translates labels and powers the existing text tools.
- The local deterministic engine is the only authority for Safe, Caution, and Avoid.
- `api.py` is dormant reference/compatibility code and is not called by the frontend.
- Profiles, history, Saved products, theme, shopping data, AI chat, and product cache use
  localStorage with existing compatibility keys and migrations.

## Frontend modules

- Shell: `index.html`, `styles.css`, `design-system.css`, `brand.js`, `theme.js`, `ui-system.js`, `script.js`
- Profile: `profile-definitions.js`, `profile.js`, `profile-ui.js`
- Engine: `ingredient-knowledge.js`, `ingredient-parser.js`, `dietary-rules.js`
- Scanning: `scan-pipeline.js`, `scan-processing.js`, `ocr.js`, `foodfacts.js`
- Media: `camera-capture.js`, `image-review.js`, `home-animation.js`
- Reports: `report-view.js`, `report-actions.js`
- Explanations: `explanation-context.js`, `explanation-templates.js`, `explanations.js`,
  `evidence-explorer.js`, and the protected `/v1/ai/explain` route
- Existing tools: `assistant.js`, `shopping.js`
- Offline: `sw.js`, `manifest.webmanifest`

Phase 5B presentation is centralized in `design-system.css`. `ui-system.js` provides optional
toasts, bounded haptics, loading-button semantics, and input-modality handling. Neither module may
contain dietary decisions or provider behavior. See `DESIGN_SYSTEM.md` for component contracts.

Phase 5C workflow hierarchy is documented in `UX_AUDIT.md`. Home must keep scanning before
Restaurant Finder and optional personalization. Saved uses `saved-navigation.js` for four internal
categories; these are not additional app tabs. Back navigation closes the active workflow layer
before returning a primary tab to Home.

## Phase state

- Phase 1: ROOTS branding, themes, typography structure, four-destination shell.
- Phase 2A: universal profile, onboarding, persistence, and legacy migration.
- Phase 2B: ingredient knowledge, parser, deterministic rules, evidence.
- Phase 2C: production scan integration, structured reports/history, AI context.
- Phase 3A: custom SVG Home animation and active-profile shell.
- Phase 3B: camera capture and image crop/rotate/revert/review.
- Phase 3C: resilient scan sessions, timeouts, retry/cancel, normalized errors.
- Phase 3D: final report, evidence, Saved products, sharing, search, history reuse.
- Phase 3E: production hardening, accessibility, performance, offline, QA, release documentation.
- Phase 4A: flat smartphone Home animation and one customizable Jain profile with schema-v2 migration.
- Phase 4B: restaurant discovery foundation for location, meal intent, provider-neutral search,
  local recents/saved locations, bounded result caching, and honest result states.
- Phase 6A: canonical restriction taxonomy, category-first profile editor, cached local search,
  high-value deterministic restriction rules, conflict detection, safe profile migration, and
  structured Phase 6B rule-trace handoff. See `PHASE_6A_RESTRICTIONS.md`.
- Phase 6B: deterministic Quick/Technical explanations, guarded Detailed/Simple explanations,
  evidence explorer, bounded cache, translation validation, and real-data-only alternatives.
  See `EXPLANATION_ARCHITECTURE.md`.

## Restaurant discovery boundary

The Restaurant tab is location-first and meal-first. Phase 4C can retrieve, import, and parse menus,
but does not evaluate dishes. The foundation modules are:

- `restaurant-provider.js`: replaceable `RestaurantProvider` contract, response normalization,
  URL validation, timeouts, cancellation, and stable errors.
- `restaurant-storage.js`: local radius, recent searches/locations, Home/Work/favorites, and a
  30-minute bounded restaurant-list cache.
- `restaurant-search.js`: browser geolocation only after an explicit tap, provider autocomplete,
  offline cache fallback, search cancellation, and recent-search persistence.
- `restaurant-ui.js`: accessible two-step flow, meal categories, recovery states, and honest cards.

No live provider is selected in source control. The default adapter returns
`provider_unavailable`; configure a provider by calling `ROOTS_RESTAURANT_PROVIDER.setProvider()`
with implementations of `searchRestaurants`, `reverseGeocode`, and `autocomplete`. Never place a
provider secret in tracked frontend code.

## Phase 4C menu evidence boundary

Phase 4C obtains and structures actual menu evidence. Source priority is official structured,
official webpage, official allergen guide, trusted structured provider, official PDF, user
image/screenshot/camera/PDF, pasted text, then manual entry. `restaurant-menu-provider.js`
normalizes and ranks sources without one-vendor coupling. Remote pages blocked by CORS or anti-bot
controls return `requires_backend_proxy`; ROOTS does not scrape around access controls.

All paths normalize to schema version 1. Original text and separate translations, sections, dishes,
descriptions, prices, sizes, modifiers, labels, allergen notes, footnotes, source evidence, and
warnings are retained. Menu labels are unverified evidence, not compatibility claims.

Photo sessions are capped at 12 pages and OCR runs sequentially only after Finish. Content hashes
reuse prior extraction. Full-resolution images are not persisted. Embedded PDF text is supported;
image-only PDFs return `pdf_processing_unavailable` until an audited local adapter is selected.

Normalized menus use `roots-restaurant-menus-v1`. The cache retains 20 unreviewed menus by LRU;
reviewed/user-saved menus are protected. Official sources become stale after 7 days and user
imports after 30 days. Stale menus remain viewable.

## Phase 4D restaurant evidence engine

Phase 4D consumes the normalized Phase 4C menu without performing OCR again. It reuses the
versioned local ingredient and dietary engines and adds restaurant-specific evidence in:

- `restaurant-modifier-engine.js`: accepts only removal/replacement options stated by the menu.
- `restaurant-evidence-engine.js`: produces per-dish evidence, unknowns, conflicts, rule traces,
  graph nodes/edges, and one deterministic verdict.
- `restaurant-compatibility-report.js`: caches evaluation signatures and groups dishes into Best
  Choices, Can Modify, Needs Confirmation, and Avoid.
- `restaurant-report-ui.js`: renders visible verdict text and accessible Why panels.

Verdicts are `SAFE`, `SAFE_WITH_MODIFICATION`, `NEEDS_CONFIRMATION`, or `AVOID`. Safe requires a
meaningful description, resolved ingredients, no conflicting rules, no unresolved source or
preparation uncertainty, and no applicable cross-contact warning. Restaurant labels remain
`likely` evidence and cannot independently establish Safe. Cuisine knowledge may add uncertainty
only. Missing or unknown evidence always prevents Safe.

Every result stores evidence sources separately, a profile/source snapshot, rule trace, and an
evidence graph from dish → evidence → rule → verdict. No LLM, network call, confidence percentage,
or inferred standard recipe participates in compatibility decisions.

## Phase 4E personalized restaurant ranking

Phase 4E converts Phase 4D reports into transparent restaurant summaries. Ranking version 1 uses
centralized weights in `restaurant-ranking.js`; its numeric value is internal and never rendered.
Visible categories are Excellent Match, Good Match, Limited Options, Needs More Information, and
the narrowly gated Poor Match. Missing or limited evidence always becomes Needs More Information,
never Poor Match.

Primary factors are practical Best Choices, menu-supported modifications, compatible sections,
deduplicated dish families, evidence strength, meal-intent relevance, freshness, customization,
and cross-contact burden. Distance and current open status are tie-breakers. Ordinary ratings are
display metadata only and contribute no ranking weight. Sauces, toppings, condiments, add-ons, and
side sections do not count like complete meal choices.

`restaurant-ranking-storage.js` keys cached summaries by restaurant, rounded search location, menu
ID/version, profile fingerprint, Phase 4D engine version, and ranking version. Theme changes do not
invalidate ranking. Profile, menu, evidence-engine, or ranking-version changes do. Cache TTL is six
hours and the limit is 60 summaries.

Results support Best Match, Distance, Most Best Choices, Most Modifiable Options, and Strongest
Evidence sorting; reversible session filters; incremental four-restaurant batches; personalized
cards; evidence/freshness labels; detail explanations; and semantic comparison of up to three
restaurants. All ranking remains local and sends no profile or allergy data to restaurant providers.

## Phase 4F-A deterministic meal construction

Phase 4F-A consumes the stored normalized menu and cached Phase 4D dish report. The meal engine never
re-ranks the restaurant and never asks Gemini to decide compatibility. `restaurant-meal-engine.js`
creates a versioned order containing a main, sides, drinks, desserts, extras, menu-supported
modifiers, and an optional published portion. It aggregates component evidence with strict
propagation: a confirmed Avoid makes the meal Avoid, and unresolved modifications or unknowns make
it Needs Confirmation. Best Choice is reserved for an unchanged fully safe main.

`restaurant-order-builder.js` owns dish detail, live construction, comparison, and review UI.
`restaurant-meal-storage.js` provides bounded local Save Meal storage under
`roots-saved-meals-v1`; it does not implement restaurant memory, accounts, or sync. A substitution
may appear only when present in the normalized menu or Phase 4D supported-modification evidence.

## Phase 4F-B restaurant memory

Restaurant memory is local-only and separates reusable Saved Meals from Order History occurrences.
`restaurant-meal-storage.js` migrates the Phase 4F-A array idempotently into a bounded index plus
individual versioned records (`roots-saved-meal-index-v2` and `roots-saved-meal-v2:<id>`). The
legacy array is backed up before migration. Saved meals are limited to 250 and are never silently
evicted. `restaurant-order-history.js` stores up to 1,000 individual occurrence records. Deleting
either record type never cascades to the other.

Every saved record preserves location identity, menu identity/freshness, profile fingerprint and
snapshot, exact selections, historical verdict/evidence versions, timestamps, private notes, and
usage count. Personal confirmations are location-specific, optionally dish-specific, labeled as
user notes, and never alter deterministic verdicts. Age labels are current through 30 days, aging
through 90 days, and old thereafter.

Order Again always loads the active profile and newest cached menu, detects profile/menu/dish/
modifier/engine changes, reevaluates locally, and displays historical and current results
separately. Missing selections are not removed and missing dishes are not replaced. Similar dishes
are conservative Possible alternatives. Price changes are informational.

Saved rendering performs no network call and no bulk recheck. Search is local and debounced.
Private records are not placed in Cache Storage, analytics, provider requests, logs, or shares.
Shares omit profiles and notes by default. Restaurant-memory deletion controls remain separate.

### Phase 4G input contract

Phase 4G receives only an explicitly opened current context: current restaurant and location,
current dish or built meal, selected modifiers, removed ingredients, deterministic current verdict
and evidence, unknowns, cross-contact concerns, personal notes, previous confirmations, current
profile, languages, and current menu source/freshness. Phase 4G may build deterministic concerns,
natural-language server questions, translation, server-facing cards, text-to-speech, copy/share,
and saved phrases. Phase 4F-B implements none of those features.

## Phase 4G-A restaurant communication

`restaurant-question-engine.js` alone decides which staff questions exist. It consumes unresolved
ingredient, preparation, cross-contact, and selected-modification evidence; every question retains
its source evidence ID. Questions are grouped into Ingredients, Preparation, Cross Contact,
Modifications, and Other with deterministic high/medium/low priority. The engine contains no AI
or network path.

`restaurant-question-translation.js` sends only the completed deterministic set to Gemini. It
prohibits additions, removals, answers, combinations, reordering, and meaning changes; responses
with changed count or ID order are rejected. Valid translations are cached locally for offline use.

The communication view provides individual/all copy, native share, individual/all device speech,
translation, saved sets, and a print-only large-type question sheet. Speech stops when the dialog
closes. Saved sets are local and bounded to 50. The print sheet is not the Phase 4G-B signature
visual Dining Card. No generic concerns, server answers, AI compatibility decisions, or automatic
ordering were added.

## Phase 4G-B Dining Assistant

The Dining Assistant is an explanation surface, not a compatibility engine:

`restaurant evidence/ranking -> ROOTS_DINING_ASSISTANT -> guarded Gemini explanation`

- `restaurant-dining-assistant.js` normalizes existing evidence, validates AI evidence citations,
  provides deterministic offline explanations, and keeps conversation history only in memory.
- `restaurant-dining-card.js` builds cards from the local profile and Phase 4G-A questions.
  Translation must preserve the card ID, restriction count, question count, order, and IDs.
- `restaurant-ingredient-explorer.js` searches the local knowledge base and restaurant glossary.
- `restaurant-dining-assistant-view.js` provides Ask ROOTS, evidence Decision Trees,
  simple/technical modes, staff-response scenarios, dining cards, and ingredient exploration.

Staff answers become structured evidence and require deterministic reevaluation. Gemini cannot
write or change verdicts, rankings, unknowns, or profile conflicts.

## Phase 4G-C Travel Mode

Travel Mode is a local communication layer over the active profile and deterministic Phase 4G-A
questions. It never requests location permission or tracks the device.

- `travel-storage.js`: IndexedDB `roots-travel-v1` with separate destinations, packs, cards, and
  phrases stores. Only current destination/language and speech/card preferences use localStorage.
- `travel-language-packs.js`: versioned, 512 KB-bounded packs; exact Jain option expansion;
  allergy-first sections; strict ID/count-preserving optional Gemini translation; atomic updates.
- `travel-glossary.js`: regional aliases, country notes, and general-knowledge terms that may
  explain uncertainty but never confirm dish contents.
- `travel-speech.js`: device speech voice matching, normal/slow rate, pause/resume/stop/repeat.
- `travel-mode.js` and `travel-card-view.js`: manual setup, full-screen cards, saved cards,
  offline glossary, source toggle, copy/share/print, wake-lock consent, and deletion controls.

Cards preserve source and translated text, transliteration remains separately labeled, prices
retain the restaurant currency code without conversion, and profile fingerprints mark stale cards.
The Home SVG defines one `roots-canonical-package` symbol reused by the main package and phone
view. Phone scale is `.68`; the three flash states last 110 ms. Flash is screen-contained and
removed under reduced motion. Phone opacity remains 1 through every scan and flash state.

## Phase 4A decisions

Home uses one front-facing, two-dimensional smartphone over one package. The controller advances
through `idle`, `entering`, `scan_one`, `scan_two`, `scan_three`, `complete`, `exiting`, `result`,
and `reset` in about 4.6 seconds. The phone remains fully opaque through all three scan states;
opacity changes only during exit/reset. Reduced motion shows the phone, frame, three indicators,
and result without travel, recoil, or flashing.

New profiles store only the religious ID `jain`. Its strict baseline enables meat/fish/seafood,
egg, onion/garlic, root-vegetable, honey, and animal-additive avoidance; fermented ingredients,
mushrooms, and artificial additives default off. Every option is editable and wording must
describe the user's settings rather than make universal claims about Jain practice.

Profile schema v1 records containing `strict_jain` or `custom_jain` migrate to schema v2 in the
existing storage key. Custom values win conflicts, missing values use the baseline, the raw record
is backed up under `roots-jain-unification-backup-v1`, and completion is marked by
`roots-jain-unification-migration-v1`. Legacy IDs remain valid only for migration/history display.

## Offline and network boundaries

### Phase 5A performance architecture

See `PERFORMANCE.md` for baseline and final measurements. Home loads the critical scanner path
only. `feature-loader.js` loads coarse Assistant, Restaurants/Saved, and Travel groups on intent;
the service worker caches those static files after first use. `network-client.js` supplies
timeouts, abort propagation, bounded transient retry, and in-flight deduplication. The
development-only `performance-monitor.js` is disabled by default and never records personal data.

### Phase 4H personalization

`personalization-storage.js` keeps a bounded, versioned index of explicit product, restaurant,
dish, cuisine, store, and ingredient favorites plus Grocery Mode preferences. Existing history,
Saved product, meal, and order keys remain unchanged. `recommendation-engine.js` ranks only
locally known records whose stored deterministic verdict is compatible; Avoid, Caution, unknown,
and poor-match records cannot become recommendations. Alternative products are never fabricated:
they must already exist as Safe records on the device, and similarity labels are traceable to
shared product terms.

`smart-search.js` builds an in-memory index of local products, history, favorite restaurants,
saved meals, and the bundled ingredient knowledge base. `personalization-view.js` renders the
time-aware greeting, Recently Safe, explicit favorites, Continue Shopping, recommended saved
orders, Grocery Mode, and unified local search. No personalization module calls AI or a network
provider. The active profile is used only as a restriction boundary; medical conditions are not
inferred.

Home, profiles, theme, history, Saved reports, shopping data, and previously cached barcode
products work offline. Uncached barcode lookup, label OCR/translation, and AI tools require
internet. The service worker caches static same-origin shell assets only; it must never cache OCR,
AI, API responses, or personal records.

## Security and privacy

- Treat product, ingredient, OCR, translation, profile, search, issue, and AI text as untrusted.
- Escape values before controlled templates and validate image URL protocols.
- Do not print provider bodies, prompts, keys, images, or profile content.
- `.env` is gitignored and holds backend-only provider secrets. `www/runtime-config.js` is public
  and contains only the API base URL. No secret belongs in frontend code or native assets.
- The current direct Gemini client architecture cannot conceal a production key; restrict its API
  and quota for internal testing and move secrets behind a backend before broad public release.

## Lifecycle and accessibility

- Stop camera tracks when capture closes or the document backgrounds.
- Revoke temporary blob URLs and close image bitmaps.
- Destroy temporary report/image listeners and timers.
- Pause Home animation/tips offscreen, backgrounded, and under reduced motion.
- Preserve browser zoom, visible focus, keyboard modal control, 48px coarse-pointer targets,
  meaningful headings, live status announcements, and non-color status labels.

## Native identity

`app.ahimsabytes.butisitjain` is deliberately retained because changing it changes App Store and
Play Store identity. Native projects are generated artifacts; edit `www/`, then sync.

## Verification

```powershell
node --test tests/*.test.js
.\.venv\Scripts\python.exe test_api.py
python -m http.server 5500 --directory www
```

Before release, also verify every service-worker asset, clean console/network logs, System/Light/
Dark themes, 320/360/390/412/768/1024 widths, landscape, keyboard navigation, reduced motion,
offline reloads, cached and uncached recovery, camera cleanup, and real-device VoiceOver/TalkBack.
