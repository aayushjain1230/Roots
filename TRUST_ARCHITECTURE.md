# ROOTS trust architecture

This document records the reliability contract implemented across the evidence, profile, scanner,
decision, report, restaurant, menu, and cross-contact layers. It supplements the existing project
documentation; it does not replace legacy-storage compatibility notes.

## Authority boundaries

- `www/evidence-model.js` records claims, product scope, source, observation time, direct versus
  inferred status, freshness, and source conflicts. Physical labels, current certifications,
  manufacturers, and official restaurant material are Tier A. Structured datasets are Tier B.
  Community consensus/reports and inference remain lower tiers and cannot silently become facts.
- `www/effective-rules.js` expands the active profile into a stable rules snapshot. Diet names are
  presets; allergies, medical restrictions, religious/lifestyle presets, settings, cross-contact
  preferences, and custom restrictions remain separate effective rules.
- `www/dietary-rules.js` remains the sole deterministic packaged-food compatibility evaluator.
  Gemini extracts, translates, and explains; it does not set a verdict.
- `www/decision-engine.js` maps deterministic evaluation plus evidence to `MATCH`, `CONFLICT`, or
  `VERIFY`. Missing ingredients, unresolved terms, and source conflicts cannot become `MATCH`.
- `www/resolution-engine.js` records which trusted source classes are available and generates only
  questions grounded in unresolved evidence. It never fabricates manufacturer or certification data.

## Packaged-food flow

`camera/barcode -> OCR or Open Food Facts -> normalized product -> evidence bundle -> effective
rules -> deterministic dietary evaluation -> MATCH/CONFLICT/VERIFY -> resolution state -> report and
history`

When a current physical label differs from an earlier barcode dataset response, both claims are
retained. The current label receives higher source authority; the disagreement remains visible and
prevents an unqualified match when material uncertainty remains.

## Restaurant and menu flow

`restaurant result -> normalized menu -> dish evidence -> dietary rules -> cross-contact assessment ->
dish report -> personalized restaurant ranking`

Menu descriptions are not complete ingredient lists. An unreviewed description therefore propagates
`NEEDS_CONFIRMATION` unless complete ingredient evidence is explicitly supplied. Restaurant dietary
labels are supporting evidence, never truth. Cuisine knowledge can add a question but cannot create a
safe or avoid conclusion by itself.

`www/restaurant-cross-contact.js` distinguishes official preparation facts from unknowns. Shared
fryers, grills, utensils, and preparation areas follow the active profile's cross-contact preference.
Missing preparation data generates a verification question, not a percentage or safety claim.

## Persistence and compatibility

Scan history keeps the existing key and schema compatibility while adding `effectiveRules`,
`evidence`, `decision`, and `resolution` snapshots to new records. Older records continue through the
legacy rendering path and are not rewritten or deleted.

## Network and offline limits

The static engines, profile, history, saved reports, and cached product data work locally. New OCR,
translation, uncached barcode data, AI explanations, and remote restaurant/menu acquisition require
the configured backend/provider. Provider responses, OCR output, AI output, and personal data are not
stored in the service-worker static cache.

## Non-goals

This layer does not claim certification, manufacturer confirmation, restaurant procedures, or current
formulation data when those sources are absent. It does not introduce numeric confidence. It does not
make AI authoritative and does not add a second scanner, profile engine, router, or restaurant stack.
