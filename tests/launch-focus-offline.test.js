"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(rootDir, "www", file), "utf8");
const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
};
function contextFor(files, extra = {}) {
  const context = { console, localStorage: storage(), setTimeout, clearTimeout, Date, ...extra };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return context;
}
const engineFiles = [
  "dietary-feature-availability.js", "restriction-definitions.js", "restriction-taxonomy.js",
  "profile-definitions.js", "profile.js", "ingredient-knowledge.js", "ingredient-parser.js", "dietary-rules.js",
];

test("launch policy activates Jain, Big 9 allergens, and custom avoids only", () => {
  const context = contextFor(engineFiles);
  const F = context.ROOTS_DIETARY_FEATURES;
  ["jain", "peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame", "custom_avoid"]
    .forEach((id) => assert.equal(F.isAvailable(id), true, id));
  ["halal", "kosher", "vegan", "vegetarian", "pescatarian", "hindu_vegetarian", "celiac_disease"]
    .forEach((id) => assert.equal(F.isAvailable(id), false, id));
  const selectable = context.ROOTS_RESTRICTIONS.getSelectableRestrictions().map((item) => item.id);
  assert.ok(selectable.includes("jain"));
  assert.ok(selectable.includes("peanut_allergy"));
  assert.ok(!selectable.includes("vegetarian"));
  assert.ok(!selectable.includes("halal"));
});

test("future rollout toggles are centralized and stored selections are not mutated", () => {
  const context = contextFor(engineFiles);
  const F = context.ROOTS_DIETARY_FEATURES;
  const stored = context.ROOTS_PROFILE.createDefaultProfile({ onboardingComplete: true });
  context.ROOTS_PROFILE.setDietSelection(stored, "religious", "halal", true);
  context.ROOTS_PROFILE.setDietSelection(stored, "lifestyle", "vegetarian", true);
  const projected = F.projectProfile(stored);
  assert.equal(stored.religiousDiets.find((item) => item.id === "halal").enabled, true);
  assert.equal(stored.lifestyleDiets.find((item) => item.id === "vegetarian").enabled, true);
  assert.equal(projected.religiousDiets.find((item) => item.id === "halal").enabled, false);
  assert.equal(projected.lifestyleDiets.find((item) => item.id === "vegetarian").enabled, false);
  assert.equal(F.createPolicy({ halal: true }).projectProfile(stored).religiousDiets.find((item) => item.id === "halal").enabled, true);
});

test("Jain and multiple allergies retain independent deterministic conflicts", () => {
  const context = contextFor(engineFiles);
  const profile = context.ROOTS_PROFILE.createDefaultProfile({ onboardingComplete: true });
  context.ROOTS_PROFILE.setDietSelection(profile, "religious", "jain", true);
  profile.allergies = ["peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"].map((id) => ({ id, type: "built_in", label: id, severity: "standard", customAliases: [] }));
  const parsed = context.ROOTS_DIETARY_ENGINE.parseIngredientText("onion, peanut flour, cashew, whey, egg, wheat flour, soy lecithin, anchovy, shrimp, sesame");
  const result = context.ROOTS_DIETARY_ENGINE.evaluateParsedProduct(parsed, context.ROOTS_DIETARY_FEATURES.projectProfile(profile));
  assert.equal(result.verdict, "AVOID");
  const labels = result.avoidItems.flatMap((item) => item.reasons.map((reason) => reason.label.toLowerCase())).join(" ");
  ["jain", "peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"].forEach((term) => assert.match(labels, new RegExp(term)));
});

test("offline device OCR preserves raw label evidence and its limitation", async () => {
  const context = contextFor(["connectivity.js", "ocr.js"], {
    ROOTS_LOCAL_OCR_PROVIDER: { async extractText() { return { text: "Ingredients: peanul oil, onion powder" }; } },
    ROOTS_NETWORK: {}, FormData: class FormData {}, fetch: async () => { throw new Error("network should not run"); },
  });
  context.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  const result = await context.BIJ_OCR.extractLabel({}, () => {});
  assert.equal(result.offline, true);
  assert.equal(result.verificationScope, "scanned_label_only");
  assert.match(result.originalText, /peanul oil/);
  assert.equal(result.extractionProvider, "local_device_ocr");
});

test("low-confidence local OCR remains review-required evidence", async () => {
  const context = contextFor(["connectivity.js", "ocr.js"], {
    ROOTS_LOCAL_OCR_PROVIDER: { async extractText() { return { segments: [{ text: "Ingredients: peanut", confidence: 0.42 }] }; } },
    ROOTS_NETWORK: {}, FormData: class FormData {}, fetch: async () => { throw new Error("network should not run"); },
  });
  context.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  const result = await context.BIJ_OCR.extractLabel({}, () => {});
  assert.ok(result.extractionWarnings.some((warning) => warning.code === "low_ocr_quality"));
});

