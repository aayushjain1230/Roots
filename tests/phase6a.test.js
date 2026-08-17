const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(rootDir, "www", file), "utf8");
const storage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => new Map(data),
  };
};
const context = { console, localStorage: storage(), setTimeout, clearTimeout };
context.window = context;
context.globalThis = context;
vm.createContext(context);
[
  "restriction-definitions.js", "restriction-taxonomy.js", "restriction-conflicts.js", "rule-trace.js",
  "profile-definitions.js", "profile.js", "ingredient-knowledge.js", "ingredient-parser.js", "dietary-rules.js",
].forEach((file) => vm.runInContext(read(file), context, { filename: file }));

const R = context.ROOTS_RESTRICTIONS;
const P = context.ROOTS_PROFILE;
const E = context.ROOTS_DIETARY_ENGINE;
const fresh = () => P.createDefaultProfile({ onboardingComplete: true, timestamp: "2026-01-01T00:00:00.000Z" });
const select = (profile, id, settings) => { P.setRestriction(profile, id, true, settings); return profile; };
const one = (name, profile) => E.evaluateIngredient({ name, rawName: name, normalizedName: E.normalizeIngredientText(name).normalizedName, subingredients: [] }, profile);

test("taxonomy has stable categories, unique IDs, valid types, and real rules", () => {
  const categories = R.getCategories();
  const definitions = R.getRestrictions();
  assert.deepEqual(Array.from(categories, (item) => item.sortOrder), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(definitions.map((item) => item.id)).size, definitions.length);
  const categoryIds = new Set(categories.map((item) => item.id));
  definitions.forEach((item) => {
    assert.ok(categoryIds.has(item.categoryId));
    assert.ok(context.ROOTS_RESTRICTION_DEFINITIONS.validTypes.includes(item.type));
    assert.equal(item.ruleVersion, 1);
    assert.ok(item.legacy.group || Object.values(item.rules).flat().length > 0, `${item.id} lacks deterministic behavior`);
  });
});

test("search finds names, aliases, ingredients, regional terms, and related conditions without selecting", () => {
  const profile = fresh();
  assert.equal(R.search("lactose")[0].id, "lactose_intolerance");
  assert.ok(R.search("groundnut").some((item) => item.id === "peanut_allergy"));
  assert.ok(R.search("garlic").some((item) => item.id === "low_fodmap"));
  assert.ok(R.search("IBS").some((item) => item.id === "low_fodmap"));
  assert.ok(R.search("maize").some((item) => item.id === "corn_allergy"));
  assert.equal(profile.restrictions.length, 0);
  assert.equal(R.search("<img onerror=alert(1)>").length, 0);
  R.search("milk");
  assert.equal(R.getSearchIndexBuildCount(), 1);
});

test("major allergy aliases and individual tree nuts are deterministic", () => {
  const cases = [
    ["peanut_allergy", "groundnut"], ["almond_allergy", "almond flour"], ["cashew_allergy", "cashew"],
    ["pistachio_allergy", "pistachio"], ["walnut_allergy", "walnut"], ["pecan_allergy", "pecan"],
    ["hazelnut_allergy", "hazelnut"], ["brazil_nut_allergy", "brazil nut"], ["macadamia_allergy", "macadamia"],
    ["milk_allergy", "caseinate"], ["egg_allergy", "ovalbumin"], ["soy_allergy", "soya"],
    ["wheat_allergy", "durum"], ["sesame_allergy", "tahini"], ["mustard_allergy", "mustard flour"],
    ["celery_allergy", "celeriac"], ["lupin_allergy", "lupin flour"], ["fish_allergy", "anchovy"],
    ["shellfish_allergy", "prawn"], ["mollusk_allergy", "scallop"],
  ];
  cases.forEach(([id, ingredient]) => assert.equal(one(ingredient, select(fresh(), id)).status, "AVOID", `${id}: ${ingredient}`));
});

test("tree nut group supports individual selection and legacy all-tree-nut behavior", () => {
  const selected = select(fresh(), "tree_nut_allergy_group", { selectedTreeNuts: ["cashew"] });
  assert.equal(one("cashew", selected).status, "AVOID");
  assert.equal(one("walnut", selected).status, "SAFE");
  const legacy = fresh();
  legacy.allergies.push({ id: "tree_nut", label: "Tree Nuts", type: "built_in" });
  assert.ok(R.getSelected(legacy).some((item) => item.id === "tree_nut_allergy_group"));
});

