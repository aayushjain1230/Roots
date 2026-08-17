# ROOTS Phase 6A restriction architecture

Phase 6A adds a canonical, deterministic restriction layer without rewriting existing profile,
history, Saved-product, Saved-meal, restaurant, or order records. The existing
`roots-profile-v1` key and schema-v2 compatibility fields remain authoritative for earlier
features. New selections live in the profile's `restrictions` array and use restriction schema 1.

## Taxonomy and public APIs

The eight stable categories are Religious Diets, Food Allergies, Digestive Health, Medical and
Clinical Diets, Lifestyle Diets, Food Sensitivities, Ingredient Preferences, and Custom
Restrictions. `restriction-definitions.js` owns category and restriction metadata. Every
restriction has an explicit type, rule version, evidence flags, settings, aliases/terms, and a
deterministic rule or a bridge to an existing deterministic rule.

`ROOTS_RESTRICTIONS` exposes:

- `getCategories()`, `getRestriction(id)`, and `getRestrictions(categoryId)`
- `search(query, options)` using one cached, normalized index
- `getSelected(profile)` with legacy bridges and explicit selections deduplicated
- `validateSelection(profile)` and `compileProfile(profile)`
- `getRuleTrace(result)`

Search matches labels, descriptions, categories, common terms, regional names, ingredient terms,
and related-condition language. Search never enables a restriction. UI output is escaped.

## Profile navigation and storage

`ROOTS_PROFILE_EDITOR` provides a category-first full-screen editor. Its Home renders search,
a compact selected summary, and eight category rows—not the full taxonomy. Category pages
lazy-render only one category, sort selected restrictions first, and group allergy rows.
Restriction details render configuration separately. Save is explicit; Cancel discards the draft.

The profile validator accepts `restrictions: [{ id, enabled, settings }]`, rejects unknown IDs,
deduplicates entries, and preserves every previous field. The one-time
`roots-restriction-migration-v1` marker records the migration and
`roots-restriction-backup-v1` preserves the pre-migration profile. No historical or Saved keys are
rewritten. Legacy Dairy-Free maps only to `lifestyle_dairy_free`; legacy Gluten-Free maps only to
`legacy_gluten_free`. Neither becomes Milk Allergy or Celiac Disease.

## Restriction-type policy

- Allergies produce Avoid from confirmed direct evidence and use the user's cross-contact policy.
- Medical and religious selections use only their declared deterministic rules; ROOTS makes no
  diagnosis and does not claim one religious interpretation is universal.
- Digestive, intolerance, and quantity-sensitive rules produce Caution when serving evidence is
  absent.
- Sensitivities use cautious language for disputed or user-specific triggers.
- Preferences produce Preference and never outrank allergy, medical, or religious conflicts.
- Custom restrictions remain separate and retain their existing aliases and severities.

## High-value rule policies

### Allergies

Peanut, individual tree nuts and the tree-nut group, milk, egg, wheat, soy, sesame, mustard,
celery, lupin, fish, shellfish, mollusks, corn, and Oral Allergy Syndrome have explicit terms.
Tree-nut group settings can retain all legacy nuts or a selected subset. Contains, may-contain,
shared-equipment, and shared-facility evidence uses the existing cross-contact configuration.

### Celiac and gluten sensitivity

Celiac Disease is separate from Gluten Sensitivity and legacy Gluten-Free. Celiac tracks wheat,
barley, rye, malt, brewer's yeast, spelt, farro, einkorn, semolina, durum, triticale, oats,
modified starch, certification settings, and cross-contact preferences. Gluten Sensitivity has
its own oat, trace, and certification settings. Unknown source or certification never becomes
Safe.

### Low FODMAP

Low FODMAP supports elimination, reintroduction, and personalized modes plus fructans, GOS,
lactose, excess fructose, sorbitol, mannitol, xylitol, maltitol, and other polyols. Onion, garlic,
inulin, chicory root, agave, concentrates, sugar alcohols, legumes, and wheat create
quantity-dependent Caution when serving evidence is unavailable. It is not a binary blacklist.

### Low Histamine

Fermented and aged foods, vinegar, yeast extracts, processed meat, and certain fish products use
cautious possible-trigger wording. Disputed foods are quantity/user-specific evidence, not
confirmed medical fact.

### Alpha-Gal

Mammalian meat, lard, tallow, collagen, configurable gelatin and dairy, and source-dependent
glycerin, stearates, flavors, and capsules are modeled separately. Carrageenan is explicitly not
treated as mammalian.

### Lactose, Oral Allergy Syndrome, and corn

Lactose Intolerance is quantity-sensitive and recognizes lactose-free wording; it is never
converted to Milk Allergy. Oral Allergy Syndrome carries preparation-dependent evidence and can
allow cooked forms when raw-only mode is selected. Corn directly covers corn/maize while
dextrose, maltodextrin, modified starch, citric/ascorbic acid, xanthan gum, caramel color, and
flavor carriers remain source-dependent.

### Medical and sensitivity rules

Low Sodium uses a configured per-serving threshold foundation and yields quantity uncertainty
when nutrition evidence is missing. PKU flags phenylalanine and aspartame without treatment
advice. Renal and Vitamin K consistency profiles remain quantity-evidence systems. Sulfite, MSG,
caffeine, and artificial-sweetener sensitivities are distinct from allergies.

## Conflicts and multiple reasons

`ROOTS_RESTRICTION_CONFLICTS.detectConflicts(profile)` reports overlaps without silently removing
anything. Milk Allergy plus Lactose Intolerance, Celiac plus Gluten Sensitivity, tree-nut group
plus individual nuts, and Vegan plus Pescatarian remain active. Safety-critical reasons sort
before preferences. Ingredient evaluation preserves multiple restriction IDs and deterministic
reason ordering.

## Regional aliases

The taxonomy/search/rule layer includes groundnut/peanut, maize/corn, soya/soy, regional milk
terms, coeliac/celiac, sulphite/sulfite, and E220–E228. The ingredient parser preserves original
label text while evaluation uses normalized terms.

## Phase 6B handoff

`ROOTS_RULE_TRACE.ingredientHandoff()` supplies ingredient name and canonical ID, original label
term, verdict, restriction IDs, aliases, confirmed evidence, source/quantity/preparation
uncertainty, cross-contact and certification evidence, ordered rule trace, settings, region,
verification questions, and engine version. Phase 6A does not generate the extended AI
explanation. Gemini does not participate in selection or compatibility.

## Privacy, accessibility, and performance

Profiles remain local. Normal browsing and search make no network or AI call and send nothing to
restaurant/search providers. The editor uses labeled search, 48px-or-larger controls, explicit
selected state, semantic headings, status announcements, focus restoration, and neutral
non-color-only wording. Definitions load once, the search index builds once, category DOM is
lazy, and only the active category rerenders.

