# ROOTS Phase 6B explanation architecture

## Authority boundary

ROOTS has one compatibility authority: its deterministic packaged-food, restaurant, ranking, and meal engines. The explanation layer receives a completed verdict and evidence. It cannot write verdicts, mutate rule traces, add restrictions, or resolve profile conflicts.

Gemini is optional. Quick and Technical Evidence modes are local. Detailed and Simple modes display deterministic content first and may request clearer wording from the protected backend. Invalid or unavailable model output is replaced with deterministic fallback text.

## Modules

- `explanation-context.js` builds a bounded, versioned context containing only the subject, relevant restrictions, evidence, uncertainty, aliases, questions, and engine versions.
- `explanation-templates.js` renders Quick, offline Detailed, offline Simple, and Technical Evidence output.
- `verification-questions.js` converts deterministic uncertainty into at most six questions.
- `alternative-suggestions.js` returns only locally stored products or menu-supported dishes that already have compatible deterministic evaluations.
- `explanation-cache.js` stores bounded generated text and translations. It never stores images, prompts, history, location, or provider credentials.
- `explanation-translation.js` validates translated verdicts and warning preservation.
- `explanations.js` coordinates local output, guarded backend requests, cancellation, validation, retry, and fallback.
- `evidence-explorer.js` provides the accessible Quick/Detailed/Simple/Evidence interface.

## Context schema

Schema version 1 includes the context type; subject ID, canonical name, display name, and original term; immutable verdict; only restrictions referenced by current reasons; bounded evidence, aliases, regional terms, questions, and rule trace; uncertainty states; and engine versions.

It excludes full profiles, scan history, saved restaurant history, coordinates, personal notes, images, installation history, and unrelated settings.

Phase 6A names are normalized for explanation only:

- `quantity_dependent` and `nutrition_quantity` become quantity uncertainty.
- `certification` and `certification_required` become certification evidence.
- `shared_*`, `declared_*`, and `cross_contact` become cross-contact evidence.

This does not change underlying evidence or verdicts.

## Explanation modes

### Quick

Immediate and deterministic. It names the subject, verdict, highest-priority reason, relevant restriction, and evidence strength. Separate reasons remain visible.

### Detailed

Structured sections cover why, terminology, evidence, aliases, uncertainty, and next steps. The local fallback works offline. Online output must preserve the exact verdict and warnings and cite only supplied evidence and restriction IDs.

### Explain Simply

Uses shorter sentences while preserving the verdict, uncertainty, and all important warnings. It cannot convert uncertainty into safety.

### Technical Evidence

Always local. Shows original term, canonical ID, restrictions, reason/rule IDs, evidence types and levels, uncertainty states, trace, engine versions, and evaluation time. Raw prompts, secrets, provider internals, and unrelated profile data are excluded.

## Multiple reasons

Reasons remain separate. Stable priority is allergies and declared-contains evidence, cross-contact, religious rules, medical/digestive rules, lifestyle rules, custom rules, source uncertainty, then preferences.

## Uncertainty policies

- Source-dependent evidence stays uncertain until supported source evidence resolves it.
- Quantity-dependent evidence shows the available threshold or missing amount without inventing a serving size.
- Preparation-dependent evidence names the unresolved preparation factor.
- Cross-contact distinguishes Contains, May Contain, shared equipment, and shared facility. Missing declarations are not proof of absence.
- Certification appears only when deterministic evidence supplies it and never answers unrelated rules.

## Aliases, alternatives, and questions

The original source term is retained. Aliases are bounded to 20 and regional terms to 12.

Alternatives are never model-generated. Products come from compatible locally saved/scanned results for the active profile. Restaurant alternatives must exist on the analyzed menu.

Questions originate only from deterministic source, quantity, preparation, certification, or cross-contact uncertainty. They are deduplicated and limited to six.

## Backend and prompt safety

`POST /v1/ai/explain` accepts only an allowed mode/language and a strict bounded context. Extra fields are rejected. Trusted application rules and validated JSON evidence are separated, and all source strings are declared untrusted.

Output must be structured JSON with the unchanged verdict, sections, warnings, actions, and grounding IDs. Unsupported IDs, changed verdicts, missing safety warnings, unsafe HTML, diagnosis/treatment language, and guarantee language are rejected. One correction attempt is allowed before deterministic fallback.

## Translation and cache

Structured explanations use `/v1/translate`. Translation must preserve schema version, verdict, and warnings. Machine-translated output is labeled and cached by language.

`roots-explanation-cache-v1` is limited to 40 records with a 14-day expiry. Its fingerprint includes subject, verdict, relevant restrictions/settings, rules, evidence, mode, language, prompt version, and engine versions. Theme changes do not invalidate it. Images and raw prompts are never cached.

The service worker caches static modules only. `/v1/` responses and personal explanation records bypass Cache Storage.

## Accessibility and performance

The explorer is an evidence dialog, not a chatbot. It provides semantic headings, an accessible tab list, visible verdict text, polite loading status, inert background content, keyboard mode switching, Escape dismissal, and focus restoration.

Quick and Evidence modes perform no network work. Detailed/Simple requests run only after user selection, deduplicate through the shared network layer, can be aborted, and reuse cache.

## Known limitations

- Explanations are limited by deterministic evidence supplied by earlier phases.
- New Detailed, Simple, and translated output requires the protected backend and connectivity.
- Alternatives are limited to real locally known products and analyzed menus.
- No medical diagnosis or treatment advice is provided.

## Exact Phase 6C handoff

Phase 6C receives the existing scan-source flow, camera capture, image review, crop data model, image preprocessing, OCR pipeline, loading animation, retry behavior, product report, and complete Phase 6B explanation system. It may improve capture, cropping, OCR quality, recovery, and contextual loading tips while preserving the explanation context and deterministic-authority boundary.
