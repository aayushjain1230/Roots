"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}
global.localStorage = new MemoryStorage();
require(path.join(__dirname, "..", "www", "restaurant-meal-engine.js"));
require(path.join(__dirname, "..", "www", "restaurant-meal-storage.js"));
const Engine = global.ROOTS_MEAL_ENGINE, Storage = global.ROOTS_MEAL_STORAGE;
const menu = {
  id: "menu-1", restaurantId: "rest-1", restaurantName: "Test Kitchen",
  sections: [
    { id: "main", nameOriginal: "Entrees", items: [{ id: "bowl", nameOriginal: "Vegetable Bowl", price: { display: "$12" }, sizes: [{ label: "Large" }], modifiers: [{ textOriginal: "No garlic" }, { textOriginal: "Add cheese" }], options: [] }] },
    { id: "sides", nameOriginal: "Sides", items: [{ id: "fries", nameOriginal: "Fries", price: { display: "$4" }, modifiers: [], options: [] }] },
    { id: "drinks", nameOriginal: "Drinks", items: [{ id: "tea", nameOriginal: "Tea", price: { display: "$3" }, modifiers: [], options: [] }] },
    { id: "dessert", nameOriginal: "Desserts", items: [{ id: "cake", nameOriginal: "Mystery Cake", price: { display: "$7" }, modifiers: [], options: [] }] },
  ],
};
const dishName = (id) => menu.sections.flatMap((section) => section.items).find((dish) => dish.id === id).nameOriginal;
const evidence = (dishId, verdict, extra = {}) => ({
  dishId, dishName: dishName(dishId), verdict, summary: extra.summary || verdict,
  evidence: extra.evidence || [{ source: "menu", level: "confirmed", text: "Published menu evidence" }],
  warnings: extra.warnings || [], unknowns: extra.unknowns || [], restaurantNotes: extra.restaurantNotes || [],
  suggestedModifications: extra.suggestedModifications || [],
});
const report = {
  profileSnapshot: { id: "profile-1" },
  dishes: [
    evidence("bowl", "SAFE_WITH_MODIFICATION", { suggestedModifications: [{ id: "modify-garlic", instruction: "Request no garlic.", supportingMenuText: "No garlic", removesConflictIds: ["garlic"] }] }),
    evidence("fries", "SAFE"), evidence("tea", "SAFE"),
    evidence("cake", "NEEDS_CONFIRMATION", { unknowns: ["cake ingredients"] }),
  ],
};
function freshMeal() { return Engine.update(Engine.newMeal(menu, report, "bowl"), {}); }
test("required menu-supported modification must be selected", () => {
  const meal = freshMeal();
  assert.equal(meal.analysis.verdict, "NEEDS_CONFIRMATION");
  assert.equal(meal.analysis.unresolvedRequired.length, 1);
});
test("supported required modification makes the main compatible", () => {
  const meal = Engine.selectOption(freshMeal(), "modify-garlic", true);
  assert.equal(meal.analysis.verdict, "COMPATIBLE");
  assert.deepEqual(meal.analysis.selectedModifications, ["Request no garlic."]);
});
test("menu-supported side and drink reuse cached dish evidence", () => {
  let meal = Engine.selectOption(freshMeal(), "modify-garlic", true);
  meal = Engine.addComponent(meal, menu, report, "fries", "sides");
  meal = Engine.addComponent(meal, menu, report, "tea", "drinks");
  assert.equal(meal.analysis.verdict, "COMPATIBLE");
  assert.equal(meal.sides[0].evidence, report.dishes[1]);
});
test("unknown dessert propagates Needs Confirmation", () => {
  let meal = Engine.selectOption(freshMeal(), "modify-garlic", true);
  meal = Engine.addComponent(meal, menu, report, "cake", "desserts");
  assert.equal(meal.analysis.verdict, "NEEDS_CONFIRMATION");
  assert.ok(meal.analysis.unknowns.includes("cake ingredients"));
});
test("ingredient-bearing modifier delegates to the deterministic dish engine", () => {
  global.ROOTS_MENU_STORAGE = { get: () => menu };
  global.ROOTS_PROFILE = { getActiveProfile: () => ({ id: "profile-1" }) };
  global.ROOTS_RESTAURANT_EVIDENCE = { evaluateDish: (_menu, dish) => ({
    verdict: dish.descriptionOriginal === "cheese" ? "AVOID" : "SAFE",
    summary: "Cheese conflicts with Vegan.", evidence: [], warnings: [], unknowns: [],
  }) };
  const meal = Engine.selectOption(freshMeal(), "modifier-add-cheese", true);
  assert.equal(meal.analysis.verdict, "AVOID");
  assert.match(meal.analysis.conflicts[0], /Cheese conflicts with Vegan/);
  delete global.ROOTS_MENU_STORAGE; delete global.ROOTS_PROFILE; delete global.ROOTS_RESTAURANT_EVIDENCE;
});
test("impossible options and dishes are rejected", () => {
  assert.throws(() => Engine.selectOption(freshMeal(), "invented-substitution", true), /menu-supported/);
  assert.throws(() => Engine.addComponent(freshMeal(), menu, report, "missing-dish", "sides"), /menu-supported/);
});
test("components are derived from actual menu sections", () => {
  const available = Engine.availableComponents(menu, report);
  assert.equal(available.sides[0].dishId, "fries");
  assert.equal(available.drinks[0].dishId, "tea");
  assert.equal(available.desserts[0].dishId, "cake");
});
test("comparison is evidence-backed and limited to three dishes", () => {
  const rows = Engine.compare(report, ["bowl", "fries", "tea", "cake"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].verdict, "SAFE_WITH_MODIFICATION");
});
test("portion awareness does not alter compatibility", () => {
  const base = Engine.selectOption(freshMeal(), "modify-garlic", true);
  const large = Engine.update(base, { portion: { id: "large", label: "Large", menuSupported: true } });
  assert.equal(large.analysis.verdict, "COMPATIBLE");
  assert.match(large.analysis.portionAwareness, /does not change dietary compatibility/);
});
test("reviewed meals save locally", () => {
  const meal = Engine.selectOption(freshMeal(), "modify-garlic", true);
  Storage.save(meal);
  assert.equal(Storage.list()[0].meal.mainDishId, "bowl");
  assert.equal(Storage.list().length, 1);
});