test("new allergies honor contains and cross-contact configuration", () => {
  const profile = select(fresh(), "mustard_allergy");
  const parsed = E.parseIngredientText("rice. May contain mustard.");
  assert.equal(E.evaluateParsedProduct(parsed, profile, { evaluatedAt: "fixed" }).verdict, "CAUTION");
  P.applyCrossContactPreset(profile, "strict");
  assert.equal(E.evaluateParsedProduct(parsed, profile, { evaluatedAt: "fixed" }).verdict, "AVOID");
});

test("Celiac Disease remains distinct and handles grains, oats, source, and certification uncertainty", () => {
  const celiac = select(fresh(), "celiac_disease", { avoidOatsUnlessCertified: true, requireCertifiedGlutenFree: true });
  ["wheat", "barley", "rye", "malt", "spelt", "semolina", "durum", "triticale"].forEach((item) => assert.equal(one(item, celiac).status, "AVOID"));
  assert.equal(one("oats", celiac).status, "CAUTION");
  assert.equal(one("modified food starch", celiac).status, "CAUTION");
  assert.equal(one("rice", celiac).status, "SAFE");
  assert.notEqual(R.getRestriction("celiac_disease").id, R.getRestriction("gluten_sensitivity").id);
});

test("Gluten Sensitivity does not diagnose Celiac Disease", () => {
  const profile = select(fresh(), "gluten_sensitivity");
  assert.equal(one("wheat", profile).status, "AVOID");
  assert.equal(R.getSelected(profile).some((item) => item.id === "celiac_disease"), false);
});

test("Low FODMAP is quantity-sensitive and preserves multiple trigger reasons", () => {
  const profile = select(fresh(), "low_fodmap", { mode: "elimination" });
  ["onion", "garlic", "inulin", "chicory root", "sorbitol", "mannitol", "xylitol", "maltitol"].forEach((item) => {
    const result = one(item, profile);
    assert.equal(result.status, "CAUTION");
    assert.equal(result.reasons[0].evidenceType, "quantity_dependent");
  });
  assert.equal(R.getRestriction("low_fodmap").quantitySensitive, true);
});

test("Low Histamine uses cautious wording rather than confirmed medical claims", () => {
  const result = one("aged cheese", select(fresh(), "low_histamine"));
  assert.equal(result.status, "CAUTION");
  assert.match(result.reasons[0].label, /possible trigger|individual/i);
});

test("Alpha-Gal handles mammalian ingredients and source uncertainty without flagging carrageenan", () => {
  const profile = select(fresh(), "alpha_gal_syndrome");
  assert.equal(one("beef", profile).status, "AVOID");
  assert.equal(one("gelatin", profile).status, "AVOID");
  assert.equal(one("glycerin", profile).status, "CAUTION");
  assert.equal(one("carrageenan", profile).status, "SAFE");
  assert.equal(one("milk", profile).status, "SAFE");
  P.setRestriction(profile, "alpha_gal_syndrome", true, { avoidDairy: true });
  assert.equal(one("milk", profile).status, "AVOID");
});

test("Milk Allergy and Lactose Intolerance remain separate and quantity-aware", () => {
  assert.equal(one("whey", select(fresh(), "milk_allergy")).status, "AVOID");
  const lactose = select(fresh(), "lactose_intolerance");
  assert.equal(one("milk", lactose).status, "CAUTION");
  assert.equal(one("lactose-free milk", lactose).status, "SAFE");
  assert.equal(R.getSelected(lactose).some((item) => item.id === "milk_allergy"), false);
});

test("Oral Allergy Syndrome depends on preparation", () => {
  const profile = select(fresh(), "oral_allergy_syndrome", { rawOnly: true });
  assert.equal(one("raw apple", profile).status, "CAUTION");
  assert.equal(one("cooked apple", profile).status, "SAFE");
});

test("Corn derivatives preserve source uncertainty", () => {
  const profile = select(fresh(), "corn_allergy");
  assert.equal(one("maize", profile).status, "AVOID");
  assert.equal(one("maltodextrin", profile).status, "CAUTION");
  assert.equal(one("citric acid", profile).status, "CAUTION");
});

