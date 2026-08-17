# ROOTS Phase 5E-A Release-Candidate Report

Date: 2026-07-30  
Candidate: 2.0.0  
Decision: **NOT READY FOR PHASE 5E-B**

## Decision basis

Automated safety, integration, security, storage, offline-shell, accessibility-contract, and
performance regression suites pass. A real Chromium walkthrough passed startup, navigation, themes,
Travel lazy loading, offline reload, and offline Saved. However, Android/iOS projects, native builds,
simulators, physical devices, real screen readers, interactive viewport matrix, browser-console
capture, authoritative Git metadata, and staging-provider success paths are unavailable. The
specification forbids marking these as assumed passes.

## Results

| Area | Result |
|---|---|
| Deterministic product engine | Passed |
| Eight-profile × 22-product fixture matrix | Passed |
| Allergies and cross-contact | Passed |
| Profile migration and legacy history | Passed |
| Barcode/OCR evidence integration | Passed with simulated provider data |
| Real OCR/provider success | Not tested |
| Reports and saved products | Passed automated |
| Restaurant discovery/provider abstraction | Passed automated |
| Menu import/review/parsing | Passed automated |
| Dish evidence and ranking | Passed automated |
| Meal builder, saved meals, Order Again | Passed automated |
| Questions, Dining Assistant, Travel | Passed automated; Travel entry passed browser |
| Offline app shell and Saved | Passed browser |
| Network degradation/failure | Passed simulated tests |
| Service worker | Passed |
| Accessibility contracts | Passed |
| VoiceOver/TalkBack | Not tested |
| Responsive static contracts | Passed |
| Interactive size/orientation matrix | Not tested |
| Security regression | Passed |
| Capacitor web sync | Passed |
| Android/iOS sync and builds | Not tested |

## Performance regression

Existing Phase 5A tests pass. The app shell contains 87 files totaling 1,158,171 bytes; the service
worker lists 80 valid assets with none missing. Repeated-scan coverage confirms ten sequential
evaluations preserve prior snapshots and retain only the latest current session. Existing tests
cover bounded caches, listener cleanup, animation pause, OCR sequencing, request deduplication, and
hundreds of restaurant dishes. Physical memory, camera, and speech leak testing remains required.

## Security regression

No secret or direct Gemini provider endpoint appears in production assets. Backend schemas, upload
limits, rate limiting, SSRF, CORS, CSP, prompt boundaries, output validation, sanitized errors, and
service-worker private-route bypass pass. Deterministic engines remain network/provider-free.

## Defects and blockers

Two SEV-3 documentation/QA-infrastructure defects were fixed. Zero open SEV-0, SEV-1, or SEV-2
product defects are known. The candidate is nevertheless blocked from Phase 5E-B by incomplete
required native/device validation, listed in `KNOWN_ISSUES.md` and `DEVICE_TEST_MATRIX.md`.

## Exact Phase 5E-B handoff

Do not begin Phase 5E-B until:

1. The release-candidate CI workflow passes on the authoritative repository.
2. Android and iOS projects are generated from this candidate and sync succeeds.
3. Android emulator/physical and iOS simulator/physical matrices are completed.
4. Interactive 320–1024px portrait/landscape and VoiceOver/TalkBack testing passes.
5. Restricted staging provider tests pass without secret exposure.
6. Minimum Android/iOS versions and the app version/build-number plan are confirmed.
7. Any newly discovered SEV-0/1 is closed and every SEV-2 is explicitly accepted.

Phase 5E-B may then handle production configuration, version/build numbers, release builds,
signing preparation, icons, splash screens, and native production settings. None of that work was
started in Phase 5E-A.
