"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

class Storage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
global.localStorage = new Storage();
for (const file of ["profile-definitions.js", "profile.js", "ingredient-knowledge.js", "ingredient-parser.js", "dietary-rules.js", "scan-pipeline.js"]) {
  require(path.join(__dirname, "..", "www", file));
}
const P = global.ROOTS_PROFILE;
const E = global.ROOTS_DIETARY_ENGINE;
const PIPE = global.ROOTS_SCAN_PIPELINE;
const FIX = require("./fixtures/qa-fixtures.js");

test("eight fixed release-candidate profiles are valid and uniquely identified", () => {
  const profiles = FIX.profiles(P);
  assert.equal(Object.keys(profiles).length, 8);
  assert.equal(new Set(Object.values(profiles).map((item) => item.id)).size, 8);
  Object.values(profiles).forEach((profile) => assert.equal(P.validateProfile(profile).valid, true));
});

test("every product fixture evaluates under every profile without an undefined verdict", () => {
  const profiles = FIX.profiles(P);
  for (const product of FIX.PRODUCTS) {
    for (const profile of Object.values(profiles)) {
      const source = product.barcode
        ? PIPE.sourceFromBarcode(product.barcode)
        : PIPE.sourceFromBarcode({ found: true, code: product.id, rawIngredientText: product.text, english: true, ...(product.metadata || {}) });
      const result = PIPE.evaluateSource(source, profile);
      if (product.insufficient) {
        assert.equal(result.state, "INSUFFICIENT_DATA", `${product.id}/${profile.id}`);
        assert.equal(result.verdict, null, `${product.id}/${profile.id}`);
      } else {
        assert.ok(["SAFE", "CAUTION", "AVOID"].includes(result.verdict), `${product.id}/${profile.id}`);
        assert.ok(result.evaluation?.engineVersion, `${product.id}/${profile.id}`);
      }
    }
  }
});

test("documented product expectations remain fixed", () => {
  const profiles = FIX.profiles(P);
  for (const product of FIX.PRODUCTS) {
    for (const [profileName, expected] of Object.entries(product.expected || {})) {
      const result = E.evaluateParsedProduct(E.parseIngredientText(product.text), profiles[profileName], { evaluatedAt: "2026-01-01T00:00:00Z" });
      assert.equal(result.verdict, expected, `${product.id}/${profileName}`);
    }
  }
});

test("allergy evidence takes precedence across direct and cross-contact fixtures", () => {
  const profile = FIX.profiles(P).veganAllergy;
  const direct = E.evaluateParsedProduct(E.parseIngredientText("rice. Contains: peanut."), profile, { evaluatedAt: "fixed" });
  const may = E.evaluateParsedProduct(E.parseIngredientText("rice. May contain sesame."), profile, { evaluatedAt: "fixed" });
  const shared = E.evaluateParsedProduct(E.parseIngredientText("rice. Manufactured in a facility that also handles peanut."), profile, { evaluatedAt: "fixed" });
  assert.equal(direct.verdict, "AVOID");
  assert.equal(may.verdict, "AVOID");
  assert.equal(shared.verdict, "CAUTION");
  assert.ok(direct.allergenEvidence.length > 0);
});

test("user correction preserves old evidence and reevaluates only the current scan", () => {
  const profile = P.createDefaultProfile({ onboardingComplete: true });
  profile.lifestyleDiets.find((item) => item.id === "vegan").enabled = true;
  PIPE.clearCurrent();
  const original = PIPE.evaluateSource({ sourceType: "label_photo", ingredientTextOriginal: "rice, salt" }, profile);
  const oldSnapshot = structuredClone(original);
  const edited = PIPE.editCurrentIngredientText("rice, milk");
  assert.equal(oldSnapshot.verdict, "CAUTION");
  assert.equal(edited.verdict, "AVOID");
  assert.equal(edited.product.rawText.original, "rice, salt");
});

test("fixture catalog covers mandated product and restaurant edge classes", () => {
  assert.ok(FIX.PRODUCTS.length >= 20);
  assert.equal(new Set(FIX.PRODUCTS.map((item) => item.id)).size, FIX.PRODUCTS.length);
  assert.ok(FIX.RESTAURANTS.some((item) => item.freshness === "current"));
  assert.ok(FIX.RESTAURANTS.some((item) => item.freshness === "stale"));
  assert.ok(FIX.RESTAURANTS.some((item) => item.menuSource === "ocr"));
});

test("ten sequential scans retain one current session without mutating prior snapshots", () => {
  const profile = FIX.profiles(P).complex;
  const snapshots = [];
  PIPE.clearCurrent();
  for (let index = 0; index < 10; index += 1) {
    const result = PIPE.evaluateSource(PIPE.sourceFromBarcode({
      found: true, code: `qa-sequence-${index}`, rawIngredientText: index % 2 ? "rice, salt" : "rice, peanut", english: true,
    }), profile);
    snapshots.push(structuredClone(result));
  }
  assert.equal(PIPE.getCurrent().product.barcode, "qa-sequence-9");
  assert.equal(snapshots.length, 10);
  assert.equal(snapshots[0].product.barcode, "qa-sequence-0");
  assert.equal(snapshots[0].verdict, "AVOID");
});
