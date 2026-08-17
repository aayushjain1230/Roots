(function (root) {
  "use strict";

  const JAIN_DEFAULTS = Object.freeze({
    avoidMeatFishSeafood: true,
    avoidEggs: true,
    avoidOnionGarlic: true,
    avoidAllRootVegetables: true,
    avoidHoney: true,
    avoidAnimalDerivedAdditives: true,
    avoidFermentedIngredients: false,
    avoidMushrooms: false,
    avoidArtificialAdditives: false,
  });

  const RELIGIOUS_DIETS = Object.freeze([
    { id: "jain", label: "Jain", description: "Jain practices vary. Adjust these rules to match what you follow.", options: JAIN_DEFAULTS },
    { id: "halal", label: "Halal", description: "Checks known conflicts and flags source or certification uncertainty.", options: {} },
    { id: "kosher", label: "Kosher", description: "Checks known conflicts and flags source or certification uncertainty.", options: {} },
    { id: "hindu_vegetarian", label: "Hindu Vegetarian", description: "Vegetarian preferences with an optional egg setting.", options: { allowEggs: false } },
  ]);

  const LIFESTYLE_DIETS = Object.freeze([
    { id: "vegetarian", label: "Vegetarian", options: {} },
    { id: "vegan", label: "Vegan", options: {} },
    { id: "pescatarian", label: "Pescatarian", options: {} },
    { id: "dairy_free", label: "Dairy-Free", options: {} },
    { id: "egg_free", label: "Egg-Free", options: {} },
    { id: "gluten_free", label: "Gluten-Free", options: { strictCrossContact: false } },
  ]);

  const ALLERGIES = Object.freeze([
    { id: "peanut", label: "Peanuts", legacyAliases: ["peanut", "peanuts"] },
    { id: "tree_nut", label: "Tree Nuts", legacyAliases: ["tree nut", "tree nuts"] },
    { id: "milk", label: "Milk", legacyAliases: ["milk", "dairy"] },
    { id: "egg", label: "Eggs", legacyAliases: ["egg", "eggs"] },
    { id: "soy", label: "Soy", legacyAliases: ["soy"] },
    { id: "wheat", label: "Wheat", legacyAliases: ["wheat"] },
    { id: "sesame", label: "Sesame", legacyAliases: ["sesame"] },
    { id: "fish", label: "Fish", legacyAliases: ["fish"] },
    { id: "shellfish", label: "Shellfish", legacyAliases: ["shellfish"] },
  ]);

  const CROSS_CONTACT_PRESETS = Object.freeze({
    standard: { contains: "avoid", mayContain: "caution", sharedEquipment: "caution", sharedFacility: "caution" },
    strict: { contains: "avoid", mayContain: "avoid", sharedEquipment: "avoid", sharedFacility: "caution" },
  });

  root.ROOTS_PROFILE_DEFINITIONS = Object.freeze({
    schemaVersion: 2,
    religiousDiets: RELIGIOUS_DIETS,
    lifestyleDiets: LIFESTYLE_DIETS,
    allergies: ALLERGIES,
    crossContactPresets: CROSS_CONTACT_PRESETS,
    jainDefaults: JAIN_DEFAULTS,
    customJainDefaults: JAIN_DEFAULTS,
    severityOptions: ["avoid", "caution", "preference"],
    crossContactValues: ["avoid", "caution", "ignore"],
  });
})(typeof window !== "undefined" ? window : globalThis);
