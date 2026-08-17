# ROOTS Engineering Specification

Version: 1.0  
Status: Living document

## Purpose

ROOTS is a universal dietary assistant centered on one question: “Can I eat this?” It combines
barcode scanning, label OCR, deterministic dietary evaluation, AI assistance, saved history,
offline app-shell support, and future restaurant recommendations.

This document is the product-level source of truth. Detailed subsystem contracts and engineering
decisions should be added here as they are approved.

## Phase 4A decisions

- Home uses one flat, front-facing smartphone and one package. Its explicit states are `idle`,
  `entering`, three scan states, `complete`, `exiting`, `result`, and `reset`.
- Phone opacity remains 1 through entry and all scan states. It changes only after completion.
- Reduced motion shows a static phone, camera frame, scan indicators, and result without travel.
- Profile schema version 2 stores one canonical `jain` selection with editable practices.
- The Jain baseline avoids meat/fish/seafood, eggs, onion/garlic, roots, honey, and animal-derived
  additives. Fermented ingredients, mushrooms, and artificial additives default to allowed.
- Schema-v1 Strict Jain migrates to the baseline. Custom Jain values take priority and missing
  values use the baseline. Conflicts become one Jain entry, with raw backup and stable marker.
- Historical and Saved snapshots are retained. Their display labels normalize to Jain, while
  rechecks use the current profile. AI receives enabled and allowed Jain settings.
- Phase 4B begins with restaurant requirements and secure API/privacy architecture; Phase 4A adds
  no location, restaurant, menu, account, or payment behavior.

## Phase 4B decisions

- Restaurant discovery asks for location first and meal intent second.
- Location permission is requested only after `Use My Location`; denial, unavailability, and
  timeout lead to the manual-address path without repeated permission prompts.
- Manual address suggestions use an abstract provider contract, not a vendor-specific API.
- Radius supports 5, 10, 20, 30, and 50 miles and persists locally.
- Recent searches, recent locations, and Home/Work/favorites remain in localStorage with limits.
- Restaurant cards display provider evidence only: identity, cuisine, distance, hours, price,
  rating, and menu availability. Compatibility always reads `Not yet analyzed`.
- Restaurant lists and search metadata may be cached for 30 minutes. Menus, dishes, and personal
  data are excluded from the service-worker cache.
- Phase 4C implements menu retrieval, import, OCR, translation, parsing, review, and structured
  storage. Compatibility ranking, restaurant AI, and invented results remain prohibited.

## Phase 4C normalized menu contract

Phase 4D receives schema version 1: restaurant identity; menu ID/title/type/language; validated
source type/provider/official flag/URL and timestamps; derived freshness; ordered sections and
dishes; original and separately translated names/descriptions; prices, sizes, modifiers, options;
unverified dietary/allergen labels; menu notes, footnotes, dietary legend; source page IDs;
extraction method/evidence category/warnings; and user corrections/review state.

It contains no dish verdict, compatibility state or score, recommendation, modification advice,
ingredient claim, or restaurant ranking. Phase 4D must treat descriptions and labels as evidence
and may not infer unstated ingredients.

Only validated HTTPS remote URLs are retained. Protected pages use `requires_backend_proxy`.
OCR preserves original text before translation, processes pages sequentially, and reuses hashes.
Full menu photos are not stored. Embedded PDF text is supported; image-only PDF rendering is a
documented local-adapter limitation.

## Phase 4D evidence and verdict contract

Each dish produces schema version 1 with one verdict (`SAFE`, `SAFE_WITH_MODIFICATION`,
`NEEDS_CONFIRMATION`, or `AVOID`), summary, evidence level, source-separated evidence, confirmed
and possible ingredients, restaurant notes, profile conflicts, warnings, supported modifications,
unknowns, rule trace, evidence graph, profile/source snapshots, and evaluation time.

Evidence levels are confirmed, likely, needs confirmation, and unknown; percentages are prohibited.
The engine considers menu descriptions, official ingredient/allergen/nutrition evidence supplied
through the provider boundary, menu labels, the ROOTS ingredient database, active diets/allergies,
cross-contact preferences, custom restrictions, supported modifiers, and preparation uncertainty.
Cuisine knowledge can only create an unknown; it cannot prove Safe or Avoid.

`SAFE` requires complete resolved evidence. `SAFE_WITH_MODIFICATION` requires every confirmed
conflict to have an explicit menu-supported removal or replacement and no remaining unknown.
`NEEDS_CONFIRMATION` propagates missing descriptions, unknown components, uncertain sources,
preparation uncertainty, extraction warnings, or applicable caution-level cross-contact.
`AVOID` requires confirmed rule or allergy conflict, including strict cross-contact when selected.

