const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const context = {
  console,
  Date,
  Math,
  structuredClone,
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
[
  "www/profile-definitions.js",
  "www/profile.js",
  "www/ingredient-knowledge.js",
  "www/ingredient-parser.js",
  "www/dietary-rules.js",
  "www/evidence-model.js",
  "www/effective-rules.js",
  "www/decision-engine.js",
  "www/resolution-engine.js",
  "www/scan-pipeline.js",
].forEach((file) => vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file }));

const PROFILE = context.ROOTS_PROFILE;
const PIPE = context.ROOTS_SCAN_PIPELINE;

function profileWith(group, id) {
  const profile = PROFILE.createDefaultProfile();
  profile.religiousDiets.forEach((item) => { item.enabled = false; });
  profile.lifestyleDiets.forEach((item) => { item.enabled = false; });
  if (group) profile[group].find((item) => item.id === id).enabled = true;
  return profile;
}

test("barcode evidence preserves identity, raw parentheses, and reaches ROOTS engine", () => {
  const product = { found: true, code: "0123", name: "Cookies", brand: "Example", rawIngredientText: "Chocolate chips (sugar, milk), flour", english: true };
  const scan = PIPE.evaluateSource(PIPE.sourceFromBarcode(product), profileWith("lifestyleDiets", "vegan"));
  assert.equal(scan.product.productName, "Cookies");
  assert.equal(scan.product.brand, "Example");
  assert.equal(scan.product.ingredients[0].subingredients.length, 2);
  assert.equal(scan.evaluation.engineVersion, 2);
  assert.equal(scan.verdict, "AVOID");
  assert.equal(scan.decision.status, "CONFLICT");
  assert.equal(scan.evidence.claims[0].source.tier, "B");
});

test("missing barcode ingredients is insufficient and never safe", () => {
  const scan = PIPE.evaluateSource(PIPE.sourceFromBarcode({ code: "1", name: "Mystery" }), profileWith());
  assert.equal(scan.state, "INSUFFICIENT_DATA");
  assert.equal(scan.verdict, null);
  assert.equal(scan.evaluation, null);
});

test("old cache-shaped products remain readable", () => {
  const source = PIPE.sourceFromBarcode({ code: "1", ingredients: ["Sugar, milk"], english: true, fromCache: true });
  const scan = PIPE.evaluateSource(source, profileWith("lifestyleDiets", "dairy_free"));
  assert.equal(scan.verdict, "AVOID");
  assert.equal(scan.product.sourceMetadata.fromCache, true);
});

test("OCR original, translation, languages, and warnings are preserved", () => {
  const source = PIPE.sourceFromOcr({
    detectedLanguage: "es",
    originalText: "Ingredientes: azúcar, leche",
    translatedText: "Ingredients: sugar, milk",
    ingredientTextOriginal: "azúcar, leche",
    ingredientTextTranslated: "sugar, milk",
    allergenTextOriginal: "Contiene leche",
    allergenTextTranslated: "Contains milk",
    extractionWarnings: [{ code: "translation_uncertain", message: "Check translation" }],
  });
  const scan = PIPE.evaluateSource(source, profileWith("lifestyleDiets", "vegan"));
  assert.equal(scan.product.rawText.original, "Ingredientes: azúcar, leche");
  assert.equal(scan.product.rawText.translated, "Ingredients: sugar, milk");
  assert.equal(scan.product.ingredientText.original, "azúcar, leche");
  assert.equal(scan.product.ingredientText.translated, "sugar, milk");
  assert.equal(scan.product.originalLanguage, "es");
  assert.equal(scan.warnings[0].code, "translation_uncertain");
  assert.equal(scan.verdict, "AVOID");
});

test("empty OCR and parser output are insufficient", () => {
  const scan = PIPE.evaluateSource(PIPE.sourceFromOcr({ ingredientTextOriginal: "" }), profileWith());
  assert.equal(scan.state, "INSUFFICIENT_DATA");
  assert.notEqual(scan.verdict, "SAFE");
  assert.equal(scan.decision.status, "VERIFY");
});

test("a current physical label overrides differing barcode evidence and reports the conflict", () => {
  PIPE.clearCurrent();
  PIPE.evaluateSource(PIPE.sourceFromBarcode({ code: "1", rawIngredientText: "sugar", english: true }), profileWith("lifestyleDiets", "vegan"));
  const labelSource = PIPE.sourceFromOcr({ ingredientTextOriginal: "sugar, milk", ingredientTextTranslated: "sugar, milk" });
  const labelScan = PIPE.evaluateSource(labelSource, profileWith("lifestyleDiets", "vegan"));
  assert.equal(labelScan.verdict, "AVOID");
  assert.ok(labelScan.warnings.some((item) => item.code === "source_conflict"));
  assert.equal(labelScan.product.sourceType, "label_photo");
  assert.equal(labelScan.evidence.claims.find((claim) => claim.source.type === "physical_label").source.tier, "A");
  assert.equal(labelScan.evidence.conflicts.length, 1);
});

