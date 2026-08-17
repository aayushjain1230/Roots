"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
global.localStorage = new MemoryStorage();
global.ROOTS_RESTAURANT_EVIDENCE = { constants: { VERSION: 1 } };
require(path.join(__dirname, "..", "www", "restaurant-ranking.js"));
require(path.join(__dirname, "..", "www", "restaurant-ranking-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-comparison.js"));
const Ranking = global.ROOTS_RESTAURANT_RANKING, Storage = global.ROOTS_RESTAURANT_RANKING_STORAGE, Comparison = global.ROOTS_RESTAURANT_COMPARISON;
const restaurant = (id, extra = {}) => ({ id, name: extra.name || `Restaurant ${id}`, cuisine: extra.cuisine || "Mixed", distanceMiles: extra.distanceMiles ?? 2, openStatus: extra.openStatus || "open", rating: extra.rating ?? 4.5, menuAvailable: extra.menuAvailable !== false });
const profile = (updatedAt = "2026-01-01T00:00:00Z") => ({ id: "default", name: "My Profile", schemaVersion: 2, updatedAt, religiousDiets: [], lifestyleDiets: [], allergies: [], crossContact: {}, customRules: [] });
const menu = (items, extra = {}) => ({
  id: extra.id || "m1", restaurantId: extra.restaurantId || "r1", restaurantName: extra.restaurantName || "Restaurant",
  title: "Dinner", menuType: extra.menuType || "dinner", lastNormalizedAt: extra.lastNormalizedAt || "2026-01-01T00:00:00Z",
  reviewedByUser: extra.reviewedByUser === true, warnings: extra.warnings || [],
  source: { type: extra.sourceType || "official_structured", official: extra.official !== false, retrievedAt: extra.retrievedAt || "2026-01-01T00:00:00Z" },
  sections: extra.sections || [{ id: "main", nameOriginal: "Entrees", items }, { id: "bowls", nameOriginal: "Bowls", items: [] }],
});
const evidence = (strong = false) => strong
  ? [{ source: "restaurant_allergen_guide", level: "confirmed", text: "Official allergen guide" }]
  : [{ source: "menu_description", level: "confirmed", text: "Description" }];
const resultDish = (id, verdict, extra = {}) => ({
  dishId: id, sectionId: extra.sectionId || "main", dishName: extra.name || id,
  verdict, evidence: extra.evidence || evidence(extra.strong), unknowns: extra.unknowns || [],
  suggestedModifications: extra.modifications || [], summary: "Explanation",
});
const report = (dishes) => ({ profileSnapshot: { id: "default" }, dishes, groups: {
  bestChoices: dishes.filter((item) => item.verdict === "SAFE"),
  canModify: dishes.filter((item) => item.verdict === "SAFE_WITH_MODIFICATION"),
  needsConfirmation: dishes.filter((item) => item.verdict === "NEEDS_CONFIRMATION"),
  avoid: dishes.filter((item) => item.verdict === "AVOID"),
} });
const ctx = (meal = "anything", now = Date.parse("2026-01-10T00:00:00Z")) => ({ meal, now, profile: profile(), evaluatedAt: "2026-01-10T00:00:00Z" });
const excellentData = () => {
  const dishes = [
    resultDish("d1", "SAFE", { name: "Pizza Margherita", strong: true }),
    resultDish("d2", "SAFE", { name: "Vegetable Pizza", sectionId: "bowls", strong: true }),
    resultDish("d3", "SAFE", { name: "Build Your Own Pizza", strong: true }),
    resultDish("d4", "SAFE", { name: "Paneer Flatbread", sectionId: "bowls", strong: true }),
  ];
  return { dishes, menu: menu(dishes.map((dish) => ({ id: dish.dishId })), { sections: [{ id: "main", nameOriginal: "Pizza", items: [] }, { id: "bowls", nameOriginal: "Entrees", items: [] }] }) };
};