Restaurant labels such as Vegan, GF, Halal, or Jain are unverified supporting evidence. They do not
override ingredient evidence. Gemini and other LLMs are excluded from verdict generation.

## Phase 4E restaurant-summary and ranking contract

Ranking version 1 outputs restaurant/profile identity, visible match category, practical dish
counts, compatible-section and deduplicated-family variety, categorical evidence strength,
freshness, meal-intent relevance, cross-contact burden, customization quality, information
completeness, reasons, limitations, preview dish IDs, secondary restaurant metadata, and internal
components. The internal numeric value is never user-facing.

Excellent Match requires several practical Best Choices, multiple sections/families, strong
evidence, current-enough data, low uncertainty, and relevant meal intent. Good Match requires
confirmed choices and adequate evidence. Limited Options represents a small workable set. Needs
More Information represents absent, partial, limited, stale, or mostly uncertain evidence. Poor
Match is available only when strong evidence confirms conflicts and no practical compatible or
modifiable choice exists.

Evidence levels are Strong, Moderate, and Limited and remain separate from compatibility. Menu
intent uses deterministic conservative mappings. Cuisine, ratings, popularity, and distance never
prove dietary usefulness. Distance and closed status are secondary current-session tie-breakers.
Duplicate sizes/variants share one family, while sauces/condiments/toppings/sides do not inflate
meal variety.

Phase 4F receives each dish identity and verdict; explanation; confirmed/likely ingredients;
unknowns; supported modifications and modifier options; cross-contact concerns; menu notes;
profile conflicts; evidence source and strength; plus restaurant-level limitations. Phase 4F may
build dish ordering guidance and complete-meal construction, but Phase 4E does not.

## Phase 4F-A meal and order contract

A version-1 meal contains restaurant, menu, and profile snapshots; one main; optional sides,
drinks, desserts, and extras; selected menu-supported options; a published portion choice;
timestamps; and aggregated analysis. Components retain Phase 4D evidence rather than recalculating
restaurant compatibility.

Verdict precedence is Avoid, Needs Confirmation, Compatible, then Best Choice. Confirmed Avoid
components propagate Avoid. Unknown components, raw modifier text without enough ingredient
evidence, unresolved required changes, and preparation uncertainty propagate Needs Confirmation.
Compatible describes an evidence-complete meal with additions or supported changes. Best Choice
describes an unchanged fully safe main. Portion choice is informational and cannot make an unsafe
selection safe.

Alternatives must reference an existing normalized menu option or a Phase 4D supported
modification. The builder cannot create free-form substitutions. Gemini does not participate in
the verdict. Saved meals are bounded local order snapshots; restaurant memory remains outside
Phase 4F-A.

## Phase 4F-B persistence contracts

Saved Meal schema version 1 stores record identity, name, status and favorite; location-specific
restaurant identity; menu ID/schema/source/update/freshness/signature; profile fingerprint and
snapshot; exact main/components/modifiers/removals/instructions/portion; immutable historical
verdict, evidence, engine versions and evaluation time; private notes, personal confirmations,
tags, version snapshots, recheck state, timestamps, and use count.

Order History schema version 1 is separate: occurrence ID, optional saved-meal link, restaurant and
meal names, ordered timestamp/status, meal/profile/evaluation snapshots, optional three-state
restaurant-confirmation and received-as-requested fields, private note, and creation time. It
contains no symptom or reaction tracking.

Recheck statuses are current, recommended, required, and unavailable. Detection compares location,
menu/source dates, dish identity/name/description, modifier IDs/labels, components, allergen and
preparation metadata, profile fingerprint including cross-contact, and evidence/meal engine
versions. Price-only changes are informational. Historical evaluation is never overwritten;
current evaluation appears separately after deterministic recheck.

Storage uses bounded indexes and one key per record, not one unbounded payload. Migration is backed
up and idempotent. Archive hides without deletion; deletion is explicit and non-cascading. Saved
cards trigger no menu fetch or reevaluation. Personal notes are escaped, local, non-official,
location-scoped, excluded from shares by default, and never upgrade verdicts. Private records are
never service-worker cache entries.

## Phase 4G-A server-question contract

A version-1 question set stores restaurant, dish, source context, engine version, generation time,
and ordered questions. Each question has ID, category, priority, text, reason, source evidence IDs,
and a compact evidence snapshot. A question without evidence linkage is invalid.

