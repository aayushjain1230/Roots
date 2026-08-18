# ROOTS phases 10–14

## Phase 10 — Ask Roots

Ask Roots is a conversational explanation surface over structured ROOTS data. The request context is
bounded to the active effective rules, deterministic decision, evidence claims, unresolved items, and
resolution questions. Generated answers must cite only supplied evidence IDs. Invalid citations,
guaranteed-safety language, malformed output, or an attempted verdict change cause a deterministic
fallback. The model remains explanatory and cannot become a compatibility authority.

## Phase 11 — Travel and Dietary Passport

Offline travel packs snapshot the exact effective rules used to generate them. Dining cards retain the
IDs of deterministic server questions and their source evidence. Translation validation continues to
reject added, removed, reordered, weakened, or strengthened restrictions. Destination, packs, cards,
and phrases stay on-device.

## Phase 12 — Recipes, meals, and Saved

AI recipe transformations and meal ideas are candidates, not compatibility decisions. Generated
ingredient text is re-parsed by the shared dietary engine and receives `MATCH`, `CONFLICT`, or
`VERIFY`. Unknown ingredients under an active restriction propagate `VERIFY`; AI prose cannot promote
a conflicting meal. Existing Saved products, restaurant meals, orders, history, and shopping storage
remain compatible. New Saved product records also retain evidence, effective rules, decision, and
resolution snapshots.

## Phase 13 — Reliability assault

The regression suite prioritizes false negatives. It covers OCR misspellings, multiple simultaneous
allergies, conflicting physical-label/database formulations, incorrect barcode identity, stale and
undated evidence, prompt-like label text, incomplete restaurant descriptions, and missing
cross-contact procedures. Existing retry, cancellation, timeout, offline, injection, release-profile,
and large-menu suites remain mandatory.

## Phase 14 — Analytics and beta infrastructure

Beta metrics are off by default and require an explicit Settings toggle. Metrics remain solely in
localStorage; this phase adds no analytics vendor or network transport. Only whitelisted categorical
fields are retained. Foods, ingredients, profile rules, questions, photos, addresses, coordinates, and
user identifiers are not accepted. Events are capped at 1,000 and 90 days. Turning metrics off clears
them.

The local summary reports scan completion, VERIFY frequency, resolution attempts/success, corrections,
restaurant searches, menu analyses, saves, active days, 7/30-day retention eligibility, and the
VERIFY-to-RESOLVED rate. A missing denominator is reported as `null`, never as success.

## Known external dependency

Manufacturer, certification, restaurant, and menu resolution can only become available when genuine
providers are configured. ROOTS does not fabricate those sources, and local metrics are not silently
uploaded. A future beta backend must require a separate privacy review and explicit transmission
consent before any aggregate leaves the device.
