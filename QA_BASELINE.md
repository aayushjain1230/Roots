# ROOTS Phase 5E-A Pre-Fix Baseline

Date: 2026-07-30  
App version: 2.0.0  
Scope: repository state before Phase 5E-A product or test changes

## Environment inventory

- Windows desktop workspace
- Bundled Node.js runtime
- Existing Python virtual environment
- Chromium-based in-app browser available
- No generated `android/` project
- No generated `ios/` project
- No Android emulator or physical Android device connected
- No iOS simulator or physical iPhone available from this Windows workspace
- No `.github/workflows` CI configuration
- No frontend compilation step; `www/` is the production frontend

## Baseline results

| Check | Result | Evidence |
|---|---|---|
| JavaScript unit/integration/security suite | Passed | 366/366 |
| Legacy backend suite | Passed | 23/23 |
| Phase 5D backend security suite | Passed | 7/7 |
| Python syntax compilation | Passed | `api.py`, `roots_security.py` |
| Service-worker asset manifest | Passed | 80 entries, 0 missing |
| Locked dependency resolution | Warning | 370 packages resolved; pnpm blocked optional `sharp` build script by policy |
| Frontend production build | Passed / N/A | Vanilla static frontend; all production files present |
| Capacitor sync | Partial | Web copy/update passed; no native platforms exist to sync |
| Android build/device checks | Not tested | Android project and device unavailable |
| iOS build/device checks | Not tested | iOS project and Apple toolchain unavailable |
| CI release gates | Failed/gap | No CI workflow exists |

## Pre-existing findings

1. `BUILD.md`, `GETTING_STARTED.md`, and `AGENTS.md` still contain pre-Phase-5D statements that
   Gemini is called directly from the frontend. This is documentation drift, not a runtime secret.
2. Native build, permission, simulator, and physical-device validation cannot be performed because
   native projects are absent.
3. There was no single Phase 5E-A fixture catalog, device matrix, known-issues register, or
   release-candidate report.
4. Existing automated coverage is strong for deterministic engines, migrations, reports,
   restaurant workflows, storage, security, service worker, accessibility contracts, and
   performance contracts. Browser-driven end-to-end and physical-device coverage are gaps.
5. The Python TestClient emits a Starlette/httpx deprecation warning; tests still pass.

No baseline safety, allergy, cross-contact, migration, or data-loss test failed.
