const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("frontend production assets contain no provider credential or direct Gemini call", () => {
  const files = fs.readdirSync(path.join(root, "www")).filter((name) => /\.(js|html|css|json|webmanifest)$/.test(name));
  const source = files.map((name) => read(path.join("www", name))).join("\n");
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|GEMINI_API_KEY|bij-gemini-key|APP_CONFIG/);
  assert.doesNotMatch(read("www/index.html"), /src=["']config\.js/);
});

test("public runtime config exposes only an API base URL", () => {
  const source = read("www/runtime-config.js");
  assert.match(source, /API_BASE_URL/);
  assert.doesNotMatch(source, /key|token|secret/i);
});

test("browser calls task-specific backend routes", () => {
  const ocr = read("www/ocr.js");
  const menu = read("www/restaurant-menu-ocr.js");
  assert.match(ocr, /\/v1\/ocr\/label/);
  assert.match(ocr, /\/v1\/translate/);
  assert.match(ocr, /\/v1\/ai\/\$\{task\}/);
  assert.match(menu, /\/v1\/ocr\/menu/);
});

test("CSP has no unsafe-eval, wildcard script source, or inline script", () => {
  const html = read("www/index.html");
  const policy = html.match(/Content-Security-Policy[^>]+content="([^"]+)"/)?.[1] || "";
  assert.match(policy, /script-src 'self'/);
  assert.doesNotMatch(policy, /unsafe-eval|script-src[^;]*\*/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/);
});

test("service worker excludes private APIs and validates cache responses", () => {
  const sw = read("www/sw.js");
  assert.match(sw, /pathname\.startsWith\("\/v1\/"\)/);
  assert.match(sw, /response\.type === "basic"/);
  assert.match(sw, /content-type/);
  assert.doesNotMatch(sw, /GEMINI_API_KEY|OCR responses|AI responses/);
});

test("backend uses restricted CORS, fixed provider host, schemas, and rate limits", () => {
  const api = read("api.py");
  const security = read("roots_security.py");
  assert.doesNotMatch(api, /allow_origins=\["\*"\]/);
  assert.match(api, /allow_credentials=False/);
  for (const route of ["ocr/label", "ocr/menu", "translate", "ai/question", "ai/recipe", "ai/meals", "ai/dining-explanation"]) {
    assert.match(security, new RegExp(route.replace("/", "\\/")));
  }
  assert.match(security, /SlidingLimiter/);
  assert.match(security, /extra="forbid"/);
  assert.match(security, /x-goog-api-key/);
  assert.doesNotMatch(security, /detail=.*exc|str\(exc\)/);
});

test("deterministic engines remain provider-free", () => {
  const source = ["www/dietary-rules.js", "www/restaurant-evidence-engine.js", "www/restaurant-meal-engine.js"]
    .map(read).join("\n");
  assert.doesNotMatch(source, /fetch\(|BIJ_OCR|Gemini|\/v1\/ai\//i);
});