test("medical and sensitivity rules avoid diagnosis language and preserve quantity uncertainty", () => {
  const sodium = one("sodium", select(fresh(), "low_sodium"));
  assert.equal(sodium.status, "CAUTION");
  assert.equal(sodium.reasons[0].evidenceType, "quantity_dependent");
  assert.equal(one("aspartame", select(fresh(), "phenylketonuria")).status, "AVOID");
  assert.equal(one("sodium metabisulfite", select(fresh(), "sulfite_sensitivity")).status, "CAUTION");
  assert.doesNotMatch(JSON.stringify(context.ROOTS_RESTRICTION_DEFINITIONS), /diagnos(?:e|is)|treatment plan/i);
});

test("Celiac oat and certification settings preserve uncertainty without false safety", () => {
  const profile = select(fresh(), "celiac_disease", { requireCertifiedGlutenFree: true, avoidOatsUnlessCertified: true });
  assert.equal(one("oats", profile).status, "CAUTION");
  assert.equal(one("certified gluten-free oats", profile).status, "SAFE");
  const uncertified = E.evaluateParsedProduct({ ingredients: [{ name: "rice" }], certifications: [] }, profile);
  assert.equal(uncertified.verdict, "CAUTION");
  assert.ok(uncertified.summaryReasons.some((item) => item.evidenceType === "certification"));
  const certified = E.evaluateParsedProduct({ ingredients: [{ name: "rice" }], certifications: ["GFCO Gluten-Free"] }, profile);
  assert.equal(certified.verdict, "SAFE");
});

test("Low Sodium applies the configured nutrition threshold and propagates missing evidence", () => {
  const profile = select(fresh(), "low_sodium", { maxMgPerServing: 140 });
  assert.equal(E.evaluateParsedProduct({ ingredients: [{ name: "rice" }], nutrition: { sodiumMgPerServing: 80 } }, profile).verdict, "SAFE");
  assert.equal(E.evaluateParsedProduct({ ingredients: [{ name: "rice" }], nutrition: { sodiumMgPerServing: 220 } }, profile).verdict, "AVOID");
  const missing = E.evaluateParsedProduct({ ingredients: [{ name: "rice" }] }, profile);
  assert.equal(missing.verdict, "CAUTION");
  assert.ok(missing.summaryReasons.some((item) => item.evidenceType === "nutrition_quantity"));
});

test("Gluten Sensitivity respects the user oat setting separately from Celiac Disease", () => {
  assert.equal(one("oats", select(fresh(), "gluten_sensitivity", { oatsAllowed: true })).status, "SAFE");
  assert.equal(one("oats", select(fresh(), "gluten_sensitivity", { oatsAllowed: false })).status, "CAUTION");
});

test("preferences remain lower priority and are never presented as allergies", () => {
  const profile = select(fresh(), "avoid_msg");
  const result = one("MSG", profile);
  assert.equal(result.status, "PREFERENCE");
  assert.equal(result.reasons[0].category, "preference");
  assert.equal(result.reasons[0].restrictionType, "preference");
});

test("overlapping restrictions are preserved and conflicts are explicit", () => {
  const profile = select(select(fresh(), "milk_allergy"), "lactose_intolerance");
  const result = one("milk", profile);
  assert.equal(result.status, "AVOID");
  assert.ok(result.reasons.some((item) => item.profileRuleId === "milk_allergy"));
  assert.ok(result.reasons.some((item) => item.profileRuleId === "lactose_intolerance"));
  const conflicts = context.ROOTS_RESTRICTION_CONFLICTS.detectConflicts(profile);
  assert.equal(conflicts[0].resolution, "preserve_both");
});

test("Phase 6B handoff retains uncertainty, settings, aliases, and deterministic trace", () => {
  const profile = select(fresh(), "low_fodmap", { mode: "personalized" });
  const result = one("garlic", profile);
  const handoff = result.phase6Handoff;
  ["ingredientName", "canonicalIngredientId", "originalLabelTerm", "verdict", "activeRestrictionConflicts", "aliases", "confirmedEvidence", "sourceUncertainty", "quantityUncertainty", "preparationUncertainty", "crossContactEvidence", "certificationEvidence", "ruleTrace", "userSettings", "regionalContext", "suggestedVerificationQuestions", "engineVersion"].forEach((key) => assert.ok(key in handoff));
  assert.equal(handoff.ruleTrace[0].restrictionId, "low_fodmap");
  assert.equal(handoff.quantityUncertainty.length, 1);
});

