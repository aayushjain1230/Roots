"use strict";

const PROFILE_IDS = Object.freeze({
  vegetarian: "qa-profile-a-vegetarian",
  jain: "qa-profile-b-jain",
  jainCustom: "qa-profile-c-jain-custom",
  halal: "qa-profile-d-halal",
  kosher: "qa-profile-e-kosher",
  veganAllergy: "qa-profile-f-vegan-allergy",
  glutenDairyFree: "qa-profile-g-gluten-dairy-free",
  complex: "qa-profile-h-complex",
});

function profiles(P) {
  const base = (id) => {
    const profile = P.createDefaultProfile({
      name: id, onboardingComplete: true, timestamp: "2026-01-01T00:00:00.000Z",
    });
    profile.id = id;
    return profile;
  };
  const enable = (profile, group, id) => {
    profile[group].find((item) => item.id === id).enabled = true;
    return profile;
  };
  const values = {};
  values.vegetarian = enable(base(PROFILE_IDS.vegetarian), "lifestyleDiets", "vegetarian");
  values.jain = enable(base(PROFILE_IDS.jain), "religiousDiets", "jain");
  const custom = enable(base(PROFILE_IDS.jainCustom), "religiousDiets", "jain");
  Object.assign(custom.religiousDiets.find((item) => item.id === "jain").options, {
    avoidOnionGarlic: true, avoidAllRootVegetables: false, avoidMushrooms: true,
    avoidHoney: true, avoidFermentedIngredients: false,
  });
  values.jainCustom = custom;
  values.halal = enable(base(PROFILE_IDS.halal), "religiousDiets", "halal");
  values.kosher = enable(base(PROFILE_IDS.kosher), "religiousDiets", "kosher");
  const veganAllergy = enable(base(PROFILE_IDS.veganAllergy), "lifestyleDiets", "vegan");
  veganAllergy.allergies = [
    { id: "peanut", label: "Peanuts", type: "built_in" },
    { id: "sesame", label: "Sesame", type: "built_in" },
  ];
  P.applyCrossContactPreset(veganAllergy, "strict");
  values.veganAllergy = veganAllergy;
  const glutenDairy = enable(base(PROFILE_IDS.glutenDairyFree), "lifestyleDiets", "gluten_free");
  enable(glutenDairy, "lifestyleDiets", "dairy_free");
  values.glutenDairyFree = glutenDairy;
  const complex = enable(base(PROFILE_IDS.complex), "religiousDiets", "jain");
  enable(complex, "lifestyleDiets", "vegan");
  enable(complex, "lifestyleDiets", "gluten_free");
  complex.allergies = [{ id: "peanut", label: "Peanuts", type: "built_in" }];
  complex.customRules = [{ id: "qa-msg", label: "MSG", normalizedTerm: "msg", severity: "avoid", aliases: [] }];
  P.applyCrossContactPreset(complex, "strict");
  values.complex = complex;
  return values;
}

const PRODUCTS = Object.freeze([
  { id: "safe-rice", label: "Clearly Safe", text: "rice, salt", expected: { vegetarian: "SAFE", jain: "SAFE", veganAllergy: "SAFE", glutenDairyFree: "SAFE" } },
  { id: "avoid-meat", label: "Clearly Avoid", text: "rice, chicken", expected: { vegetarian: "AVOID", jain: "AVOID", halal: "CAUTION", kosher: "CAUTION", complex: "AVOID" } },
  { id: "caution-additive", label: "One Caution", text: "rice, natural flavors", expected: { halal: "CAUTION", veganAllergy: "CAUTION", complex: "CAUTION" } },
  { id: "ambiguous", label: "Ambiguous Additive", text: "mono and diglycerides", expected: { veganAllergy: "CAUTION", complex: "CAUTION" } },
  { id: "nested", label: "Nested", text: "chocolate chips (sugar, cocoa butter, milk), rice flour", expected: { veganAllergy: "AVOID", glutenDairyFree: "AVOID", complex: "AVOID" } },
  { id: "parenthetical", label: "Parenthetical", text: "seasoning (cumin, pepper, salt), rice", expected: { vegetarian: "SAFE" } },
  { id: "malformed-punctuation", label: "Malformed OCR", text: "Ingredients:: rice;;; salt... cocoa...", expected: { vegetarian: "SAFE" } },
  { id: "multiple-allergens", label: "Multiple Allergens", text: "rice. Contains: peanut, sesame, milk.", expected: { veganAllergy: "AVOID", complex: "AVOID" } },
  { id: "may-contain", label: "May Contain", text: "rice. May contain peanut.", expected: { veganAllergy: "AVOID", complex: "AVOID" } },
  { id: "shared-facility", label: "Shared Facility", text: "rice. Manufactured in a facility that also handles peanut.", expected: { veganAllergy: "CAUTION", complex: "CAUTION" } },
  { id: "roots", label: "Root Vegetables", text: "potato, carrot", expected: { jain: "AVOID", jainCustom: "SAFE", complex: "AVOID" } },
  { id: "onion-garlic", label: "Onion Garlic", text: "onion, garlic", expected: { jain: "AVOID", jainCustom: "AVOID", complex: "AVOID" } },
  { id: "egg", label: "Egg", text: "egg", expected: { jain: "AVOID", veganAllergy: "AVOID", complex: "AVOID" } },
  { id: "honey", label: "Honey", text: "honey", expected: { jain: "AVOID", jainCustom: "AVOID", veganAllergy: "AVOID", complex: "AVOID" } },
  { id: "gelatin", label: "Gelatin", text: "gelatin", expected: { vegetarian: "AVOID", halal: "CAUTION", kosher: "CAUTION", veganAllergy: "AVOID", complex: "AVOID" } },
  { id: "alcohol", label: "Alcohol", text: "wine", expected: { halal: "AVOID" } },
  { id: "artificial", label: "Artificial Additive", text: "artificial color", expected: { jain: "SAFE", complex: "SAFE" } },
  { id: "natural-flavors", label: "Unknown Natural Flavors", text: "natural flavors", expected: { halal: "CAUTION", veganAllergy: "CAUTION", complex: "CAUTION" } },
  { id: "no-data", label: "No Ingredient Data", text: "", insufficient: true },
  { id: "not-found", label: "Open Food Facts Not Found", barcode: { found: false, code: "0000000000000" }, insufficient: true },
  { id: "stale-cache", label: "Stale Cached Product", text: "rice, salt", metadata: { fromCache: true, stale: true } },
  { id: "user-corrected", label: "User Corrected", original: "rice, salt", text: "rice, milk", expected: { veganAllergy: "AVOID", glutenDairyFree: "AVOID", complex: "AVOID" } },
]);

const RESTAURANTS = Object.freeze([
  { id: "qa-restaurant-strong", name: "Evidence Kitchen", distanceMeters: 1200, menuSource: "official_structured", freshness: "current" },
  { id: "qa-restaurant-unknown", name: "Unknown Cafe", distanceMeters: 500, menuSource: "ocr", freshness: "unknown" },
  { id: "qa-restaurant-stale", name: "Old Menu Grill", distanceMeters: 800, menuSource: "official_pdf", freshness: "stale" },
]);

module.exports = { PROFILE_IDS, profiles, PRODUCTS, RESTAURANTS };
