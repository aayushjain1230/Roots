# ROOTS Phase 5A performance report

Measured 2026-07-28 on the repository's Windows development environment. Timings are development
measurements, not synthetic claims about production devices. No metric is transmitted.

## Baseline and final measurements

Before Phase 5A, `index.html` referenced 66 scripts totaling 638,921 bytes. Every restaurant,
menu, meal, Dining Assistant, Travel, AI, and shopping module was parsed and executed before Home
finished booting. The `www/` tree was 1,103,747 bytes, including 106,487 bytes of CSS, 44,437
bytes of HTML, and 238,653 bytes of barcode WASM. The 330-test suite reported 1,022 ms internal
duration and 1,625 ms process wall time.

The previous build had no local performance instrumentation, so retrospective OCR, navigation,
memory, and render timings are unavailable. They are not fabricated.

| Measurement | Baseline | Phase 5A | Change |
| --- | ---: | ---: | ---: |
| Initial script requests | 66 | 26 | -60.6% |
| Initial JavaScript bytes | 638,921 | 329,455 | -48.4% |
| HTML bytes | 44,437 | 42,111 | -5.2% |
| CSS bytes | 106,487 | 106,487 | unchanged |
| On-demand feature files | 0 | 43 / 329,273 bytes | moved off Home |
| Automated JS tests | 330 | 338 | +8 performance tests |

A clean local browser load with `?rootsPerformance=1` measured 4.10 ms from main-controller
execution to `home_interactive`. This is not total network-navigation time. The tested desktop
viewport had equal `scrollWidth` and `clientWidth` at 1,265 px.

The final `www/` tree is 1,121,679 bytes. Total source grew because instrumentation, request
control, and lazy loading were added; the critical startup path became materially smaller.

## Startup and lazy-loading architecture

Critical startup contains theme, brand, profile, ingredient knowledge/parser/rules, scan pipeline,
camera and image review, scan recovery, product report, request control, feature loading, and a
bounded Home-personalization shell.

Deferred coarse groups are:

- Assistant: existing AI tools.
- Restaurants: discovery, menu, evidence, ranking, meals, Dining Assistant, and memory.
- Saved: restaurant/memory group followed by shopping.
- Travel: IndexedDB storage, glossary, speech, language packs, and cards.

Navigation activates its view, then ensures its group. Pointer intent may warm a group during idle
time. File promises are deduplicated. Load failures leave the group retryable and show a
recoverable status. No PDF, OCR provider, restaurant provider, Travel pack, or AI network request
runs at startup.

## Instrumentation

`performance-monitor.js` is disabled by default. Enable it with `?rootsPerformance=1`,
`ROOTS_PERFORMANCE.enable()`, or the development-only `roots-performance-enabled` flag. It stores
only names, durations, counts, byte counts, cache state, sanitized status codes, and resource
counts in memory. It rejects raw OCR/ingredient text, profiles, allergies, images, prompts, keys,
and provider bodies.

Instrumented paths include startup, navigation, Home personalization, network classifications,
ingredient parsing, dietary evaluation, reports, menu OCR, restaurant analysis/rendering, search
indexing/querying, feature scripts, memory snapshots, blob URLs, image bitmaps, camera streams,
Home timers, and speech.

## Network, Gemini, barcode, and OCR policy

`network-client.js` provides timeout, AbortSignal forwarding, one bounded transient retry,
exponential backoff, offline rejection, sanitized classification, and in-flight deduplication.
Completed and failed promises leave the registry.

Open Food Facts deduplicates by barcode variant. Gemini label OCR, translations, and assistant
calls use a stable non-content-revealing body fingerprint. Menu OCR deduplicates by page/file
identity. There are no Gemini calls per ingredient or dish, and Gemini never evaluates or ranks.

