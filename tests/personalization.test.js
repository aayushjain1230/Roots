"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(ROOT, "www", name), "utf8");
function storage() {
  const map = new Map();
  return { getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), map };
}
function load(files) {
  const localStorage = storage();
  const context = { console, Date, Math, JSON, Map, Set, localStorage };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(source(file), context, { filename: file }));
  return context;
}
const files = ["personalization-storage.js", "recommendation-engine.js", "smart-search.js"];
const product = (id, verdict = "SAFE", extra = {}) => ({
  id, scannedAt: extra.scannedAt || "2026-07-20T12:00:00Z", verdict,
  product: { name: extra.name || id, brand: extra.brand || "Roots Brand", barcode: id, categories: extra.categories || "" },
  evaluation: { verdict },
});

test("favorites and explicit preferences are versioned, bounded, and local", () => {
  const ctx = load(files), api = ctx.ROOTS_PERSONALIZATION;
  api.favorite("products", { id: "p1", name: "Oat Bites", metadata: { verdict: "SAFE" } });
  api.setPreference("groceryStore", "Costco");
  assert.equal(api.isFavorite("products", "p1"), true);
  assert.equal(api.getState().preferences.groceryStore, "Costco");
  assert.ok(ctx.localStorage.map.has("roots-personalization-v1"));
  assert.throws(() => api.favorite("medical", { id: "x" }), /Unknown favorite type/);
});

test("Recently Safe excludes caution and avoid records", () => {
  const ctx = load(files);
  const results = ctx.ROOTS_RECOMMENDATIONS.recentlySafe([
    product("safe", "SAFE"), product("caution", "CAUTION"), product("avoid", "AVOID"),
  ]);
  assert.deepEqual(Array.from(results, (item) => item.id), ["safe"]);
  assert.match(results[0].reason, /recently scanned/i);
});

test("product recommendations are deterministic and every item explains why", () => {
  const ctx = load(files);
  const history = [product("a", "SAFE", { brand: "Repeat" }), product("b", "SAFE", { brand: "Repeat" }), product("x", "AVOID")];
  const first = ctx.ROOTS_RECOMMENDATIONS.products({ history, savedProducts: [], groceryStore: "Target" });
  const second = ctx.ROOTS_RECOMMENDATIONS.products({ history, savedProducts: [], groceryStore: "Target" });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.ok(first.every((item) => item.verdict === "SAFE" && item.reason));
  assert.doesNotMatch(JSON.stringify(first), /"x"/);
});

test("alternatives use only known safe products and transparent similarity labels", () => {
  const ctx = load(files);
  const unsafe = product("bad", "AVOID", { name: "Chocolate Oat Bar", categories: "snack bar" });
  const results = ctx.ROOTS_RECOMMENDATIONS.alternatives(unsafe, [
    product("safe", "SAFE", { name: "Chocolate Oat Bites", categories: "snack bar" }),
    product("unknown", "CAUTION", { name: "Chocolate Bar" }),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "safe");
  assert.ok(["Very Similar", "Similar", "Different but Safe"].includes(results[0].similarity));
  assert.match(results[0].reason, /known local product/i);
});

test("restaurant and meal recommendations exclude incompatible verdicts", () => {
  const ctx = load(files);
  const restaurants = ctx.ROOTS_RECOMMENDATIONS.restaurants([
    { restaurantId: "r1", restaurantName: "Good", matchCategory: "GOOD_MATCH", dishCounts: { bestChoice: 2 } },
    { restaurantId: "r2", restaurantName: "Poor", matchCategory: "POOR_MATCH", dishCounts: { bestChoice: 9 } },
  ], []);
  const meals = ctx.ROOTS_RECOMMENDATIONS.meals([
    { id: "m1", name: "Bowl", favorite: true, evaluation: { verdict: "COMPATIBLE" } },
    { id: "m2", name: "Unsafe", favorite: true, evaluation: { verdict: "AVOID" } },
  ]);
  assert.deepEqual(Array.from(restaurants, (item) => item.restaurantId), ["r1"]);
  assert.deepEqual(Array.from(meals, (item) => item.id), ["m1"]);
  assert.ok(restaurants[0].reason && meals[0].reason);
});

test("smart search spans local products, restaurants, meals, history, and ingredients", () => {
  const ctx = load(files);
  ctx.ROOTS_INGREDIENT_KNOWLEDGE = { entries: [{ id: "sesame", displayName: "Sesame", aliases: ["tahini"] }] };
  const input = {
    savedProducts: [{ id: "p1", product: { name: "Sesame Crackers", brand: "A" } }],
    history: [{ id: "h1", product: { name: "Oat Milk" } }],
    favoriteRestaurants: [{ id: "r1", name: "Sesame Kitchen", detail: "Mediterranean" }],
    meals: [{ id: "m1", name: "Sesame Bowl", restaurant: { name: "Sesame Kitchen" } }],
  };
  const types = new Set(ctx.ROOTS_SMART_SEARCH.search("sesame", input).map((item) => item.type));
  assert.deepEqual([...types].sort(), ["ingredient", "meal", "product", "restaurant"]);
});

test("Phase 4H UI and offline shell are wired without network or AI calls", () => {
  const index = source("index.html"), view = source("personalization-view.js"), engine = source("recommendation-engine.js"), sw = source("sw.js");
  assert.match(index, /personalized-home/);
  assert.match(index, /Saved Products/);
  assert.match(view, /grocery-mode-store/);
  assert.match(index, /personalization-storage\.js/);
  assert.match(source("restaurant-detail-view.js"), /data-favorite-dish/);
  assert.match(sw, /roots-shell-v5c-1/);
  ["personalization-storage.js", "recommendation-engine.js", "smart-search.js", "personalization-view.js"].forEach((file) => assert.match(sw, new RegExp(file.replace(".", "\\."))));
  assert.doesNotMatch(`${view}\n${engine}`, /\bfetch\s*\(|GEMINI|generateContent|XMLHttpRequest/);
  assert.doesNotMatch(sw, /roots-personalization-v1|bij-history-v2|roots-saved-products-v1/);
});