test("serious incomplete evidence downgrades an otherwise safe evaluation to caution", () => {
  const scan = PIPE.evaluateSource({
    sourceType: "label_photo",
    ingredientTextOriginal: "sugar",
    warnings: [{ code: "blurry_image", message: "Blurry" }],
  }, profileWith());
  assert.equal(scan.verdict, "CAUTION");
  assert.equal(scan.evaluation.summaryReasons[0].id, "incomplete-evidence");
});

test("an unresolved ingredient cannot produce Safe for an active restricted profile", () => {
  const scan = PIPE.evaluateSource({ sourceType: "barcode", rawIngredientText: "mystery compound xyz" }, profileWith("lifestyleDiets", "vegan"));
  assert.equal(scan.verdict, "CAUTION");
  assert.equal(scan.evaluation.unresolvedItems.length, 1);
});

test("manual edit reparses, reevaluates, and preserves original", () => {
  PIPE.evaluateSource({ sourceType: "label_photo", ingredientTextOriginal: "sugar" }, profileWith("lifestyleDiets", "vegan"));
  const edited = PIPE.editCurrentIngredientText("sugar, milk");
  assert.equal(edited.verdict, "AVOID");
  assert.equal(edited.product.rawText.original, "sugar");
  assert.equal(edited.product.rawText.edited, "sugar, milk");
});

test("restore original removes the edited safety meaning", () => {
  PIPE.evaluateSource({ sourceType: "label_photo", ingredientTextOriginal: "sugar" }, profileWith("lifestyleDiets", "vegan"));
  PIPE.editCurrentIngredientText("sugar, milk");
  const restored = PIPE.restoreCurrentIngredientText();
  assert.equal(restored.verdict, "SAFE");
});

for (const [label, group, id, ingredient, verdict] of [
  ["Jain", "religiousDiets", "jain", "garlic", "AVOID"],
  ["Halal", "religiousDiets", "halal", "pork", "AVOID"],
  ["Kosher", "religiousDiets", "kosher", "shrimp", "AVOID"],
  ["Vegan", "lifestyleDiets", "vegan", "milk", "AVOID"],
]) test(`${label} active profile controls the next scan`, () => {
  const scan = PIPE.evaluateSource({ sourceType: "barcode", rawIngredientText: ingredient }, profileWith(group, id));
  assert.equal(scan.verdict, verdict);
});

test("changing profile changes next result and old snapshot remains stable", () => {
  const source = { sourceType: "barcode", rawIngredientText: "milk" };
  const vegan = PIPE.evaluateSource(source, profileWith("lifestyleDiets", "vegan"));
  const record = PIPE.makeHistoryRecord(vegan);
  const unrestricted = PIPE.evaluateSource(source, profileWith());
  assert.equal(record.evaluation.verdict, "AVOID");
  assert.equal(unrestricted.verdict, "SAFE");
  assert.equal(record.profile.snapshot.lifestyleDiets.find((x) => x.id === "vegan").enabled, true);
});

test("allergy and custom rule use the universal engine", () => {
  const profile = profileWith();
  profile.allergies.push({ id: "milk", label: "Milk", normalizedTerm: "milk", type: "built_in", severity: "standard", customAliases: [] });
  profile.customRules.push({ id: "msg", label: "MSG", normalizedTerm: "msg", severity: "caution", aliases: [] });
  const scan = PIPE.evaluateSource({ sourceType: "barcode", rawIngredientText: "milk, MSG" }, profile);
  assert.equal(scan.verdict, "AVOID");
  assert.equal(scan.evaluation.summaryReasons[0].category, "allergy");
  assert.ok(scan.evaluation.cautionItems.some((item) => item.normalizedName === "msg"));
});

test("preference does not alter verdict", () => {
  const profile = profileWith();
  profile.dislikes.push({ id: "mushroom", label: "Mushrooms", normalizedTerm: "mushrooms" });
  const scan = PIPE.evaluateSource({ sourceType: "barcode", rawIngredientText: "mushrooms" }, profile);
  assert.equal(scan.verdict, "SAFE");
  assert.equal(scan.evaluation.preferenceItems.length, 1);
});

test("history schema preserves product, profile, versions, text, and edit flag", () => {
  const scan = PIPE.evaluateSource({
    sourceType: "label_photo", productName: "Food", brand: "Brand",
    ingredientTextOriginal: "azúcar", ingredientTextTranslated: "sugar", editedText: "sugar, salt",
  }, profileWith());
  const record = PIPE.makeHistoryRecord(scan);
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.product.name, "Food");
  assert.equal(record.profile.snapshot.schemaVersion, 2);
  assert.equal(record.evaluation.engineVersion, 2);
  assert.equal(record.text.original, "azúcar");
  assert.equal(record.text.translated, "sugar");
  assert.equal(record.source.editedByUser, true);
  assert.equal(record.evidence.claims[0].source.type, "physical_label");
  assert.equal(record.decision.status, "MATCH");
});

