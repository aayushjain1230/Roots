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
for (const file of ["profile-definitions.js", "profile.js", "ingredient-knowledge.js", "ingredient-parser.js", "dietary-rules.js", "restaurant-modifier-engine.js", "restaurant-evidence-engine.js", "restaurant-compatibility-report.js"]) {
  require(path.join(__dirname, "..", "www", file));
}
const Profiles = global.ROOTS_PROFILE, Evidence = global.ROOTS_RESTAURANT_EVIDENCE, Reports = global.ROOTS_RESTAURANT_REPORT;
const profile = (change) => {
  const value = Profiles.createDefaultProfile({ onboardingComplete: true, timestamp: "2026-01-01T00:00:00Z" });
  change?.(value);
  value.updatedAt = "2026-01-01T00:00:00Z";
  return value;
};
const dish = (description, extra = {}) => ({
  id: extra.id || "dish-1", sectionId: "section-1", nameOriginal: extra.name || "Test Dish",
  descriptionOriginal: description, descriptionTranslated: null, modifiers: extra.modifiers || [],
  options: extra.options || [], dietaryLabels: extra.dietaryLabels || [], allergenLabels: extra.allergenLabels || [],
  menuNotes: extra.menuNotes || [], sourcePageIds: ["p1"], extraction: extra.extraction || { method: "text", evidenceLevel: "confirmed", warnings: [] },
  userEdited: true,
});
const menu = (items, extra = {}) => ({
  schemaVersion: 1, id: extra.id || "menu-1", restaurantId: "r1", restaurantName: "Test Kitchen",
  title: "Dinner", menuType: "dinner", source: { type: "official_structured", official: true, retrievedAt: "2026-01-01T00:00:00Z" },
  sections: [{ id: "section-1", nameOriginal: "Mains", order: 0, items }], allergenNotes: extra.allergenNotes || [],
  footnotes: extra.footnotes || [], dietaryLegend: [], warnings: [], lastNormalizedAt: "2026-01-01T00:00:00Z", reviewedByUser: true,
});

