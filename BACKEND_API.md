# ROOTS Protected API

Base URL is public configuration in `www/runtime-config.js`; provider credentials are backend-only.
All private API responses use `Cache-Control: no-store`.

| Route | Input | Output | Default per-minute limit |
|---|---|---|---|
| `POST /v1/ocr/label` | multipart JPEG/PNG/WebP `file` | validated label evidence JSON | 8 |
| `POST /v1/ocr/menu` | multipart JPEG/PNG/WebP `file` | validated menu evidence JSON | 8 |
| `POST /v1/translate` | source text, language, structured format | `{text, provider}` | 20 |
| `POST /v1/ai/question` | bounded prompt/history/JSON flag | `{text, provider}` | 15 |
| `POST /v1/ai/recipe` | bounded prompt/history/JSON flag | `{text, provider}` | 8 |
| `POST /v1/ai/meals` | bounded prompt/history/JSON flag | `{text, provider}` | 8 |
| `POST /v1/ai/dining-explanation` | evidence-bound prompt/history/JSON flag | `{text, provider}` | 8 |

Unknown JSON fields return 422. Unsupported image type/signature returns 415, oversize returns 413,
rate limit returns 429 with stable `rate_limited`, missing provider configuration returns 503, and
sanitized upstream failure returns 502/503. There is no generic proxy or arbitrary URL endpoint.

Environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`, `PROVIDER_TIMEOUT_SECONDS`,
`MAX_IMAGE_BYTES`, `MAX_IMAGE_PIXELS`, `ALLOWED_ORIGINS`, `ENVIRONMENT`, `HOST`, and `PORT`.
Existing optional restaurant provider variables remain documented in `.env.example`.

