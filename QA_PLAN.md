# ROOTS Phase 5E-A QA Plan

Date: 2026-07-30  
Candidate version: 2.0.0  
Safety rule: deterministic verdict expectations are never relaxed to obtain a pass.

## Test layers

| Layer | Coverage |
|---|---|
| Unit | Normalization, parsing, profiles, dietary/allergy/cross-contact rules, evidence, ranking, meal aggregation, questions, storage validators |
| Integration | Barcode/OCR evidence through reports, profile migration, menu-to-dish-to-ranking, meal persistence/recheck, Travel packs, service-worker manifest |
| Release-candidate fixtures | Eight fixed profiles across 22 product fixtures plus restaurant freshness/source fixtures |
| Backend/security | Schemas, upload signatures, limits, rate limiting, SSRF, CORS, CSP, secret scans, provider-failure contracts |
| Browser walkthrough | Startup, Home, four tabs, Settings, themes, Travel lazy load, offline reload, offline Saved |
| Contract accessibility | Headings, labels, focus/modal contracts, live regions, reduced motion, touch sizes, scalable viewport |
| Performance regression | Existing Phase 5A thresholds plus repeated deterministic scans |
| Native/device | Matrix only; unavailable platforms remain Not tested |

## Fixed profiles

The executable definitions are in `tests/fixtures/qa-fixtures.js`.

| ID | Definition |
|---|---|
| qa-profile-a-vegetarian | Vegetarian, standard cross-contact |
| qa-profile-b-jain | Jain defaults: meat/fish/egg/onion/garlic/roots/honey avoided; mushrooms and fermented ingredients allowed |
| qa-profile-c-jain-custom | Jain; onion/garlic, mushrooms, honey avoided; roots and fermented ingredients allowed |
| qa-profile-d-halal | Halal, standard cross-contact |
| qa-profile-e-kosher | Kosher, standard cross-contact |
| qa-profile-f-vegan-allergy | Vegan; peanut and sesame allergies; strict cross-contact |
| qa-profile-g-gluten-dairy-free | Gluten-Free and Dairy-Free |
| qa-profile-h-complex | Jain, Vegan, Gluten-Free, peanut allergy, MSG avoidance, strict cross-contact |

## Product fixtures

The 22 executable fixtures cover clearly Safe/Avoid/Caution results, ambiguity, nested and
parenthetical ingredients, malformed punctuation, multiple allergens, may-contain/shared-facility
evidence, Jain roots/onion/garlic/egg/honey, gelatin, alcohol, artificial additives, natural
flavors, absent data, product-not-found, stale cache metadata, and user-corrected evidence.
Explicit safety expectations are embedded for relevant profiles; every fixture also runs through
every profile and must return a valid verdict or explicit insufficient-data state.

Strict cross-contact follows the implemented profile contract: Contains, May contain, and Shared
equipment are Avoid; Shared facility remains Caution. This is documented rather than silently
changed during QA.

## Restaurant fixtures

- `qa-restaurant-strong`: current official structured menu.
- `qa-restaurant-unknown`: nearby OCR-only menu with unknown freshness.
- `qa-restaurant-stale`: stale official-PDF menu.

Existing suites add hundreds of dishes, official allergen guides, unknown sauces/broths, supported
and unsupported modifiers, stale/partial menus, cross-contact, ranking, comparisons, saved meals,
Order Again, questions, and Dining Assistant evidence.

## Environments and data handling

Tests use synthetic records only. No production user data, real credentials, OCR photos,
coordinates, or provider responses are logged. Browser testing uses the existing local test
profile without inspecting browser storage. Destructive controls are validated through isolated
storage doubles and source contracts rather than deleting the operator's local browser data.

## Regression checklist

- Run all Node tests, both Python suites, and Python compilation.
- Validate every service-worker asset exists and private routes bypass cache.
- Scan `www/` for secrets and direct provider endpoints.
- Run locked dependency audit.
- Run Capacitor sync for every generated platform.
- Walk Home, AI, Restaurants, Saved, Settings, themes, Travel, and offline startup.
- Record all device, screen-reader, slow-network, and physical-platform gaps as Not tested.
- Apply the release-blocker policy in `BUG_TRIAGE.md`.