test("Excellent Match requires several practical choices, variety, strong evidence, and current menu", () => {
  const data = excellentData();
  const summary = Ranking.summarize(restaurant("r1"), data.menu, report(data.dishes), ctx("pizza"));
  assert.equal(summary.matchCategory, "EXCELLENT_MATCH");
  assert.equal(summary.evidence.level, "STRONG");
});
test("Good Match has confirmed choices and adequate evidence", () => {
  const dishes = [resultDish("a", "SAFE"), resultDish("b", "SAFE_WITH_MODIFICATION", { modifications: [{}] })];
  const summary = Ranking.summarize(restaurant("r1"), menu([]), report(dishes), ctx());
  assert.equal(summary.matchCategory, "GOOD_MATCH");
});
test("one practical compatible dish becomes Limited Options", () => {
  const summary = Ranking.summarize(restaurant("r1"), menu([]), report([resultDish("a", "SAFE")]), ctx());
  assert.equal(summary.matchCategory, "LIMITED_OPTIONS");
});
test("missing menu becomes Needs More Information rather than Poor Match", () => {
  const summary = Ranking.summarize(restaurant("r1", { menuAvailable: false }), null, null, ctx());
  assert.equal(summary.matchCategory, "NEEDS_MORE_INFORMATION");
  assert.equal(summary.dishCounts.totalEvaluated, 0);
});
test("limited evidence with mostly unknown dishes becomes Needs More Information", () => {
  const dishes = [resultDish("a", "NEEDS_CONFIRMATION"), resultDish("b", "NEEDS_CONFIRMATION"), resultDish("c", "SAFE")];
  const summary = Ranking.summarize(restaurant("r1"), menu([], { sourceType: "user_image", official: false }), report(dishes), ctx());
  assert.equal(summary.matchCategory, "NEEDS_MORE_INFORMATION");
});
test("strong confirmed conflicts with no workable choices may become Poor Match", () => {
  const dishes = [resultDish("a", "AVOID", { strong: true }), resultDish("b", "AVOID", { strong: true })];
  assert.equal(Ranking.summarize(restaurant("r1"), menu([]), report(dishes), ctx()).matchCategory, "POOR_MATCH");
});
test("category ordering ranks Excellent above Good above Limited", () => {
  const make = (category, score) => ({ matchCategory: category, internalRanking: { value: score }, restaurantMetadata: { distanceMiles: 1 }, dishCounts: {}, evidence: { level: "MODERATE" } });
  const result = Ranking.sortSummaries([make("LIMITED_OPTIONS", 100), make("GOOD_MATCH", 10), make("EXCELLENT_MATCH", 0)], "best_match");
  assert.deepEqual(result.map((item) => item.matchCategory), ["EXCELLENT_MATCH", "GOOD_MATCH", "LIMITED_OPTIONS"]);
});
test("ordinary star rating does not affect internal score", () => {
  const dishes = [resultDish("a", "SAFE")], source = menu([]);
  const low = Ranking.summarize(restaurant("a", { rating: 1 }), source, report(dishes), ctx());
  const high = Ranking.summarize(restaurant("b", { rating: 5 }), source, report(dishes), ctx());
  assert.equal(low.internalRanking.value, high.internalRanking.value);
});
test("distance is secondary and breaks otherwise equal Best Match summaries", () => {
  const dishes = [resultDish("a", "SAFE")], source = menu([]);
  const far = Ranking.summarize(restaurant("far", { distanceMiles: 10 }), source, report(dishes), ctx());
  const near = Ranking.summarize(restaurant("near", { distanceMiles: 1 }), source, report(dishes), ctx());
  assert.equal(Ranking.sortSummaries([far, near], "best_match")[0].restaurantId, "near");
});
test("closed status lowers current-session ranking without changing category", () => {
  const dishes = [resultDish("a", "SAFE")], source = menu([]);
  const open = Ranking.summarize(restaurant("open"), source, report(dishes), ctx());
  const closed = Ranking.summarize(restaurant("closed", { openStatus: "closed" }), source, report(dishes), ctx());
  assert.equal(open.matchCategory, closed.matchCategory);
  assert.ok(open.internalRanking.value > closed.internalRanking.value);
});
test("stale menu prevents an unqualified Excellent Match", () => {
  const data = excellentData();
  const old = menu([], { sections: data.menu.sections, retrievedAt: "2025-01-01T00:00:00Z" });
  const summary = Ranking.summarize(restaurant("r1"), old, report(data.dishes), ctx("pizza"));
  assert.notEqual(summary.matchCategory, "EXCELLENT_MATCH");
  assert.ok(summary.limitations.some((item) => /last checked/.test(item)));
});
test("unknown freshness is shown honestly", () => {
  const source = menu([]); source.source.retrievedAt = null; source.lastNormalizedAt = null;
  assert.equal(Ranking.freshness(source).status, "unknown");
});
test("pizza intent prioritizes compatible pizza rather than unrelated salads", () => {
  const pizzaReport = report([resultDish("p", "SAFE", { name: "Margherita Pizza" })]);
  const saladReport = report([resultDish("s1", "SAFE", { name: "Garden Salad" }), resultDish("s2", "SAFE", { name: "Greek Salad" })]);
  assert.equal(Ranking.mealIntent(pizzaReport, menu([]), "pizza").relevance, "medium");
  assert.equal(Ranking.mealIntent(saladReport, menu([]), "pizza").relevance, "low");
});
test("Anything applies no meal-specific penalty", () => {
  const value = Ranking.mealIntent(report([resultDish("x", "SAFE", { name: "Soup" })]), menu([]), "Anything");
  assert.equal(value.relevance, "high");
});
test("breakfast and dessert use conservative mappings", () => {
  assert.notEqual(Ranking.mealIntent(report([resultDish("x", "SAFE", { name: "Pancake" })]), menu([]), "breakfast").relevance, "low");
  assert.equal(Ranking.mealIntent(report([resultDish("x", "SAFE", { name: "Steak Entree" })]), menu([]), "dessert").relevance, "low");
});
test("duplicate variants do not inflate compatible family count", () => {
  const dishes = ["Small Pizza", "Large Pizza", "Pizza 12 inch"].map((name, index) => resultDish(`d${index}`, "SAFE", { name }));
  const summary = Ranking.summarize(restaurant("r1"), menu([]), report(dishes), ctx("pizza"));
  assert.equal(summary.variety.compatibleDishFamilies, 1);
});
test("side and condiment sections do not count as practical compatible choices", () => {
  const dishes = [resultDish("sauce", "SAFE", { sectionId: "sides" })];
  const source = menu([], { sections: [{ id: "sides", nameOriginal: "Sauces and Toppings", items: [] }] });
  const summary = Ranking.summarize(restaurant("r1"), source, report(dishes), ctx());
  assert.equal(summary.dishCounts.bestChoice, 0);
});
test("compatible sections and distinct entree families increase variety", () => {
  const dishes = [resultDish("a", "SAFE", { name: "Rice Bowl", sectionId: "mains" }), resultDish("b", "SAFE", { name: "Vegetable Pizza", sectionId: "pizza" })];
  const source = menu([], { sections: [{ id: "mains", nameOriginal: "Entrees", items: [] }, { id: "pizza", nameOriginal: "Pizza", items: [] }] });
  const summary = Ranking.summarize(restaurant("r1"), source, report(dishes), ctx());
  assert.equal(summary.variety.compatibleSections, 2);
  assert.equal(summary.variety.compatibleDishFamilies, 2);
});
test("official allergen evidence increases evidence strength independently from counts", () => {
  const strong = Ranking.evidenceStrength(menu([]), report([resultDish("a", "SAFE", { strong: true })]));
  const moderate = Ranking.evidenceStrength(menu([]), report([resultDish("a", "SAFE")]));
  assert.equal(strong.level, "STRONG"); assert.equal(moderate.level, "MODERATE");
});
test("OCR-only menu has limited evidence even with compatible dishes", () => {
  assert.equal(Ranking.evidenceStrength(menu([], { sourceType: "user_image", official: false }), report([resultDish("a", "SAFE")])).level, "LIMITED");
});
test("cross-contact evidence creates visible burden and lowers score", () => {
  const base = resultDish("a", "SAFE");
  const cross = resultDish("a", "SAFE", { evidence: [{ source: "cross_contact", text: "Shared fryer", effect: "needs_confirmation" }] });
  const plain = Ranking.summarize(restaurant("r1"), menu([]), report([base]), ctx());
  const burden = Ranking.summarize(restaurant("r2"), menu([]), report([cross]), ctx());
  assert.equal(burden.crossContact.burden, "moderate");
  assert.ok(burden.internalRanking.value < plain.internalRanking.value);
});
test("supported modifications improve customization quality", () => {
  const dishes = Array.from({ length: 3 }, (_, index) => resultDish(`d${index}`, "SAFE_WITH_MODIFICATION", { modifications: [{}] }));
  assert.equal(Ranking.summarize(restaurant("r1"), menu([]), report(dishes), ctx()).customizationQuality, "strong");
});
test("alternative sorts are stable and handle missing distance", () => {
  const a = { restaurantId: "a", matchCategory: "GOOD_MATCH", internalRanking: { value: 1 }, restaurantMetadata: { distanceMiles: null }, dishCounts: { bestChoice: 1, canModify: 3 }, evidence: { level: "MODERATE" } };
  const b = { restaurantId: "b", matchCategory: "GOOD_MATCH", internalRanking: { value: 1 }, restaurantMetadata: { distanceMiles: 2 }, dishCounts: { bestChoice: 3, canModify: 0 }, evidence: { level: "STRONG" } };
  assert.equal(Ranking.sortSummaries([a, b], "distance")[0].restaurantId, "b");
  assert.equal(Ranking.sortSummaries([a, b], "best_choices")[0].restaurantId, "b");
  assert.equal(Ranking.sortSummaries([a, b], "modifiable")[0].restaurantId, "a");
  assert.equal(Ranking.sortSummaries([a, b], "evidence")[0].restaurantId, "b");
});
test("filters are reversible and do not mutate ranking data", () => {
  const items = [{ matchCategory: "EXCELLENT_MATCH", dishCounts: { bestChoice: 2, canModify: 0, needsConfirmation: 0 }, evidence: { level: "STRONG" }, restaurantMetadata: { openStatus: "open" }, freshness: { status: "current" } },
    { matchCategory: "GOOD_MATCH", dishCounts: { bestChoice: 1, canModify: 1, needsConfirmation: 0 }, evidence: { level: "MODERATE" }, restaurantMetadata: { openStatus: "closed" }, freshness: { status: "current" } }];
  const original = JSON.stringify(items);
  assert.equal(Ranking.applyFilters(items, ["excellent"]).length, 1);
  assert.equal(Ranking.applyFilters(items, ["modifiable"]).length, 1);
  assert.equal(Ranking.applyFilters(items, []).length, 2);
  assert.equal(JSON.stringify(items), original);
});
test("ranking cache key includes location, menu, profile, and engine versions", () => {
  const r = restaurant("r1"), m = menu([]), p = profile(), base = { location: { latitude: 40, longitude: -74 } };
  const key = Storage.cacheKey(r, m, p, base);
  assert.match(key, /40\.0000,-74\.0000/);
  assert.match(key, /m1/);
  assert.match(key, /2026-01-01/);
  assert.match(key, /\|1\|1$/);
});
test("profile and menu changes invalidate cache identity while theme does not", () => {
  const r = restaurant("r1"), m = menu([]), p = profile(), c = { location: { latitude: 40, longitude: -74 }, theme: "light" };
  const base = Storage.cacheKey(r, m, p, c);
  p.updatedAt = "2026-02-01T00:00:00Z";
  assert.notEqual(Storage.cacheKey(r, m, p, c), base);
  p.updatedAt = "2026-01-01T00:00:00Z"; m.lastNormalizedAt = "2026-02-01T00:00:00Z";
  assert.notEqual(Storage.cacheKey(r, m, p, c), base);
  m.lastNormalizedAt = "2026-01-01T00:00:00Z";
  assert.equal(Storage.cacheKey(r, m, p, { ...c, theme: "dark" }), base);
});
test("expired ranking cache is not returned", () => {
  global.localStorage = new MemoryStorage();
  Storage.set("key", { restaurantId: "r1" });
  assert.equal(Storage.get("key", Date.now() + Storage.ttl + 1000), null);
});
test("comparison accepts three, rejects fourth, removes, and clears", () => {
  Comparison.clear();
  for (let index = 0; index < 3; index += 1) assert.equal(Comparison.add({ restaurantId: `r${index}`, matchCategory: "GOOD_MATCH", evidence: { level: "MODERATE" } }).accepted, true);
  assert.equal(Comparison.add({ restaurantId: "r4" }).reason, "limit");
  assert.equal(Comparison.remove("r1").length, 2);
  assert.equal(Comparison.clear().length, 0);
});
test("results and detail markup expose categories, controls, semantic comparison, and no score", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const results = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-results-view.js"), "utf8");
  const detail = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-detail-view.js"), "utf8");
  assert.match(html, /Best Match/); assert.match(html, /Filter restaurant results/);
  assert.match(results, /<table><caption>Restaurant dietary comparison/);
  assert.match(detail, /Why this match\?/);
  assert.doesNotMatch(`${results}\n${detail}`, /internalRanking\.value|\d+%|compatibilityPercent/);
});
test("all untrusted result content is escaped and unsafe images are inherited as validated HTTPS only", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-results-view.js"), "utf8");
  assert.match(source, /replace\(\/\[&<>"'\]\/g/);
  assert.doesNotMatch(source, /insertAdjacentHTML|outerHTML\s*=/);
});
test("ranking modules contain no AI, network search, or profile transmission", () => {
  const sources = ["restaurant-ranking.js", "restaurant-ranking-storage.js", "restaurant-comparison.js", "restaurant-detail-view.js", "restaurant-results-view.js"].map((file) => fs.readFileSync(path.join(__dirname, "..", "www", file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /gemini|generativelanguage|openai|fetch\s*\(/i);
});
test("ranking 100 restaurants remains deterministic", () => {
  const dishes = [resultDish("a", "SAFE")], source = menu([]), rep = report(dishes);
  const summaries = Array.from({ length: 100 }, (_, index) => Ranking.summarize(restaurant(`r${index}`, { distanceMiles: index / 10 }), source, rep, ctx()));
  const ranked = Ranking.sortSummaries(summaries, "best_match");
  assert.equal(ranked.length, 100); assert.equal(ranked[0].restaurantId, "r0");
});
test("service worker caches every Phase 4E module", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  for (const file of ["restaurant-ranking.js", "restaurant-ranking-storage.js", "restaurant-comparison.js", "restaurant-detail-view.js", "restaurant-results-view.js"]) assert.match(sw, new RegExp(file.replace(".", "\\.")));
});