Categories are Ingredients, Preparation, Cross Contact, Modifications, and Other. High priority is
for unresolved compatibility or cross-contact evidence, medium for preparation and selected
modification confirmation, and low for optional unresolved detail. Confirmed-safe or unrelated
evidence creates no question.

Translation cannot decide, add, remove, merge, reorder, or answer questions. The adapter validates
the exact deterministic IDs and count before caching. Cached translations are offline-capable.
Copy/share output excludes internal evidence IDs. Speech uses device Web Speech and stops on close.
Printable output contains only the question sheet. Saved sets are local, bounded, escaped,
deletable, and separate from the static service-worker cache.

Phase 4G-B may receive the validated question set and optional selected translation to design the
signature visual server-facing Dining Card. It may not change question concerns or verdicts.

## Phase 4G-B Dining Assistant contract

ROOTS maintains a two-brain boundary. The deterministic restaurant engine owns verdicts,
ingredients, unknown propagation, cross-contact rules, modifications, and rankings. Gemini only
explains or translates a bounded structured context.

AI explanations return an answer and evidence IDs. Citations absent from the supplied evidence
reject the response and trigger a deterministic local fallback. Missing evidence produces:
“I don't know based on current restaurant information.”

The Decision Tree renders existing evidence and rule trace. Staff-response simulations use fixed
responses and create `restaurant_staff_response` evidence; compatibility cannot change without a
deterministic reevaluation callback. Dining-card translations preserve card ID, restriction count,
question count, question order, and question IDs. Conversation history exists only in the current
JavaScript session.

## Phase 4G-C Travel Mode contract

A destination is manually selected and stores country, optional city/region, primary and selected
languages, currency code, timestamps, and installed-pack IDs. Travel Mode never starts location
tracking. Currency is displayed as supplied with its ISO code and is never converted.

Language-pack schema version 1 contains language, region, version, source, profile fingerprint,
timestamps, byte size, and structured introduction, allergy, dietary, cross-contact, preparation,
modification, thank-you, and glossary arrays. Validation is fail-closed and enforces 512 KB. Packs
update atomically so a failed update retains the installed version.

Card hierarchy is allergies, religious/strict dietary restrictions, cross-contact, lifestyle
preferences, then dislikes. Jain phrases are emitted only for enabled Jain options. Regional
aliases and glossary entries are `general_knowledge`: they may adjust wording or create
uncertainty, never confirm dish contents or change a deterministic verdict.

Original, translated, and transliterated strings remain separate. New arbitrary translation is
unavailable offline; installed structured translations remain available. TTS uses installed
device voices without Gemini and supports normal/slow rate, pause, resume, repeat, and stop.

Private destinations, packs, cards, and phrases use IndexedDB. Small active settings use
localStorage. Each private store has an independent deletion control. Static modules alone enter
the service-worker shell.

The Home animation uses one canonical SVG package symbol twice. Explicit 110 ms flash states occur
only after each scan position; the phone stays fully opaque until exit. Reduced motion removes
flash and shows a static completed focus state.

## Trust principles

- Deterministic rules—not AI—must produce final dietary and allergy classifications.
- AI may extract, translate, explain, or transform content, but must not turn uncertainty into safety.
- Never invent ingredients, certification, cross-contact handling, or restaurant preparation details.
- Profiles are local-first. No profile data is sent to a server in Phase 2A.
- The interface should preserve the simple path: scan, get an answer, understand why, know what to do.

## Brand and design

- Product name: ROOTS
- Product question/tagline: “Can I eat this?”
- Tone: calm, direct, inclusive, practical, and honest
- Identity: navy/periwinkle primary, coral accent, status-specific Safe/Caution/Avoid colors
- Typography: Sora for display headings; Plus Jakarta Sans for interface and body copy
- Themes: System, Light, and Dark
- Accessibility: visible focus, practical 48px targets, semantic labels, reduced motion, scalable text

## Navigation

Phase 1 uses four bottom destinations:

1. Home
2. AI
3. Restaurants
4. Saved

Settings remains globally accessible outside the bottom navigation. Saved contains scan history and
the retained shopping list. The Restaurants destination remains an honest empty state until its phase.

## Phase 2A profile architecture

Storage keys:

- Active profile: `roots-profile-v1`
- Migration marker: `roots-profile-migration-v1`
- Raw legacy backup: `roots-legacy-profile-backup-v1`
- Invalid new-profile backup: `roots-profile-invalid-backup-v1`
- Preserved legacy source: `bij-profile-v4`

The Version 1 profile uses one active profile with an `id` so multiple profiles can be introduced
later without redesigning the profile object.

Supported selections:

