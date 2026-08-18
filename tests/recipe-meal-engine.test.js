"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require(path.join(__dirname, "..", "www", "ingredient-knowledge.js"));
require(path.join(__dirname, "..", "www", "ingredient-parser.js"));
require(path.join(__dirname, "..", "www", "dietary-rules.js"));
require(path.join(__dirname, "..", "www", "recipe-meal-engine.js"));
const engine = global.ROOTS_RECIPE_MEAL_ENGINE;
const vegan = { schemaVersion: 2, religiousDiets: [], lifestyleDiets: [{ id: "vegan", enabled: true, options: {} }], allergies: [], customRules: [], dislikes: [], crossContact: {} };

test("recipe candidates are re-evaluated by the deterministic engine", () => {
  assert.equal(engine.analyzeIngredients("milk, sugar", vegan).status, "CONFLICT");
  assert.equal(engine.analyzeIngredients("mystery sauce", vegan).status, "VERIFY");
});
test("meal candidates cannot inherit compatibility from AI prose", () => {
  const rows = engine.validateMealIdeas([{ name: "Cream bowl", reason: "Fits your profile", ingredients: ["milk", "rice"] }], vegan);
  assert.equal(rows[0].deterministicStatus, "CONFLICT");
  assert.notEqual(rows[0].deterministicReason, rows[0].reason);
});
test("empty ingredient candidates remain VERIFY", () => {
  assert.equal(engine.validateMealIdeas([{ name: "Mystery", ingredients: [] }], vegan)[0].deterministicStatus, "VERIFY");
});
