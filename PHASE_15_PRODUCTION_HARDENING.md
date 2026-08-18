# Phase 15 — Production hardening

Date: 2026-08-09

## Completed in source

- The public runtime configuration contains no provider credential and uses localhost only when the
  page itself is running on localhost. Production requires an explicitly injected HTTPS API base.
- Public display metadata now consistently uses `Roots`; the legacy native application identifier
  remains unchanged deliberately because changing it creates a different store identity.
- Static-shell caching remains allowlisted. Provider calls, OCR/AI responses, and personal records
  remain outside Cache Storage.
- The security boundary remains the protected FastAPI service. Deterministic dietary and restaurant
  verdicts remain local and cannot be overwritten by Gemini.
- Existing upload limits, URL validation, output validation, CSP baseline, rate limits, bounded
  storage, reduced motion, focus handling, and cleanup tests remain release gates.

## Operational release blockers

These cannot be truthfully completed in source control:

1. Configure the production HTTPS backend and inject its URL at deployment.
2. Set exact production CORS origins and deliver CSP/security headers at the edge.
3. Store restricted provider keys in a production secret manager with quotas and alerts.
4. Publish real privacy, terms, support, privacy-choice, and status URLs.
5. Generate/sign Android and iOS builds and run physical-device camera, location, TTS,
   VoiceOver/TalkBack, font scaling, offline, background/resume, and low-connectivity tests.
6. Validate production provider success paths and retention contracts.

Public release remains blocked until all six have evidence. Source-level automated success is not a
substitute for signing, hosting, provider, legal, or physical-device verification.