- Religious: Strict Jain, Custom Jain, Halal, Kosher, Hindu Vegetarian
- Lifestyle: Vegetarian, Vegan, Pescatarian, Dairy-Free, Egg-Free, Gluten-Free
- Allergies: Peanuts, Tree Nuts, Milk, Eggs, Soy, Wheat, Sesame, Fish, Shellfish, and custom
- Cross-contact: Standard, Strict, or resolved Custom values
- Personal: dislikes and custom Avoid/Caution/Preference rules

Halal and Kosher are stored but are not evaluated by the Phase 2A scanner. ROOTS blocks classification
when either is active until the universal rules engine exists.

## Profile schema

```json
{
  "schemaVersion": 1,
  "id": "default",
  "name": "My Profile",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "onboardingComplete": true,
  "religiousDiets": [{ "id": "strict_jain", "enabled": true, "options": {} }],
  "lifestyleDiets": [{ "id": "vegan", "enabled": false, "options": {} }],
  "allergies": [{
    "id": "peanut",
    "label": "Peanuts",
    "normalizedTerm": "peanut",
    "type": "built_in",
    "severity": "standard",
    "customAliases": []
  }],
  "crossContact": {
    "preset": "standard",
    "contains": "avoid",
    "mayContain": "caution",
    "sharedEquipment": "caution",
    "sharedFacility": "caution"
  },
  "dislikes": [{ "id": "dislike-id", "label": "Mushrooms", "normalizedTerm": "mushrooms" }],
  "customRules": [{
    "id": "rule-id",
    "label": "MSG",
    "normalizedTerm": "msg",
    "severity": "caution",
    "aliases": []
  }],
  "region": "US",
  "appLanguage": "en",
  "translationLanguage": "en"
}
```

## Phase boundaries

1. Foundation and UI shell — completed
2. Universal profile architecture
   - 2A: profile schema, onboarding, editing, migration, summaries, compatibility — completed
   - 2B: ingredient knowledge and universal deterministic rules — completed
   - 2C: scanner/report/history integration with the universal engine
3. Scanner and OCR overhaul
4. Safe/Caution/Avoid reporting
5. AI tools
6. Restaurant discovery and menu evaluation
7. Offline expansion
8. Backend proxy, key protection, rate limiting, and observability
9. Optional accounts and sync
10. QA, privacy review, and store release

## Security and privacy

- Do not commit API keys.
- The current direct Gemini client is temporary and exposes a configured key in a distributed bundle.
- A production backend proxy is required before public release.
- Do not add analytics, advertising, tracking, or cloud profile sync without an explicit later decision.

## Phase 2B dietary-engine contract

`window.ROOTS_DIETARY_ENGINE` exposes normalization, hierarchical parsing, allergen-statement
parsing, canonical resolution, ingredient evaluation, product evaluation, verdict aggregation,
knowledge lookup, rule metadata, and version getters.

Engine results use `SAFE`, `CAUTION`, `AVOID`, and `PREFERENCE`. Product verdicts use only
`SAFE`, `CAUTION`, and `AVOID`; preferences never escalate a product verdict.

Evidence levels are categorical: `confirmed`, `likely`, and `needs_confirmation`. Evidence types
remain distinct: `direct_ingredient`, `declared_contains`, `declared_may_contain`,
`shared_equipment`, `shared_facility`, `subingredient`, and `source_dependent`.

The knowledge base describes ingredients; profile rules determine outcomes. Alias resolution uses
exact normalized aliases first, then conservative whole-phrase matching. Free-from claims are not
treated as ingredient declarations. No unrestricted fuzzy matching is used.

Known Version 1 limitations:

- No certification-logo recognition or automatic certification trust.
- Only limited region-sensitive handling for unresolved gluten sources.
- Custom allergies use exact or conservative whole-phrase matching.
- Certification, region-sensitive rules, and uncommon aliases remain deliberately conservative.

## Phase 2C integration contracts

Production pipeline:

`barcode/OCR evidence -> ROOTS_SCAN_PIPELINE -> hierarchical parser -> ROOTS_DIETARY_ENGINE -> report -> schema-v3 history`

OCR retains original and translated full text, ingredient text, allergen text, detected language,
provider/version, and structured warnings. Translation aids matching but never replaces original
evidence.

Parsed products use schema version 1 and contain source/product identity, raw original/translated/
edited text, hierarchical ingredients, separate Contains/May Contain/Shared Equipment/Shared
Facility arrays, certifications passed through from the source, warnings, and source metadata.

