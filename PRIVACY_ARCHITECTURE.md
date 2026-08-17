# ROOTS Privacy and Data Inventory

ROOTS is local-first. Compatibility processing, profiles, history, saved products/meals, restaurant
memory, questions, theme, recommendations, and offline travel packs remain on the device unless the
user explicitly invokes a network-backed action.

## Data flows and providers

| Action | Data sent | Destination | Data deliberately excluded |
|---|---|---|---|
| Barcode lookup | Barcode/product identifier | Open Food Facts | Profile, allergies, history, coordinates |
| Label OCR | Selected image after client resizing and server metadata stripping | ROOTS API, then Gemini | History, saved items, location |
| Menu OCR | Selected menu page image after server sanitization | ROOTS API, then Gemini | Profile, allergies, restaurant memory |
| Translation | Only selected text/structured phrases and target language | ROOTS API, then Gemini | Unrelated profile/history/location |
| AI question/recipe/meals | User request plus explicitly assembled minimal dietary context | ROOTS API, then Gemini | Full storage, photos, exact coordinates |
| Dining explanation | Current dish/restaurant evidence needed for that explanation | ROOTS API, then Gemini | Other restaurants, permanent conversation history |
| Restaurant/geocoding | Meal query, selected/manual location, radius | Configured restaurant/map provider | Dietary profile and allergy list |

Gemini receives evidence to extract or explain. Its result cannot override deterministic verdicts.
ROOTS does not send recommendations or local behavior for advertising and does not add analytics,
device fingerprinting, or advertising identifiers.

## Local storage inventory

- `roots-profile-*` and migration backups: active dietary profile and safe migration recovery.
- `bij-history-v2`, saved-product and shopping keys: product reports and explicit saved items.
- `roots-menu-*`, restaurant search/ranking/cache keys: bounded menus and disposable search data.
- Per-record saved-meal, order, note, question, and translation keys: explicit restaurant memory.
- `roots-travel-*` IndexedDB/local settings: offline packs, cards, destinations, and phrases.
- `roots-personalization-v1`: explicit favorites and usage-derived local preferences.
- Theme, onboarding, navigation, performance opt-in, and feature metadata.

LocalStorage and IndexedDB are not encrypted databases. Device/OS access or another script executing
in the origin may read them. Users should use device encryption and screen locks.

## Retention and deletion

Bounded caches use LRU/count/age controls defined by their modules. Chat is limited to recent turns;
Dining Assistant conversation is session-only. Saved records remain until the user deletes them.
Settings exposes separate profile, history, restaurant, saved-meal, note, cache, destination, travel
pack/card, and phrase controls so deletion is scoped. Migration backups remain to prevent data loss
until a later reviewed migration retires them. Phase 5D performs no destructive migration.

Before account/sync work, add a single reviewed “Delete all local ROOTS data” workflow with a typed
confirmation, a complete versioned storage registry, Cache Storage/IndexedDB cleanup, and automated
proof that unrelated origins cannot be affected.

## Data retention policy

- Provider request bodies: processed transiently; ROOTS application code does not persist them.
- Backend logs: no content; retain operational metadata for the shortest practical incident window.
- OCR/menu caches: local and bounded; removable by existing data controls.
- Saved reports/meals/travel cards: user-controlled retention.
- Exact coordinates: used for the selected search; never logged by ROOTS.

Production operator privacy policy and provider retention settings must be reviewed and published in
Phase 5E. This engineering document is not the public privacy policy.