A confirmed label `File` uses a session WeakMap extraction promise, so parser/engine retries do
not repeat successful OCR. Failures are removed. Product OCR retains the 2,000 px long-edge cap
and JPEG quality 0.85; confirmed crops retain the existing 2,200 px cap. Quality was not reduced
without an accuracy corpus. Menu OCR remains sequential (concurrency 1), preserves order, indexes
its cache once per batch, and prefers existing embedded PDF text.

The former direct-client Gemini key was removed in Phase 5D. Phase 5A neither moved nor
exposes it.

## Parser, engine, reports, and restaurant paths

Ingredient normalization has a bounded 500-entry cache. Alias candidates sort once at engine
load; unknown ingredients no longer rebuild and sort the alias index. Existing rule order,
allergy handling, evidence, and verdict tests remain authoritative.

Reports render Avoid and Caution before Safe and keep long Safe lists collapsed. Restaurant cards
remain progressive in batches of four; cancellation tokens prevent obsolete results from
replacing current results. Ranking identity still includes location, menu, profile, engine, and
freshness. Meal changes remain local and deterministic.

Unified search builds a normalized index once for the current local IDs, reuses it, and invalidates
after save/delete/history/personalization changes. Results remain capped at 50 and escaped.

## Storage and IndexedDB

Saved meals use a bounded index with individual record keys. Travel data uses IndexedDB stores for
destinations, packs, cards, and phrases. Product history remains bounded localStorage. Phase 5A
does not force a history migration because a resumable migration needs real-dataset evidence and a
dedicated compatibility release; silently risking history would violate this phase.

## Cache inventory, invalidation, and limits

- Critical static shell: `roots-shell-v5c-1` (includes the Phase 5B design and Phase 5C navigation controllers).
- On-demand static features: `roots-features-v5a-1`.
- Activation deletes obsolete Cache Storage versions.
- Lazy modules become available offline after first successful use.
- API/OCR/AI/provider responses and personal data never enter service-worker caches.
- Existing bounded limits remain: 300 barcode products, 60 ranking summaries, 250 saved meals,
  1,000 order-history records, plus module-specific menu and translation limits.

## Memory, timers, battery, and animation

Camera tracks stop on close/background. Blob URLs revoke, ImageBitmaps close, canvases remain
function-local, and duplicate Use Photo is blocked. Travel speech stops on exit/background. Home
owns one animation timer and one tip timer; both stop offscreen, hidden, or under reduced motion.
The approved animation visuals are unchanged. No polling or background refresh was added.

## Dependency and asset audit

| Dependency or asset | Size | Purpose and decision |
| --- | ---: | --- |
| zbar WASM | 238,653 B | Offline barcode decoding; retained with bundled license |
| zbar wrappers | 25,767 B | Scanner adapter; imported only by scanner path |
| CSS | 106,487 B | Critical design system; retained |
| Capacitor packages | install-time | Native packaging; not imported by browser startup |
| Gemini | remote | Explicit OCR/translation/explanation only; no startup call |
| Open Food Facts | remote | Explicit barcode lookup only |

No Tesseract, PDF runtime, font binary, analytics SDK, or frontend framework is bundled. No
dependency was replaced for a trivial byte saving.

## Tests, limitations, and Phase 5B handoff

Performance tests use call-count, cache-hit, bounded-resource, lazy-boundary, and cleanup
assertions rather than flaky absolute thresholds. All prior functional tests remain enabled.

Known limitations:

- First offline use of a lazy feature requires that feature to have been opened online once.
- Product history is still bounded localStorage.
- Large Saved lists are capped/progressive, not virtualized.
- Safari may not expose heap size; explicit resource counters still work.
- Physical-device low-power, provider throttling, and ten-cycle camera/OCR memory testing remain
  release-device QA tasks.

Phase 5B handoff:

- standardize visual loading states for first Assistant/Restaurant/Saved activation;
- review delayed personalization layout reservation on unusually dense histories;
- standardize press feedback and transition durations;
- complete physical 320 px, dark-mode, reduced-motion, and haptic polish.

These visual items were not redesigned during Phase 5A.
