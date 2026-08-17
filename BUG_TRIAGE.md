# ROOTS Phase 5E-A Bug Triage

## Severity policy

- SEV-0: exposed secret, launch failure, data loss, incorrect allergy verdict, deterministic-engine
  failure, or critical vulnerability.
- SEV-1: unusable primary scan/restaurant flow, frequent crash, corrupted saved data, broken offline
  startup, or failed required platform build.
- SEV-2: major partial failure, serious accessibility/layout failure, common menu parsing error, or
  repeated duplicate requests. Requires explicit release acceptance.
- SEV-3: recoverable workflow or documentation defect.
- SEV-4: cosmetic or minor maintenance defect.

## Issues found and fixed

### QA-5EA-001 — Security setup documentation instructed frontend key use

- Severity: SEV-3
- Environment: Repository documentation, version 2.0.0
- Preconditions: Read pre-Phase-5D setup/build guidance.
- Reproduction: Open `GETTING_STARTED.md` or the beginning of `BUILD.md`.
- Expected: Gemini key is documented as backend-only.
- Actual: Old text instructed copying a key into `www/config.js`.
- Component: Developer documentation and controller comment.
- Root cause: Phase 5D architecture was added after older setup sections.
- Fix: Updated `AGENTS.md`, `CLAUDE.md`, `GETTING_STARTED.md`, `BUILD.md`, `PERFORMANCE.md`,
  `SUBMISSION.md`, `UX_AUDIT.md`, and `www/script.js`.
- Regression: Frontend secret/direct-provider scan and documentation scan.
- Status: Fixed.
- Release impact: Prevented insecure developer configuration.

### QA-5EA-002 — Release-candidate branch lacked CI gates

- Severity: SEV-3
- Environment: Repository, version 2.0.0
- Reproduction: Inspect `.github/workflows`.
- Expected: Tests, syntax, secret scan, and critical dependency audit fail CI.
- Actual: No workflow existed.
- Component: QA infrastructure.
- Fix: Added `.github/workflows/release-candidate.yml`.
- Regression: Workflow syntax/source inspection; remote execution awaits repository CI.
- Status: Fixed locally, remote CI not executed.
- Release impact: CI must run successfully after the branch is pushed.

## Triage summary

- Open SEV-0 product defects: 0
- Open SEV-1 product defects: 0
- Open SEV-2 product defects: 0
- Fixed SEV-3 defects: 2
- Release prerequisites/gaps are tracked in `KNOWN_ISSUES.md`; they are not disguised as passed bugs.