Evaluation output remains the Phase 2B structured object. The UI adds `INSUFFICIENT_DATA` before
engine invocation when no ingredient evidence exists. Serious extraction warnings prevent an
otherwise Safe result from being presented without caution.

New scans use history schema version 3 with product identity, source provenance, a minimal complete
profile snapshot, engine/knowledge versions, structured evaluation groups, original/translated/
edited text, warnings, and scan time. Existing `bij-history-v2` data remains in place and is rendered
through a compatibility mapping. Rechecks use the current profile and do not mutate the saved result.

`ROOTS_SCAN_PIPELINE` also holds an in-memory current-scan context for AI explanation. No images or
full history are included. AI receives the active universal profile and is explicitly prohibited
from overriding deterministic results.

Manual ingredient review preserves original evidence, reparses edited text, reevaluates once, and
marks the current scan as user-edited. Phase 3 owns crop/rotate/retake, capture-quality improvements,
and richer source conflict comparison.

## Phase 3A final Home experience

Home retains only the top bar, tappable active-profile summary, decorative instructional animation,
local rotating tip, barcode action, label action, and bottom navigation.

`www/home-animation.js` creates one inline SVG and one controller instance. Its 4.8-second route uses
one directional flat camera at three SVG waypoints: lower package, top-left, and middle-right. The
camera artwork points right by default; waypoint rotations of -55, 38, and 180 degrees orient its
barrel toward the package center. One localized flash group is repositioned for three brief flashes.
The badge scales from .65 to 1.12 and settles at 1.

Animation colors derive from light/dark CSS variables. Page visibility, active view, hidden scan
state, and `prefers-reduced-motion` control playback without creating new instances. Reduced motion
is a static composition with no flash, overshoot, or camera travel. Tips use one recursive timeout,
pause with the animation, and are not exposed as a live region.

The old Lottie asset and library remain as unreferenced provenance files and are excluded from the
Phase 3A service-worker shell. Phase 3B may address capture quality, crop/rotate/retake, and camera
workflow improvements; Phase 3A does not change scanning or evaluation behavior.

## Phase 3B label photo capture and review

Scan Label begins with an explicit source choice. Web camera capture prefers a rear-facing camera
and stops media tracks on exit, failure, or document hiding. Library images and camera captures
enter the same review controller before any OCR call.

Review state uses normalized crop coordinates and supports four-corner resize, crop movement,
pan/zoom/pinch, 90-degree rotation, revert, retake/replace, keyboard-accessible crop controls, and
non-blocking quality hints. The source is never persisted. Use Photo creates a cropped and rotated
JPEG (quality 0.92, maximum long edge 2200px) and hands it once to the unchanged Phase 2C pipeline.

Automatic label-boundary detection is deliberately omitted rather than simulated. Physical-device
camera and permission behavior still requires iOS and Android validation.

## Phase 3C processing, recovery, and failure states

One in-memory scan session coordinates barcode and label operations. Its stable ID, type, status,
stage, timestamps, attempt, cancellation flag, source metadata, warnings, normalized error, result,
and local timing metrics are exposed through `ROOTS_SCAN_PROCESSING.getActiveSession()`. Half-finished
remote work is never written to localStorage or restored after a full restart.

Barcode stages are Reading barcode, Finding product, Reading ingredients, optional Translating,
Organizing ingredients, Checking your profile, and Preparing result. Label stages are Preparing
photo, Reading ingredient label, Detecting language, conditional Translating, Organizing
ingredients, Checking your profile, and Preparing result. Updates occur at operation boundaries;
there are no percentages or timer-driven fake stages.

The chosen timeouts are 12 seconds for barcode decoding, 18 seconds for product lookup, 45 seconds
for OCR, 45 seconds for translation, and 5-second safeguards for parser and engine work. Network
fetches support actual abort. Non-preemptible local work is invalidated through the stable session
guard, preventing late report rendering or history writes.

Errors use stable barcode, product, image, OCR, translation, parser, engine, session, and unknown
codes mapped to safe user text. Provider bodies, HTTP status codes, exception names, and debug
metadata never enter the UI. Warnings have info, caution, or blocking severity.

No ingredients, empty OCR/parser output, missing product ingredients, or an extremely small crop
produce Insufficient Data rather than a verdict. Partial but usable evidence follows the Phase 2C
Caution policy and carries the warning into current-scan context and history.

Cached barcode products can be evaluated offline and are labeled as cached in the report. Uncached
lookups and Gemini label reading require internet. Reconnection enables Retry but never submits
automatically. Phase 3D may consume the successful processing handoff for report transitions and
verdict animation; Phase 3C does not redesign or animate reports.
