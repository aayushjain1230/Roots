# Getting Started — ROOTS

Quick setup so you can start prompting your AI coding tool right away.

## 1. Install
```bash
cd "But-Is-It-Jain-codebase"
npm install
```

## 2. Configure protected online services

Copy `.env.example` to an untracked `.env`, set `GEMINI_API_KEY`, and start the FastAPI backend.
Never put the key in `www/`, localStorage, or Capacitor assets. `www/runtime-config.js` contains
only the public backend base URL.

```powershell
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

## 3. Run it (fastest way — just a website, no Xcode needed)
```bash
npm run dev
```
Open http://127.0.0.1:5500. This command starts both the static frontend and the protected API;
label scanning will not work if only the static frontend is running. Use `npm run serve` only when
you intentionally need the frontend without provider-backed features.

For local performance diagnostics, append `?rootsPerformance=1` and inspect
`ROOTS_PERFORMANCE.getReport()` in development tools. Metrics remain on the device and never
include OCR text, uploaded images, profiles, allergies, or API keys. Leave this disabled for
normal use.

New users see a six-step local dietary-profile onboarding. Existing `bij-profile-v4` users are
migrated automatically to `roots-profile-v1`; the original value and a raw backup are retained.

Completed scans now open a full-screen deterministic ROOTS report. Save Product keeps a structured
copy in `roots-saved-products-v1` for offline reopening; scan history remains in its existing key
and older history records remain readable.

## 4. Want the real iOS app instead?
```bash
sudo gem install cocoapods   # one-time
npx cap add ios
npx cap sync
npx cap open ios             # opens Xcode — press the Play button
```
**Rule to remember: after editing anything in `www/`, run `npx cap sync` before testing in Xcode.**

## 5. Just start prompting
There's a `CLAUDE.md` file in the project root. Any AI coding tool (Claude Code, Cursor, etc.)
reads it automatically and already knows the full architecture, conventions, and gotchas — you
don't need to read the code yourself first. Just tell it what you want changed.

A few things worth knowing before your first prompt:
- **`www/` is the only place to edit** — it's the single source for web/PWA/iOS/Android. Never
  edit inside `ios/` or `android/` directly (regenerated from `www/`, changes there get lost).
- **`api.py` is an old backend and isn't used by the app** — ignore it unless you're specifically
  reviving that flow.
- **Compatibility runs in the shared client** (OCR uses the protected backend; classification is local) — no
  backend needed for anything you'll be testing.
- The production dietary rules live in `www/dietary-rules.js`; do not treat dormant `api.py`
  compatibility logic as the frontend authority.
- Visual changes should use the tokens and component contracts in `DESIGN_SYSTEM.md`; do not add
  feature-specific colors, shadows, radii, or animation timings.
- Workflow and copy changes must follow `UX_AUDIT.md`, especially Home hierarchy, Saved category
  organization, logical Back behavior, and the empty/error recovery standards.
# Protected provider setup (Phase 5D)

Provider credentials are backend-only. Copy `.env.example` to an untracked `.env`, set
`GEMINI_API_KEY`, and start the FastAPI service with:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

`www/runtime-config.js` contains only the public API base URL. Never add a provider key to `www/`,
Capacitor assets, localStorage, or a client environment file. Label/menu OCR, translation, and AI
explanation require the backend and internet; deterministic reports and saved/offline data do not.
See `BACKEND_API.md`, `SECURITY.md`, and `PRIVACY_ARCHITECTURE.md`.