test("online label scans do not get trapped by an advertised but empty local OCR API", async () => {
  let localCalls = 0, cloudCalls = 0;
  class TestFormData { append() {} get() { return { size: 1200 }; } }
  const context = contextFor(["connectivity.js", "ocr.js"], {
    location: { hostname: "127.0.0.1" },
    ROOTS_RUNTIME_CONFIG: { API_BASE_URL: "http://127.0.0.1:8000" },
    ROOTS_LOCAL_OCR_PROVIDER: { async extractText() { localCalls += 1; return { text: "" }; } },
    ROOTS_NETWORK: { async request() { cloudCalls += 1; return { ok: true, status: 200, data: {
      is_valid: true, detected_language: "en", original_text: "Ingredients: sugar, garlic",
      translated_text: "", ingredient_text_original: "sugar, garlic", ingredient_text_translated: "",
      allergen_text_original: "", allergen_text_translated: "", product_name: "", brand: "", warnings: [],
    } }; } },
    FormData: TestFormData,
  });
  context.ROOTS_CONNECTIVITY.setForTesting("ONLINE");
  const result = await context.BIJ_OCR.extractLabel({ size: 1200, type: "image/jpeg" }, () => {});
  assert.equal(localCalls, 0, "experimental local OCR must not replace the working online provider by default");
  assert.equal(cloudCalls, 1);
  assert.equal(result.ingredientTextOriginal, "sugar, garlic");
});

test("explicit online local-first OCR falls back to cloud when local detection is empty", async () => {
  let cloudCalls = 0;
  class TestFormData { append() {} get() { return { size: 1201 }; } }
  const context = contextFor(["connectivity.js", "ocr.js"], {
    location: { hostname: "127.0.0.1" },
    ROOTS_RUNTIME_CONFIG: { API_BASE_URL: "http://127.0.0.1:8000" },
    ROOTS_LOCAL_OCR_PROVIDER: { async extractText() { return { text: "" }; } },
    ROOTS_NETWORK: { async request() { cloudCalls += 1; return { ok: true, status: 200, data: {
      is_valid: true, detected_language: "en", original_text: "Ingredients: peanut",
      translated_text: "", ingredient_text_original: "peanut", ingredient_text_translated: "",
      allergen_text_original: "", allergen_text_translated: "", product_name: "", brand: "", warnings: [],
    } }; } },
    FormData: TestFormData,
  });
  context.ROOTS_CONNECTIVITY.setForTesting("ONLINE");
  const result = await context.BIJ_OCR.extractLabel({ size: 1201, type: "image/jpeg" }, () => {}, { preferLocal: true });
  assert.equal(cloudCalls, 1);
  assert.equal(result.ingredientTextOriginal, "peanut");
});

test("home period boundaries, camera entry, routes, and offline assets are wired", () => {
  const script = read("script.js"), html = read("index.html"), sw = read("sw.js");
  assert.match(script, /hour >= 5 && hour < 11/);
  assert.match(script, /hour >= 11 && hour < 17/);
  assert.match(script, /if \(hour < 5\) next\.setHours\(5, 0, 0, 0\)/);
  assert.match(script, /next\.setHours\(11, 0, 0, 0\)/);
  assert.match(script, /next\.setHours\(17, 0, 0, 0\)/);
  assert.match(html, /id="info-btn"/);
  assert.match(html, /id="settings-btn"/);
  assert.match(html, /id="scan-entry-btn"[\s\S]*?<circle cx="12" cy="13\.5" r="3\.2"/);
  assert.match(sw, /dietary-feature-availability\.js/);
  assert.match(sw, /connectivity\.js/);
  assert.match(sw, /roots-shell-release-v19/);
});

test("connectivity is centralized and offline barcode recovery is explicit", () => {
  const sources = fs.readdirSync(path.join(rootDir, "www")).filter((file) => file.endsWith(".js"));
  const directChecks = sources.filter((file) => file !== "connectivity.js" && /navigator\?*\.onLine|navigator\.onLine/.test(read(file)));
  assert.deepEqual(directChecks, []);
  assert.match(read("foodfacts.js"), /BARCODE_OFFLINE_MISS/);
  assert.match(read("scan-processing.js"), /Scan the ingredient label instead/);
  assert.match(read("report-view.js"), /Offline label check/);
});

test("direct file launches move to the local server before loading PWA resources", () => {
  const html = read("index.html"), guard = read("protocol-guard.js"), sw = read("sw.js");
  assert.ok(html.indexOf('src="protocol-guard.js"') < html.indexOf('rel="manifest"'));
  assert.match(guard, /location\?\.protocol !== "file:"/);
  assert.match(guard, /location\.replace\(target\)/);
  assert.match(sw, /protocol-guard\.js/);
});

test("modal closing moves focus before applying inert and aria-hidden", () => {
  const script = read("script.js");
  const close = script.slice(script.indexOf("function closeModal"), script.indexOf("const ingredientReviewModal"));
  assert.ok(close.indexOf("returnFocus.focus()") < close.indexOf('m.setAttribute("inert", "")'));
  assert.ok(close.indexOf('m.setAttribute("inert", "")') < close.indexOf('m.setAttribute("aria-hidden", "true")'));
  assert.match(script, /const modalReturnFocus = new WeakMap\(\)/);
});
