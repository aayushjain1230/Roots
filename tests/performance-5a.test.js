"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(ROOT, "www", name), "utf8");
function context(extra = {}) {
  const map = new Map();
  const ctx = {
    console, Date, Math, JSON, Map, Set, WeakMap, URLSearchParams, AbortController,
    DOMException, setTimeout, clearTimeout, performance,
    localStorage: { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) },
    navigator: { onLine: true }, location: { search: "" }, ...extra,
  };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx); return ctx;
}
function load(ctx, files) { files.forEach((file) => vm.runInContext(source(file), ctx, { filename: file })); return ctx; }

test("performance monitor is disabled by default and strips sensitive metadata", () => {
  const ctx = load(context(), ["performance-monitor.js"]);
  assert.equal(ctx.ROOTS_PERFORMANCE.isEnabled(), false);
  ctx.ROOTS_PERFORMANCE.enable();
  const id = ctx.ROOTS_PERFORMANCE.startTask("OCR label", { count: 2, rawText: "private ingredients", allergy: "peanut", bytes: 100 });
  ctx.ROOTS_PERFORMANCE.endTask(id, { status: "ok", image: "base64" });
  const report = ctx.ROOTS_PERFORMANCE.getReport();
  assert.equal(report.entries.at(-1).metadata.count, 2);
  assert.equal(report.entries.at(-1).metadata.bytes, 100);
  assert.equal(report.entries.at(-1).metadata.rawText, undefined);
  assert.doesNotMatch(JSON.stringify(report), /private ingredients|peanut|base64/);
});

test("network client deduplicates identical in-flight requests", async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, status: 200, headers: {}, text: async () => '{"ok":true}' };
  };
  const ctx = load(context({ fetch }), ["network-client.js"]);
  const [a, b] = await Promise.all([
    ctx.ROOTS_NETWORK.request("https://example.test/a", { dedupeKey: "same" }),
    ctx.ROOTS_NETWORK.request("https://example.test/a", { dedupeKey: "same" }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.data.ok, true);
  assert.equal(b.data.ok, true);
  assert.equal(ctx.ROOTS_NETWORK.inflightCount(), 0);
});

test("failed network request leaves the in-flight registry and can retry later", async () => {
  let calls = 0;
  const ctx = load(context({ fetch: async () => { calls += 1; throw new Error("network"); } }), ["network-client.js"]);
  await assert.rejects(ctx.ROOTS_NETWORK.request("https://example.test/fail", { dedupeKey: "failure" }));
  assert.equal(ctx.ROOTS_NETWORK.inflightCount(), 0);
  await assert.rejects(ctx.ROOTS_NETWORK.request("https://example.test/fail", { dedupeKey: "failure" }));
  assert.equal(calls, 2);
});

test("an unreliable navigator.onLine flag does not suppress a reachable request", async () => {
  let calls = 0;
  const ctx = load(context({
    navigator: { onLine: false },
    fetch: async () => {
      calls += 1;
      return { ok: true, status: 200, headers: {}, text: async () => '{"ok":true}' };
    },
  }), ["network-client.js"]);
  const response = await ctx.ROOTS_NETWORK.request("https://example.test/reachable");
  assert.equal(calls, 1);
  assert.equal(response.data.ok, true);
});

test("startup HTML excludes heavy feature scripts and keeps the critical scanner path", () => {
  const index = source("index.html"), loader = source("feature-loader.js");
  assert.match(index, /performance-monitor\.js/);
  assert.match(index, /network-client\.js/);
  assert.match(index, /feature-loader\.js/);
  assert.match(index, /scan-pipeline\.js/);
  assert.doesNotMatch(index, /<script src="restaurant-ranking\.js"/);
  assert.doesNotMatch(index, /<script src="travel-glossary\.js"/);
  assert.doesNotMatch(index, /<script src="assistant\.js"/);
  assert.match(loader, /restaurants:\s*\[/);
  assert.match(loader, /travel:\s*\[/);
  assert.match(loader, /ensureForView/);
});

test("service worker separates critical shell from on-demand feature cache", () => {
  const sw = source("sw.js");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /roots-features-v5a-1/);
  assert.match(sw, /const LAZY_FEATURES/);
  assert.match(sw, /cache\.put\(req, response\.clone\(\)\)/);
  assert.doesNotMatch(sw, /roots-personalization-v1|bij-history-v2|roots-saved-products-v1|GEMINI_API_KEY/);
});

test("a new service-worker version reloads shell assets instead of carrying stale JavaScript", () => {
  const worker = source("sw.js");
  assert.match(worker, /new Request\(path,\s*\{\s*cache:\s*"reload"\s*\}\)/);
  assert.match(worker, /c\.addAll\(freshShell\)/);
});

test("normalization cache is bounded and avoids rebuilding identical values", () => {
  const ctx = context({ ROOTS_INGREDIENT_KNOWLEDGE: { ocrCorrections: {} } });
  load(ctx, ["ingredient-parser.js"]);
  const first = ctx.ROOTS_INGREDIENT_PARSER.normalizeIngredientText("Milk");
  const second = ctx.ROOTS_INGREDIENT_PARSER.normalizeIngredientText("Milk");
  assert.equal(first, second);
  for (let index = 0; index < 700; index += 1) ctx.ROOTS_INGREDIENT_PARSER.normalizeIngredientText(`ingredient ${index}`);
  assert.ok(ctx.ROOTS_INGREDIENT_PARSER.normalizationCacheSize() <= 500);
});

test("smart search reuses its index and invalidates after local changes", () => {
  const listeners = {};
  const ctx = context({ addEventListener: (name, fn) => { listeners[name] = fn; } });
  load(ctx, ["smart-search.js"]);
  const input = { savedProducts: [{ id: "p1", product: { name: "Oat Milk" } }], history: [], favoriteRestaurants: [], meals: [] };
  const first = ctx.ROOTS_SMART_SEARCH.index(input), second = ctx.ROOTS_SMART_SEARCH.index(input);
  assert.equal(first, second);
  listeners["roots:savedproductschange"]();
  assert.notEqual(ctx.ROOTS_SMART_SEARCH.index(input), first);
});

test("menu OCR is sequential, cache-indexed, and request-deduplicated", () => {
  const menu = source("restaurant-menu-ocr.js");
  assert.match(menu, /concurrency:\s*1/);
  assert.match(menu, /new Map\(cache\.map/);
  assert.match(menu, /dedupeKey:\s*`menu-ocr:/);
  assert.doesNotMatch(menu, /Promise\.all\([^)]*extractPage/);
});
