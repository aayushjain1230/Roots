"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
global.localStorage = new MemoryStorage();
const profile = (updatedAt = "2026-07-01T00:00:00Z") => ({ id: "profile-1", name: "My Profile", schemaVersion: 2, updatedAt, religiousDiets: [], lifestyleDiets: ["vegan"], allergies: [], crossContact: { preset: "standard" }, customRules: [] });
const menu = (extra = {}) => ({
  schemaVersion: 1, id: extra.id || "menu-1", restaurantId: "rest-1", restaurantName: "Test Kitchen",
  lastNormalizedAt: extra.updatedAt || "2026-07-01T00:00:00Z", source: { id: "official-1", type: "official_structured" },
  allergenNotes: extra.allergenNotes || [], footnotes: extra.footnotes || [],
  sections: [{ id: "mains", nameOriginal: "Mains", items: extra.removeDish ? [] : [{ id: "bowl", nameOriginal: "Vegetable Bowl", descriptionOriginal: extra.description || "Rice and vegetables", price: { display: extra.price || "$12" }, modifiers: extra.modifiers || [{ id: "no-garlic", textOriginal: "No garlic" }], options: [], sizes: [] }] }],
});
const evidenceResult = () => ({ dishId: "bowl", sectionId: "mains", dishName: "Vegetable Bowl", verdict: "SAFE", summary: "No conflicts", evidence: [{ source: "menu", level: "confirmed", text: "Rice and vegetables" }], warnings: [], unknowns: [], restaurantNotes: [], suggestedModifications: [] });
let currentMenu = menu(), currentProfile = profile();
global.ROOTS_RESTAURANT_RANKING_STORAGE = { profileFingerprint: (value) => JSON.stringify({ id: value.id, updatedAt: value.updatedAt, crossContact: value.crossContact }) };
global.ROOTS_PROFILE = { getActiveProfile: () => currentProfile };
global.ROOTS_RESTAURANT_EVIDENCE = { constants: { VERSION: 1 } };
global.ROOTS_MENU_STORAGE = { get: () => currentMenu, getByRestaurant: () => [currentMenu], getFreshness: () => ({ state: "current" }) };
global.ROOTS_MEAL_ENGINE = {
  constants: { VERSION: 1 },
  findDish: (source, id) => { for (const section of source.sections) { const dish = section.items.find((item) => item.id === id); if (dish) return { dish, section }; } return null; },
  supportedOptions: (dish) => (dish.modifiers || []).map((item) => ({ id: item.id, label: item.textOriginal, type: "resolution" })),
  newMeal: (source, report) => ({ schemaVersion: 1, engineVersion: 1, id: "meal-current", restaurant: { id: source.restaurantId, name: source.restaurantName }, menuId: source.id, main: { dishId: "bowl", name: "Vegetable Bowl", options: [{ id: "no-garlic", label: "No garlic", type: "resolution" }], evidence: report.dishes[0] }, sides: [], drinks: [], desserts: [], extras: [], selectedOptionIds: [], portion: { id: "standard", label: "Standard" } }),
  update: (meal, changes) => ({ ...meal, ...changes, analysis: { verdict: "BEST_CHOICE", label: "Best Choice", conflicts: [], warnings: [], unknowns: [], evidence: [], selectedModifications: [] } }),
  addComponent: (meal) => meal,
};
global.ROOTS_RESTAURANT_REPORT = { generate: () => ({ profileSnapshot: { id: currentProfile.id }, dishes: [evidenceResult()] }) };
require(path.join(__dirname, "..", "www", "restaurant-meal-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-order-history.js"));
require(path.join(__dirname, "..", "www", "restaurant-memory-search.js"));
require(path.join(__dirname, "..", "www", "restaurant-order-recheck.js"));
const Saved = global.ROOTS_SAVED_MEALS, History = global.ROOTS_ORDER_HISTORY, Search = global.ROOTS_MEMORY_SEARCH, Recheck = global.ROOTS_ORDER_RECHECK;
const reviewedMeal = () => ({ schemaVersion: 1, engineVersion: 1, id: "meal-1", restaurant: { id: "rest-1", name: "Test Kitchen" }, menuId: "menu-1", main: { dishId: "bowl", name: "Vegetable Bowl", options: [{ id: "no-garlic", label: "No garlic", type: "resolution" }], evidence: evidenceResult() }, sides: [], drinks: [], desserts: [], extras: [], selectedOptionIds: ["no-garlic"], portion: { id: "standard", label: "Standard" }, analysis: { verdict: "BEST_CHOICE", conflicts: [], warnings: [], unknowns: [], evidence: [], selectedModifications: ["No garlic"] } });
const reset = () => { localStorage.clear(); currentMenu = menu(); currentProfile = profile(); };

