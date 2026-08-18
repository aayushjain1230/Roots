# Phase 19 — Final release-candidate audit and freeze

Date: 2026-08-09  
Candidate version: `2.0.0`  
Source decision: **PASS — freeze candidate**  
Public-store decision: **BLOCKED — operational release evidence incomplete**

## Verified gates

| Gate | Result |
|---|---|
| Complete JavaScript regression suite | 479 passed, 0 failed |
| Legacy backend compatibility suite | 23 passed, 0 failed |
| Protected backend security suite | 11 passed, 0 failed |
| Home live-browser startup | Passed |
| One-active-view and accessibility hiding | Passed |
| Ask Roots standalone navigation and Back | Passed |
| Browser console errors/warnings | None observed |
| Static service-worker asset existence | Passed by regression suite |
| Frontend provider-secret scan | Passed by regression suite |
| Deterministic engine provider isolation | Passed by regression suite |
| Evidence, unknown propagation, and false-negative assault | Passed by regression suite |

The protected-backend tests emitted one upstream Starlette/httpx deprecation warning. It does not
change runtime behavior, but the dependency migration should be scheduled and regression-tested.

## Freeze scope

The candidate includes Phases 1–15 plus the Phase 17 trust-governance contract and Phase 18 ethical
launch foundation. Phase 16 is an analysis artifact only. From this point, changes should be limited
to release-blocking defects, production configuration, verified legal/support URLs, native build
metadata, and test evidence. Every change requires the full automated gate again.

## Public-release blockers

1. No verified production HTTPS API URL is injected into the final artifacts.
2. Production provider credentials, restrictions, budgets, retention, and success paths are not
   verifiable from the repository.
3. Real privacy, terms, support, privacy-choice, and status URLs are not published/configured.
4. Signed Android AAB and iOS archive, checksums, store validation, and internal distribution builds
   have not been produced in this environment.
5. Physical-device camera, photo picker, geolocation, TTS, offline/background/resume,
   low-connectivity, VoiceOver, TalkBack, and large-text evidence is absent.
6. Final bundle/application-ID and marketing/build-number decisions require release-owner approval.
7. Restaurant provider/menu coverage and real OCR/AI staging success need deployment validation.

## Go/no-go rule

Do not submit publicly while any blocker above is open. The source candidate is suitable for a
controlled internal beta only after a protected staging backend and signed internal builds exist.
Public launch requires every item in `LAUNCH_CHECKLIST.md` to have an evidence link or artifact—not an
assumption or verbal confirmation.