test("profile validation preserves legacy fields and safely normalizes restriction selections", () => {
  const profile = fresh();
  profile.religiousDiets.find((item) => item.id === "jain").enabled = true;
  profile.lifestyleDiets.find((item) => item.id === "dairy_free").enabled = true;
  profile.lifestyleDiets.find((item) => item.id === "gluten_free").enabled = true;
  profile.restrictions = [{ id: "low_fodmap", enabled: true, settings: { mode: "reintroduction" } }, { id: "unsupported", enabled: true }];
  const checked = P.validateProfile(profile);
  assert.equal(checked.profile.religiousDiets.find((item) => item.id === "jain").enabled, true);
  assert.equal(checked.profile.lifestyleDiets.find((item) => item.id === "dairy_free").enabled, true);
  assert.equal(checked.profile.lifestyleDiets.find((item) => item.id === "gluten_free").enabled, true);
  assert.deepEqual(Array.from(checked.profile.restrictions, (item) => item.id), ["low_fodmap"]);
  assert.equal(R.getSelected(checked.profile).some((item) => item.id === "milk_allergy"), false);
  assert.equal(R.getSelected(checked.profile).some((item) => item.id === "celiac_disease"), false);
});

test("Phase 6A migration creates a backup and is idempotent without rewriting saved data", () => {
  const local = storage();
  const migrationContext = { console, localStorage: local };
  migrationContext.window = migrationContext;
  migrationContext.globalThis = migrationContext;
  vm.createContext(migrationContext);
  ["restriction-definitions.js", "restriction-taxonomy.js", "profile-definitions.js", "profile.js"].forEach((file) => vm.runInContext(read(file), migrationContext));
  const original = migrationContext.ROOTS_PROFILE.createDefaultProfile({ onboardingComplete: true, timestamp: "fixed" });
  local.setItem(migrationContext.ROOTS_PROFILE.keys.profile, JSON.stringify(original));
  local.setItem("roots-saved-products-v1", "[{\"id\":\"saved\"}]");
  migrationContext.ROOTS_PROFILE.getActiveProfile();
  const firstBackup = local.getItem(migrationContext.ROOTS_PROFILE.keys.restrictionBackup);
  migrationContext.ROOTS_PROFILE.getActiveProfile();
  assert.equal(local.getItem(migrationContext.ROOTS_PROFILE.keys.restrictionBackup), firstBackup);
  assert.equal(local.getItem("roots-saved-products-v1"), "[{\"id\":\"saved\"}]");
});

test("profile editor is category-first, searchable, accessible, and does not render the full taxonomy initially", () => {
  const html = read("index.html");
  const editor = read("profile-editor.js");
  const css = read("design-system.css");
  assert.match(html, /id="restrictionEditorModal"[\s\S]*aria-modal="true"/);
  assert.match(editor, /Search restrictions/);
  assert.match(editor, /restriction-categories/);
  assert.match(editor, /Selected/);
  assert.match(editor, /aria-pressed/);
  assert.match(editor, /title\.focus\(\)/);
  assert.match(editor, /R\.getRestrictions\(categoryId\)/);
  assert.doesNotMatch(html, /Peanut Allergy[\s\S]*Low FODMAP[\s\S]*Alpha-Gal Syndrome/);
  assert.match(css, /\.restriction-row[\s\S]*min-height:\s*68px/);
});

test("service worker caches Phase 6A static modules and never profile records", () => {
  const sw = read("sw.js");
  ["restriction-definitions.js", "restriction-taxonomy.js", "restriction-conflicts.js", "rule-trace.js", "profile-editor.js"].forEach((file) => assert.match(sw, new RegExp(file.replace(".", "\\."))));
  assert.match(sw, /roots-shell-v6a-1/);
  assert.doesNotMatch(sw, /roots-profile-v1/);
});