test("completed meal saves with versioned exact snapshots and useful default name", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu });
  assert.equal(record.schemaVersion, 1); assert.equal(record.name, "Vegetable Bowl at Test Kitchen");
  assert.deepEqual(record.meal.selectedOptionIds, ["no-garlic"]); assert.equal(record.evaluation.verdict, "BEST_CHOICE");
});
test("custom name and notes persist while empty names are rejected", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu, name: "My Usual", personalNotes: "Sauce on side" });
  assert.equal(Saved.get(record.id).personalNotes, "Sauce on side");
  assert.throws(() => Saved.save(reviewedMeal(), { menu: currentMenu, name: " " }), /name/i);
});
test("saved records use individual keys and bounded index", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu });
  assert.ok(localStorage.getItem(Saved.keys.PREFIX + record.id)); assert.ok(localStorage.getItem(Saved.keys.INDEX_KEY));
});
test("rename, archive, restore, duplicate, and delete preserve unrelated history", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu }); const order = History.markOrdered(record.id, {});
  Saved.update(record.id, { name: "Renamed" }); Saved.archive(record.id); assert.equal(Saved.get(record.id).status, "archived");
  Saved.restore(record.id); const copy = Saved.duplicate(record.id, { name: "Copy" }); assert.equal(copy.sourceMealId, record.id);
  Saved.remove(record.id); assert.ok(History.get(order.id)); assert.ok(Saved.get(copy.id));
});
test("mark ordered creates separate history and increments use once", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu });
  assert.equal(Saved.get(record.id).timesUsed, 0);
  const order = History.markOrdered(record.id, { restaurantConfirmed: "yes", mealReceivedAsRequested: "yes", notes: "Correct order" });
  assert.equal(order.userOutcome.restaurantConfirmed, "yes"); assert.equal(Saved.get(record.id).timesUsed, 1); assert.equal(Saved.list().length, 1);
});
test("history deletion does not remove favorite meal", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); const order = History.markOrdered(saved.id, {});
  History.remove(order.id); assert.ok(Saved.get(saved.id));
});
test("search finds name restaurant dish modifier and is case insensitive", () => {
  reset(); const record = Saved.save(reviewedMeal(), { menu: currentMenu, name: "Travel Lunch" });
  for (const query of ["travel", "TEST KITCHEN", "vegetable", "garlic"]) assert.equal(Search.search([record], query).length, 1);
  assert.equal(Search.search([record], "<script>alert(1)</script>").length, 0);
});
test("filters and stable sorts do not mutate records", () => {
  reset(); const first = Saved.save(reviewedMeal(), { menu: currentMenu, name: "Zulu" }); const second = Saved.save(reviewedMeal(), { menu: currentMenu, name: "Alpha" });
  Saved.update(first.id, { recheckStatus: "required", timesUsed: 3 });
  const records = Saved.list(), original = JSON.stringify(records);
  assert.equal(Search.filter(records, { needsRecheck: true }).length, 1);
  assert.equal(Search.sort(records, "meal_name")[0].name, "Alpha"); assert.equal(Search.sort(records, "most_used")[0].name, "Zulu");
  assert.equal(JSON.stringify(records), original);
});
test("unchanged current profile and menu still require review", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); const result = Recheck.inspect(saved.id);
  assert.equal(result.inspection.state, "UNCHANGED"); assert.equal(result.requiresReview, true);
  assert.equal(result.original.evaluation.verdict, "BEST_CHOICE"); assert.equal(result.current.analysis.verdict, "BEST_CHOICE");
});
test("profile change is detected without overwriting original snapshot", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); const original = Saved.get(saved.id).profile.profileFingerprint;
  currentProfile = profile("2026-07-20T00:00:00Z"); const result = Recheck.inspect(saved.id);
  assert.ok(result.inspection.changes.some((item) => item.type === "PROFILE_CHANGED")); assert.equal(Saved.get(saved.id).profile.profileFingerprint, original);
});
test("menu, dish description, and source changes are detected but price is informational", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu });
  currentMenu = menu({ id: "menu-2", updatedAt: "2026-07-20T00:00:00Z", description: "Changed recipe", price: "$14" });
  const inspection = Recheck.detectChanges(saved);
  assert.ok(inspection.changes.some((item) => item.type === "MENU_CHANGED")); assert.ok(inspection.changes.some((item) => item.type === "DISH_CHANGED"));
  assert.ok(inspection.informational.some((item) => item.type === "PRICE_CHANGED"));
});
test("missing modifier is retained and forces current Needs Confirmation", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); currentMenu = menu({ modifiers: [] });
  const result = Recheck.inspect(saved.id);
  assert.equal(result.inspection.missingModifiers[0].id, "no-garlic"); assert.equal(result.current.analysis.verdict, "NEEDS_CONFIRMATION");
});
test("missing dish is unavailable and saved record remains", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); currentMenu = menu({ removeDish: true });
  const result = Recheck.inspect(saved.id); assert.equal(result.inspection.state, "UNAVAILABLE"); assert.equal(result.current, null); assert.ok(Saved.get(saved.id));
});
test("engine version change triggers evidence update while historical versions remain", () => {
  reset(); const saved = Saved.save(reviewedMeal(), { menu: currentMenu }); global.ROOTS_RESTAURANT_EVIDENCE.constants.VERSION = 2;
  const inspection = Recheck.detectChanges(saved); assert.ok(inspection.changes.some((item) => item.type === "EVIDENCE_UPDATED")); assert.equal(Saved.get(saved.id).evaluation.evidenceEngineVersion, 1);
  global.ROOTS_RESTAURANT_EVIDENCE.constants.VERSION = 1;
});
test("250 saved records and 1000 history records remain queryable", () => {
  reset();
  for (let i = 0; i < 250; i += 1) Saved.save(reviewedMeal(), { menu: currentMenu, name: `Meal ${i}` });
  assert.equal(Saved.list().length, 250); assert.equal(Search.search(Saved.list(), "Meal 249").length, 1);
  const base = Saved.list()[0]; for (let i = 0; i < 1000; i += 1) History.markOrdered({ ...base, id: `transient-${i}` }, { orderedAt: new Date(2026, 0, 1, 0, 0, i).toISOString() });
  assert.equal(History.list().length, 1000);
});
test("service worker caches Phase 4F-B modules but never private records", () => {
  const fs = require("node:fs"), sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  for (const file of ["restaurant-order-history.js", "restaurant-memory-search.js", "restaurant-order-recheck.js", "restaurant-memory-view.js"]) assert.match(sw, new RegExp(file.replace(".", "\\.")));
  assert.match(sw, /roots-shell-v5c-1/); assert.doesNotMatch(sw, /roots-saved-meal-v2:/);
});
