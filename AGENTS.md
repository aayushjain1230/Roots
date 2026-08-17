# ROOTS repository guide

ROOTS is a vanilla HTML/CSS/JavaScript dietary compatibility app. One frontend in `www/` ships
as a website, installable PWA, and Capacitor iOS/Android application. It is not Flutter and has no
frontend framework or build step.

## Runtime architecture

`source evidence -> ROOTS_SCAN_PIPELINE -> ROOTS_INGREDIENT_PARSER -> ROOTS_DIETARY_ENGINE -> report/history`

- Barcode lookup: Open Food Facts, with bounded local product caching.
- Label extraction and translation: Gemini through the protected FastAPI backend.
- Verdicts: deterministic local ROOTS rules only. AI may explain but never override them.
- Local data: profiles, history, Saved products, shopping data, chat, theme, and cache.
- Offline: app shell, profile, history, Saved reports, shopping data, and cached barcode products.
- Network required: uncached barcode lookups, label OCR/translation, and AI tools.
- `api.py`: dormant compatibility/reference backend; the frontend does not call it.

## Important files

- `www/index.html`, `styles.css`, `script.js`: application shell and orchestration.
- `profile*.js`: profile schema, migration, definitions, onboarding, and settings.
- `ingredient-knowledge.js`, `ingredient-parser.js`, `dietary-rules.js`: deterministic engine.
- `scan-pipeline.js`, `scan-processing.js`: evidence normalization and scan-session lifecycle.
- `camera-capture.js`, `image-review.js`: camera, crop, rotate, and bounded working images.
- `report-view.js`, `report-actions.js`: final report and report actions.
- `assistant.js`, `shopping.js`: existing Version 1 AI and shopping tools.
- `sw.js`, `manifest.webmanifest`: offline shell and PWA metadata.

## Engineering rules

- Edit `www/`, then run Capacitor sync when native projects exist.
- Never commit `.env`, keys, provider responses, or personal data. Public client configuration
  belongs in `www/runtime-config.js` and may contain only the backend base URL.
- Preserve existing localStorage keys unless a tested migration is included.
- Treat product, OCR, translation, profile, and AI text as untrusted; escape it before templates.
- Permit only validated image URLs.
- Do not edit the minified zbar/WASM vendor files.
- Do not change the native bundle ID casually; it identifies the existing store application.
- Keep animations paused offscreen/backgrounded and honor reduced motion.
- Retain legacy history/profile compatibility until a deliberate, tested migration removes it.

## Verification

```powershell
node --test tests/*.test.js
.\.venv\Scripts\python.exe test_api.py
python -m http.server 5500 --directory www
```

Also verify service-worker assets, narrow/mobile/tablet/landscape layouts, light/dark/system
appearance, keyboard focus, offline shell loading, and a clean browser console.
