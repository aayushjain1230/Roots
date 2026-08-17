# ROOTS Security Architecture

Version 5D establishes a server-side trust boundary for every provider-backed feature. Dietary,
allergy, restaurant, and meal verdicts remain deterministic browser code; Gemini may extract,
translate, or explain evidence but cannot write a verdict.

## Deployment baseline

- Serve the PWA and API over HTTPS. Set `ENVIRONMENT=production`.
- Put `GEMINI_API_KEY` only in the backend secret manager or untracked `.env`.
- Set `ALLOWED_ORIGINS` to the exact production web and Capacitor origins.
- Replace the development `API_BASE_URL` in `www/runtime-config.js` with the production HTTPS API.
- Rotate any key that has ever appeared in a browser bundle, localStorage, native asset, CI log, or
  repository history. Removing a key from the current tree does not revoke it.
- Keep `package-lock.json` and deploy locked dependencies.

## Threat model

| Threat | Surface and risk | Current mitigation | Residual risk / next improvement |
|---|---|---|---|
| Extracted keys | Web/native assets enable cost abuse | No provider secret in `www`; backend env only | Rotate all formerly exposed keys; use cloud budget alerts |
| API/cost abuse | Public task routes | Per-IP/install sliding limits, route quotas, bounded output and timeout | In-memory limits are per instance; use Redis/API gateway in production |
| XSS/malicious data | Product, menu, OCR, AI, import text | Escape-before-template conventions, no AI HTML, CSP, URL validation tests | Complete browser-assisted fuzz walkthrough before release |
| Prompt injection | OCR/menu/user text | Server instruction/data separation, task prompts, JSON validation, deterministic authority | Provider output is probabilistic and must remain explanatory |
| Unsafe image | Polyglots, bombs, metadata | MIME/signature checks, byte/pixel/dimension limits, animation rejection, EXIF transpose and JPEG re-encode | Add malware scanning if arbitrary document support expands |
| Unsafe PDF | Menu imports | Existing client accepts bounded PDFs with embedded text only; no server PDF endpoint | Server-side PDF sanitization is required before remote PDF ingestion |
| SSRF | Future menu URL retrieval | No generic fetch route; `validate_public_url` rejects credentials/private/non-HTTPS targets | DNS rebinding requires resolve-and-pin if server fetching is enabled |
| Cache poisoning | Service worker | Same-origin static allowlist, successful basic response and MIME checks; APIs bypass cache | Hosting/CDN integrity remains operational responsibility |
| Dependency compromise | npm/Python packages | Lockfile retained, bounded dependency ranges, audit policy | Review every update and generate SBOM during Phase 5E |
| Local data exposure | Profiles/history/location on shared device | Local-only data, granular deletion, no claims of encryption | Browser/localStorage is not encrypted; OS/device access can expose it |
| Provider-data leakage | OCR, explanations, restaurant search | Minimal task payloads; profile/location not sent to map providers by ranking engine | AI prompts may contain user-entered restrictions when explicitly invoked |
| Corrupt imports | localStorage/IndexedDB | Versioned validators, bounded arrays/strings, migration backups | Older stores vary in validation depth; keep fuzz testing |
| Unsafe links/deep links | External restaurant/product URLs | HTTPS validation and `noopener` conventions | Native universal-link allowlist remains Phase 5E deployment work |
| Excess permissions | Capacitor | No generated native projects currently; camera/location requested on action | Re-audit generated manifests before each store build |

## Backend controls

`roots_security.py` exposes only task-specific routes. Pydantic rejects unknown fields and bounds
strings, arrays, and history. Images are read with a hard byte cap, checked against declared MIME
and magic bytes, decoded under a pixel limit, rejected if animated, stripped of metadata, and
re-encoded. Provider calls use one fixed Google host, a backend-only header key, a bounded response,
and a timeout. Errors expose stable codes rather than provider bodies or stack traces.

The in-memory limiter is suitable for development and one-instance beta deployments. Production
multi-instance service must use a shared limiter and enforce upstream quotas, daily budgets,
concurrency limits, and alerts. The client install ID is only a random rate-limit hint—not
authentication and not a fingerprint.

## CSP and headers

The document CSP permits self-hosted scripts, inline CSS required by the legacy CSSOM-driven UI,
exact data providers, images needed for product and camera previews, and the configured development
API. It forbids objects, frames, inline scripts, and `unsafe-eval`. Production must deliver CSP as an
HTTP header, replace development API origins, and continue migrating CSSOM styles to classes so
`style-src 'unsafe-inline'` can be removed.
The API adds `nosniff`, frame denial, no-referrer, Permissions Policy, CORP, CSP, no-store, and an
opaque request ID. CORS is an explicit environment list and never permits credentials.

## Upload and PDF policy

Image OCR accepts JPEG, PNG, and WebP only, at most `MAX_IMAGE_BYTES` and `MAX_IMAGE_PIXELS`.
SVG and animated images are rejected. Only the cleaned JPEG reaches Gemini; filenames and metadata
do not. ROOTS currently has no server PDF upload route. The existing menu importer only accepts
bounded PDFs with extractable text and rejects encrypted, malformed, wrong-type, oversized, and
image-only documents. Before server PDF OCR is added, require magic-byte validation, page and object
limits, JavaScript/attachment rejection, decompression limits, isolated parsing, and cleanup.

## Logging and incident response

Never log OCR bytes/text, profiles, allergies, prompts, provider bodies, exact coordinates, access
tokens, or API keys. Log only timestamp, opaque request ID, route, stable error code, latency bucket,
and coarse status. Provider exceptions are sanitized.

If a credential is exposed: disable/rotate it immediately, block the affected route if needed,
review provider usage and privacy-safe request metadata, set lower quotas, replace contaminated
builds, and document the root cause. Notify users only when their information may have been exposed.
For malicious execution, dependency compromise, backend compromise, or a secret-bearing release:
contain, preserve appropriate logs, revoke credentials/builds, patch, issue a replacement, complete
store revocation if necessary, communicate according to impact, and run a post-incident review.

## Dependency and release policy

Run `npm audit --omit=dev`, a full `npm audit`, Python dependency audit where available, license
review, secret scan, and all tests for each release. Critical runtime findings block release.
Breaking upgrades require regression and native sync testing. Do not load remote JavaScript.

## Credential rotation

1. Revoke every browser-exposed Gemini key in the provider console.
2. Create a restricted backend key with API restrictions, quotas, and budget alerts.
3. Store it in the production secret manager as `GEMINI_API_KEY`.
4. Redeploy the backend; verify the key is absent from `www`, native assets, maps, logs, and source.
5. Invalidate old releases if they contained a working key.
