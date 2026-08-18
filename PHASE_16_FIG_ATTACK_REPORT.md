# Phase 16 — Competitor attack report

Perspective: a product and engineering team trying to keep a user on Fig rather than Roots.
This is an adversarial analysis, not an implementation backlog.

## P0 — trust failures that could prevent switching

1. **Coverage is not the same as architecture.** Roots has a thoughtful evidence model, but barcode
   breadth still depends primarily on Open Food Facts and a current physical-label scan. A competitor
   can win by having more complete normalized ingredient and formulation records before a user scans.
2. **Resolution is mostly an architecture, not a live source network.** Manufacturer, certifier, and
   official restaurant corroboration are represented, but deployments do not yet provide a proven,
   broad resolution service. Many VERIFY results may remain unresolved.
3. **Severe-allergy trust needs real-world validation.** Deterministic rules reduce hallucination, but
   OCR omissions, incomplete labels, formulation changes, and absent cross-contact data still create
   false-negative risk. Physical label and manufacturer confirmation must remain primary.

## P1 — reasons a user may stay with an incumbent

1. **Onboarding complexity.** Roots supports granular combined profiles, but more choices can make the
   first useful result slower than a simpler preset-driven competitor.
2. **Restaurant availability varies by deployment.** The provider abstraction is sound, but a provider,
   menus, allergen guides, and current preparation evidence must actually exist in each market.
3. **Local-only data limits continuity.** Privacy is strong, but users changing phones cannot yet sync
   profiles, scans, family members, or saved meals.
4. **Community evidence lacks a mature network.** Schemas cannot replace enough recent, moderated,
   location-specific contributions.
5. **OCR and AI require a reachable backend.** A misconfigured endpoint makes major features appear
   broken even while offline history and deterministic evaluation still work.

## P2 — product friction

1. Recipe and meal generation is safety-checked after generation, but suggested substitutions still
   need dependable product and ingredient availability.
2. Menu import has conservative limits; image-only PDFs and blocked restaurant websites require a
   protected server acquisition path.
3. Travel packs help offline, but language and country coverage is bounded and should not be marketed
   as universal.
4. No account is a privacy advantage and a support disadvantage: recovery and multi-device continuity
   are unavailable.
5. The extensive feature surface can dilute the core scan-result loop if navigation and onboarding do
   not keep scanning immediate.

## P3 — perception and growth weaknesses

- The retained legacy bundle ID is invisible in most UI but weakens brand cleanliness in operational
  tooling until a deliberate store-identity decision is made.
- “Safe/Caution/Avoid” legacy records coexist with MATCH/CONFLICT/VERIFY compatibility; explanations
  must stay consistent during migration.
- Public support, privacy, status, and review evidence are not yet live.
- There is no demonstrated independent expert advisory process or published correction SLA.

## Defensible differentiation

- Physical-label evidence can outrank stale product records.
- Deterministic rules, explicit unknown propagation, and AI authority boundaries are stronger than a
  single opaque score.
- Combined religious, allergy, medical, lifestyle, and custom rules share one engine.
- Explainable restaurant dish and cross-contact evidence is more useful than cuisine labels.
- Local-first storage and opt-in, non-identifying measurement support a trust-first position.

## Ranked response

Do not imitate every competitor feature. First prove scan false-negative performance, resolution
coverage, provider uptime, and correction handling. Next reduce time-to-first-use and expand official
source coverage. Cloud sync/community scale should follow only with explicit privacy design and a
clear user benefit.