test("confirmed known ingredients with no conflicts are Safe", () => {
  const result = Evidence.evaluateDish(menu([]), dish("sugar"), profile());
  assert.equal(result.verdict, "SAFE");
  assert.equal(result.unknowns.length, 0);
});
test("missing description propagates Needs Confirmation", () => {
  const result = Evidence.evaluateDish(menu([]), dish(""), profile());
  assert.equal(result.verdict, "NEEDS_CONFIRMATION");
  assert.ok(result.unknowns.some((item) => item.code === "description_missing"));
});
test("unknown ingredient never becomes Safe", () => {
  const result = Evidence.evaluateDish(menu([]), dish("mystery house powder"), profile());
  assert.equal(result.verdict, "NEEDS_CONFIRMATION");
  assert.ok(result.possibleIngredients.length);
});
test("unknown sauce, broth, and seasoning propagate uncertainty", () => {
  for (const text of ["tomato, house sauce", "rice, broth", "potato, seasoning"]) {
    assert.equal(Evidence.evaluateDish(menu([]), dish(text), profile()).verdict, "NEEDS_CONFIRMATION");
  }
});
test("confirmed pork is Avoid for Halal", () => {
  const p = profile((value) => { value.religiousDiets.find((item) => item.id === "halal").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("pork"), p);
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.ruleTrace.some((item) => item.ruleId === "halal"));
});
test("shellfish is Avoid for Kosher and a shellfish allergy", () => {
  const p = profile((value) => {
    value.religiousDiets.find((item) => item.id === "kosher").enabled = true;
    value.allergies.push({ id: "shellfish", label: "Shellfish", normalizedTerm: "shellfish", type: "built_in" });
  });
  const result = Evidence.evaluateDish(menu([]), dish("shrimp"), p);
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.profileConflicts.some((item) => item.category === "allergy"));
});
test("Jain onion and garlic settings produce traceable Avoid", () => {
  const p = profile((value) => { value.religiousDiets.find((item) => item.id === "jain").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("garlic"), p);
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.ruleTrace.some((item) => item.ruleId === "jain"));
});
test("Vegan, Vegetarian, Dairy-Free, and Egg-Free use existing deterministic rules", () => {
  const cases = [["vegan", "cheese"], ["vegetarian", "chicken"], ["dairy_free", "milk"], ["egg_free", "egg"]];
  cases.forEach(([id, ingredient]) => {
    const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === id).enabled = true; });
    assert.equal(Evidence.evaluateDish(menu([]), dish(ingredient), p).verdict, "AVOID");
  });
});
test("Pescatarian accepts fish but rejects land-animal meat", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "pescatarian").enabled = true; });
  assert.notEqual(Evidence.evaluateDish(menu([]), dish("salmon"), p).verdict, "AVOID");
  assert.equal(Evidence.evaluateDish(menu([]), dish("beef"), p).verdict, "AVOID");
});
test("Gluten-Free wheat conflict is Avoid", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "gluten_free").enabled = true; });
  assert.equal(Evidence.evaluateDish(menu([]), dish("wheat flour"), p).verdict, "AVOID");
});
test("custom avoid restriction creates a traced conflict", () => {
  const p = profile((value) => { value.customRules.push({ id: "msg", label: "MSG", normalizedTerm: "msg", aliases: [], severity: "avoid" }); });
  const result = Evidence.evaluateDish(menu([]), dish("msg"), p);
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.ruleTrace.some((item) => item.ruleId === "msg"));
});
test("menu-supported removal produces Safe with Modification", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "vegan").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("cheese", { modifiers: [{ textOriginal: "Remove cheese" }] }), p);
  assert.equal(result.verdict, "SAFE_WITH_MODIFICATION");
  assert.match(result.suggestedModifications[0].supportingMenuText, /Remove cheese/);
});
test("unsupported modification is never invented", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "vegan").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("cheese"), p);
  assert.equal(result.verdict, "AVOID");
  assert.equal(result.suggestedModifications.length, 0);
});
test("one removable and one unremovable conflict remains Avoid", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "vegan").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("cheese, egg", { modifiers: [{ textOriginal: "Remove cheese" }] }), p);
  assert.equal(result.verdict, "AVOID");
});
test("restaurant Vegan label alone cannot make a dish Safe", () => {
  const result = Evidence.evaluateDish(menu([]), dish("", { dietaryLabels: ["Vegan"] }), profile());
  assert.equal(result.verdict, "NEEDS_CONFIRMATION");
  assert.ok(result.evidence.some((item) => item.source === "restaurant_label" && item.level === "likely"));
});
test("restaurant allergen guide evidence respects the active allergy", () => {
  const p = profile((value) => { value.allergies.push({ id: "milk", label: "Milk", normalizedTerm: "milk", type: "built_in" }); });
  const result = Evidence.evaluateDish(menu([], { allergenNotes: ["Contains milk"] }), dish("sugar"), p);
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.evidence.some((item) => item.source === "restaurant_allergen_guide"));
});
test("structured restaurant ingredient evidence remains separately traceable", () => {
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "vegan").enabled = true; });
  const result = Evidence.evaluateDish(menu([]), dish("sugar"), p, { ingredientList: "milk" });
  assert.equal(result.verdict, "AVOID");
  assert.ok(result.evidence.some((item) => item.source === "restaurant_ingredient_list"));
});
test("cuisine knowledge only increases uncertainty", () => {
  const result = Evidence.evaluateDish(menu([]), dish("wheat noodles", { name: "Ramen" }), profile(), { cuisine: "Japanese" });
  assert.equal(result.verdict, "NEEDS_CONFIRMATION");
  assert.ok(result.evidence.some((item) => item.source === "cuisine_knowledge"));
});
test("strict shared-equipment preference is Avoid and standard is Needs Confirmation", () => {
  const strict = profile((value) => { value.crossContact.sharedEquipment = "avoid"; });
  const standard = profile((value) => { value.crossContact.sharedEquipment = "caution"; });
  const source = menu([], { footnotes: ["Prepared in a shared fryer"] });
  assert.equal(Evidence.evaluateDish(source, dish("potato"), strict).verdict, "AVOID");
  assert.equal(Evidence.evaluateDish(source, dish("potato"), standard).verdict, "NEEDS_CONFIRMATION");
});
test("ignored cross-contact does not alter an otherwise supported result", () => {
  const p = profile((value) => { value.crossContact.sharedEquipment = "ignore"; });
  const result = Evidence.evaluateDish(menu([], { footnotes: ["Prepared on shared equipment"] }), dish("sugar"), p);
  assert.equal(result.verdict, "SAFE");
});
test("extraction warnings prevent Safe", () => {
  const result = Evidence.evaluateDish(menu([]), dish("tomato", { extraction: { method: "ocr", evidenceLevel: "likely", warnings: [{ code: "possible_ocr_error", message: "Word unclear" }] } }), profile());
  assert.equal(result.verdict, "NEEDS_CONFIRMATION");
});
test("every verdict includes summary, evidence, unknowns, modifications, and trace", () => {
  const result = Evidence.evaluateDish(menu([]), dish("pork"), profile((value) => { value.religiousDiets.find((item) => item.id === "halal").enabled = true; }));
  for (const field of ["summary", "evidence", "warnings", "suggestedModifications", "unknowns", "ruleTrace", "evidenceGraph"]) assert.ok(field in result);
  assert.ok(result.evidenceGraph.edges.length);
});
test("report groups dishes into all four required sections", () => {
  global.localStorage = new MemoryStorage();
  const p = profile((value) => { value.lifestyleDiets.find((item) => item.id === "vegan").enabled = true; });
  const source = menu([
    dish("sugar", { id: "safe", name: "Sugar" }),
    dish("cheese", { id: "modify", name: "Cheese removable", modifiers: [{ textOriginal: "Remove cheese" }] }),
    dish("", { id: "unknown", name: "Mystery" }),
    dish("egg", { id: "avoid", name: "Egg" }),
  ]);
  const report = Reports.generate(source, p);
  assert.equal(report.groups.bestChoices.length, 1);
  assert.equal(report.groups.canModify.length, 1);
  assert.equal(report.groups.needsConfirmation.length, 1);
  assert.equal(report.groups.avoid.length, 1);
});
test("report cache avoids repeated evaluation and invalidates on profile update", () => {
  global.localStorage = new MemoryStorage();
  const p = profile(), source = menu([dish("tomato")]);
  assert.equal(Reports.generate(source, p).fromCache, false);
  assert.equal(Reports.generate(source, p).fromCache, true);
  p.updatedAt = "2026-02-01T00:00:00Z";
  assert.equal(Reports.generate(source, p).fromCache, false);
});
test("hundreds of dishes evaluate without changing order", () => {
  global.localStorage = new MemoryStorage();
  const items = Array.from({ length: 400 }, (_, index) => dish("tomato", { id: `d${index}`, name: `Dish ${index}` }));
  const report = Reports.generate(menu(items), profile());
  assert.equal(report.dishes.length, 400);
  assert.equal(report.dishes[399].dishId, "d399");
});
test("report UI uses visible verdict text, Why panels, and no percentages", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-report-ui.js"), "utf8");
  assert.match(source, /Safe with Modification/);
  assert.match(source, /<summary>Why\?<\/summary>/);
  assert.doesNotMatch(source, /\d+%|compatibilityPercent|confidencePercent/);
});
test("restaurant compatibility source contains no Gemini or LLM calls", () => {
  const sources = ["restaurant-modifier-engine.js", "restaurant-evidence-engine.js", "restaurant-compatibility-report.js", "restaurant-report-ui.js"]
    .map((file) => fs.readFileSync(path.join(__dirname, "..", "www", file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /gemini|generativelanguage|openai|fetch\s*\(/i);
});
test("service worker caches all Phase 4D modules", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  for (const file of ["restaurant-modifier-engine.js", "restaurant-evidence-engine.js", "restaurant-compatibility-report.js", "restaurant-report-ui.js"]) assert.match(sw, new RegExp(file.replace(".", "\\.")));
});
