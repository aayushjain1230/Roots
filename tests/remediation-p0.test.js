"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(ROOT, "www", name), "utf8");

function context(extra = {}) {
  const store = new Map();
  const ctx = {
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    WeakMap,
    URL,
    Uint8Array,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    crypto: { getRandomValues(bytes) { for (let i = 0; i < bytes.length; i += 1) bytes[i] = i + 1; return bytes; } },
    localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) },
    navigator: { onLine: true },
    location: { protocol: "http:", hostname: "localhost", origin: "http://localhost:5500" },
    document: { querySelector: () => ({ content: "" }) },
    ...extra,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
function load(ctx, files) { files.forEach((file) => vm.runInContext(source(file), ctx, { filename: file })); return ctx; }

test("legacy OCR classifier is not exposed as a production decision API", () => {
  const ctx = load(context(), ["error-taxonomy.js", "runtime-config.js", "ocr.js"]);
  assert.equal(ctx.BIJ_OCR.classifyIngredient, undefined);
  assert.equal(ctx.BIJ_OCR.analyze, undefined);
  assert.equal(ctx.BIJ_OCR.scan, undefined);
  const ocr = source("ocr.js");
  assert.doesNotMatch(ocr, /category: "JAIN", reason: "Allowed by your current diet profile\." \};\s*\}\s*\n\s*const ambiguousHit/);
});

test("image OCR FormData requests opt out of unsafe network dedupe by file size", () => {
  const ocr = source("ocr.js");
  assert.match(ocr, /skipDedupe:\s*isForm/);
  assert.doesNotMatch(ocr, /body\.get\("file"\)\?\.size/);
});

test("runtime config only uses loopback for plain local web, not Capacitor", () => {
  let ctx = load(context({ location: { protocol: "http:", hostname: "localhost" } }), ["runtime-config.js"]);
  assert.equal(ctx.ROOTS_RUNTIME_CONFIG.API_BASE_URL, "http://127.0.0.1:8000");

  ctx = load(context({ location: { protocol: "capacitor:", hostname: "localhost" }, Capacitor: { isNativePlatform: () => true } }), ["runtime-config.js"]);
  assert.equal(ctx.ROOTS_RUNTIME_CONFIG.API_BASE_URL, "");
  assert.equal(ctx.ROOTS_RUNTIME_CONFIG.API_CONFIG_CODE, "API_NOT_CONFIGURED");

  ctx = load(context({ location: { protocol: "https:", hostname: "localhost" }, Capacitor: { isNativePlatform: () => true } }), ["runtime-config.js"]);
  assert.equal(ctx.ROOTS_RUNTIME_CONFIG.API_BASE_URL, "");
});

test("Open Food Facts HTTP failure is provider/server error, not fake network outage", async () => {
  const ctx = load(context({
    ROOTS_NETWORK: { request: async () => ({ ok: false, status: 500, data: { status: 0 } }) },
  }), ["connectivity.js", "error-taxonomy.js", "foodfacts.js"]);
  await assert.rejects(() => ctx.BIJ_FOODFACTS.lookup("123456789012"), (error) => error.code === "HTTP_SERVER_ERROR");
});

test("scan UI copy reserves No connection for real device-offline errors", () => {
  const processing = source("scan-processing.js");
  const runtimeFixes = source("runtime-fixes-v2.js");
  assert.match(processing, /DEVICE_OFFLINE:\s*\["network", "No connection"/);
  assert.doesNotMatch(processing, /OCR_NETWORK:\s*\["network", "No connection"/);
  assert.doesNotMatch(processing, /offline\|network\|connect/);
  assert.doesNotMatch(runtimeFixes, /Label reading needs internet/);
});
test("local OCR adapter reports unavailable without a native Capacitor plugin", async () => {
  const ctx = load(context(), ["error-taxonomy.js", "local-ocr-provider.js"]);
  assert.equal(ctx.ROOTS_LOCAL_OCR_PROVIDER.available(), false);
  await assert.rejects(() => ctx.ROOTS_LOCAL_OCR_PROVIDER.extractText({}), (error) => error.code === "OCR_LOCAL_UNAVAILABLE");
});

test("restaurant UI exposes API health/config status instead of false connection copy", () => {
  const ui = source("restaurant-ui.js");
  const script = source("script.js");
  assert.match(ui, /renderApiHealth/);
  assert.match(ui, /ROOTS API not configured/);
  assert.match(ui, /providerConfigured/);
  assert.doesNotMatch(script, /This section could not load\. Check your connection/);
  assert.match(script, /FEATURE_LOAD_FAILED/);
});
test("backend provider errors distinguish config from temporary upstream failures", () => {
  const security = fs.readFileSync(path.join(ROOT, "roots_security.py"), "utf8");
  assert.match(security, /provider_config_error/);
  assert.match(security, /status in \{400, 401, 403, 404\}/);
  assert.match(security, /Gemini provider error status=%s model=%s message=%s/);
});