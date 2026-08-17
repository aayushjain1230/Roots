# ROOTS Phase 5E-A Known Issues and Validation Gaps

## RC-GAP-001 — Native projects and builds unavailable

- Classification: Release prerequisite
- Environment: Current Windows workspace
- Reproduction: Repository has no `android/` or `ios/` directory.
- Impact: Android/iOS compilation, permissions, navigation, native back, camera, HEIC, backgrounding,
  signing compatibility, simulator, and physical-device behavior are not tested.
- Resolution: Generate and test both platforms before Phase 5E-B approval.

## RC-GAP-002 — Physical-device and screen-reader testing unavailable

- Classification: Release prerequisite
- Impact: TalkBack, VoiceOver, real camera lifecycle, TTS, memory pressure, safe areas, and actual
  small-screen/landscape rendering remain unverified.
- Resolution: Complete the device matrix with privacy-safe evidence.

## RC-GAP-003 — Interactive viewport matrix incomplete

- Classification: QA gap
- Severity if reproduced as a defect: SEV-2 for common-phone overflow
- Current evidence: Automated responsive/accessibility contracts pass all required breakpoints.
- Resolution: Visually inspect every specified screen at 320–1024px, portrait and landscape.

## RC-GAP-004 — Real Gemini/provider success path not executed

- Classification: Environment prerequisite
- Current evidence: Backend schema, failure, rate-limit, upload, timeout, frontend routing, and
  deterministic-boundary tests pass. No real key was introduced.
- Resolution: Use restricted staging credentials and non-sensitive fixtures for OCR/translation/AI.

## RC-GAP-005 — Dependency installation policy warning

- Severity: SEV-4 maintenance
- Detail: pnpm resolved 370 locked packages but blocked optional `sharp@0.32.6` build scripts under
  noninteractive supply-chain policy. Runtime app and Capacitor web sync do not require this binary.
- Resolution: Use the authoritative npm lockfile with `npm ci`; explicitly review build scripts
  before enabling asset-generation tooling.

## RC-GAP-006 — Python TestClient deprecation warning

- Severity: SEV-4 maintenance
- Detail: Starlette warns that its current httpx TestClient adapter is deprecated.
- Resolution: Update the compatible FastAPI/Starlette test stack in a separately tested dependency
  maintenance change.

## RC-GAP-007 — Browser console capture and authoritative Git metadata unavailable

- Classification: QA/release-process prerequisite
- Detail: The browser control surface supported semantic interaction but did not expose console
  message capture. The workspace also is not recognized as a Git worktree, so the release-candidate
  commit and historical secret scan cannot be produced here.
- Resolution: Run the CI workflow and browser E2E suite in the authoritative Git repository,
  inspect a clean browser console, scan full Git history for secrets, and identify the exact passing
  commit before handoff.

No known incorrect allergy verdict, data-loss defect, exposed secret, primary-flow crash, or open
SEV-0/SEV-1 product defect was found.