for (const [legacy, expected] of [["JAIN", "SAFE"], ["NON_JAIN", "AVOID"], ["ALLERGEN", "AVOID"], ["UNCERTAIN", "CAUTION"]]) {
  test(`legacy ${legacy} renders as ${expected}`, () => assert.equal(PIPE.historySummary({ status: legacy }).verdict, expected));
}

test("recheck uses current profile without overwriting the original", () => {
  const first = PIPE.evaluateSource({ sourceType: "barcode", rawIngredientText: "milk" }, profileWith());
  const record = PIPE.makeHistoryRecord(first);
  const before = JSON.stringify(record);
  const rechecked = PIPE.recheck(record, profileWith("lifestyleDiets", "vegan"));
  assert.equal(rechecked.verdict, "AVOID");
  assert.equal(JSON.stringify(record), before);
});

test("Jain search text finds new and legacy profile records", () => {
  for (const label of ["Jain", "Strict Jain", "Custom Jain"]) {
    const text = PIPE.historySearchText({ profileLabel: label, product: { name: "Food" } });
    assert.match(text, /jain/);
  }
});

test("AI context contains current product, verdict, reasons, and non-override rule", () => {
  PIPE.evaluateSource({ sourceType: "barcode", productName: "Milk Bar", rawIngredientText: "milk" }, profileWith("lifestyleDiets", "vegan"));
  const text = PIPE.getAIContext();
  assert.match(text, /Milk Bar/);
  assert.match(text, /Verdict: AVOID/);
  assert.match(text, /Do not override/);
  assert.doesNotMatch(text, /undefined|null/);
});

test("empty current scan produces clean empty AI context", () => {
  PIPE.clearCurrent();
  assert.equal(PIPE.getAIContext(), "");
});

test("malicious external text remains data and is not transformed into executable markup", () => {
  const payload = "<img src=x onerror=alert(1)>";
  const scan = PIPE.evaluateSource({ sourceType: "barcode", productName: payload, brand: payload, rawIngredientText: payload }, profileWith());
  assert.equal(scan.product.productName, payload);
  assert.equal(scan.product.brand, payload);
  assert.equal(scan.product.ingredients[0].rawName, payload);
  const scriptSource = fs.readFileSync("www/script.js", "utf8");
  assert.match(scriptSource, /escapeHtml\(product\.productName/);
  assert.match(scriptSource, /escapeHtml\(item\.displayName/);
  assert.match(scriptSource, /escapeHtml\(product\.brand/);
});

test("production source paths do not call the legacy classifier", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  const activeOcr = script.slice(script.indexOf("async function handleFile"), script.indexOf("// Shared:"));
  const activeBarcode = script.slice(script.indexOf("async function lookupAndShow(code, sessionId, job)"), script.indexOf("/* ----- Live barcode"));
  assert.doesNotMatch(activeOcr, /BIJ_OCR\.scan|classifyIngredient|getLegacyCompatibleProfile/);
  assert.doesNotMatch(activeBarcode, /BIJ_OCR\.analyze|classifyIngredient|getLegacyCompatibleProfile/);
  assert.match(activeOcr, /ROOTS_SCAN_PIPELINE\.evaluateSource/);
  assert.match(activeBarcode, /ROOTS_SCAN_PIPELINE\.evaluateSource/);
  assert.equal((activeOcr.match(/evaluateSource/g) || []).length, 1);
  assert.equal((activeBarcode.match(/evaluateSource/g) || []).length, 1);
});

test("report renderer defines all verdict cards and required section order", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /Yes, this matches your profile/);
  assert.match(script, /Eat with caution/);
  assert.match(script, /No, avoid this product/);
  const report = script.slice(script.indexOf("function displayResult(scan"), script.indexOf("/* ---------- History"));
  const avoidAt = report.indexOf('"Ingredients to Avoid"');
  const cautionAt = report.indexOf('"Eat with Caution"');
  const safeAt = report.indexOf('"Safe Ingredients"');
  const preferenceAt = report.indexOf('"Personal Preferences"');
  assert.ok(avoidAt < cautionAt && cautionAt < safeAt && safeAt < preferenceAt);
  assert.match(report, /renderEvidenceSummary/);
  assert.doesNotMatch(report, /\bconfidence\b|\d+%/i);
});

test("report output escapes names, reasons, evidence, and AI preload inputs", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /escapeHtml\(item\.displayName/);
  assert.match(script, /escapeHtml\(reason\)/);
  assert.match(script, /escapeHtml\(product\.rawText\.original\)/);
  assert.match(script, /input\.value = first/);
  assert.doesNotMatch(script, /\$\{item\.matchedIngredientId\}/);
});
