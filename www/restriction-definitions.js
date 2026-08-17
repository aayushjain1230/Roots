(function (root) {
  "use strict";

  const categories = Object.freeze([
    ["religious_diets", "Religious Diets", "Dietary practices with configurable evidence and source requirements.", "faith"],
    ["food_allergies", "Food Allergies", "Ingredients and cross-contact statements relevant to allergic reactions.", "allergy"],
    ["digestive_health", "Digestive Health", "Quantity-sensitive and user-specific digestive restrictions.", "digestive"],
    ["medical_clinical", "Medical and Clinical Diets", "Ingredient and nutrition rules configured by the user or their clinician.", "medical"],
    ["lifestyle_diets", "Lifestyle Diets", "Eating patterns such as vegan, vegetarian, and pescatarian.", "lifestyle"],
    ["food_sensitivities", "Food Sensitivities", "Non-allergy sensitivities with cautious evidence wording.", "sensitivity"],
    ["ingredient_preferences", "Ingredient Preferences", "Personal choices that never override safety-critical results.", "preference"],
    ["custom_restrictions", "Custom Restrictions", "User-defined ingredients, aliases, and handling rules.", "custom"],
  ].map((item, index) => Object.freeze({
    id: item[0], label: item[1], description: item[2], icon: item[3], sortOrder: index + 1,
    searchTerms: Object.freeze(item[1].toLowerCase().split(/\s+/)),
  })));

  const base = (id, categoryId, label, type, description, extra) => Object.freeze({
    schemaVersion: 1, id, categoryId, label,
    shortLabel: extra?.shortLabel || label.replace(/\s+(Allergy|Sensitivity|Intolerance|Disease|Syndrome)$/i, ""),
    description, type, severityModel: extra?.severityModel || type,
    defaultSettings: Object.freeze(extra?.defaultSettings || {}),
    searchTerms: Object.freeze(extra?.searchTerms || []),
    canonicalIngredientIds: Object.freeze(extra?.canonicalIngredientIds || []),
    possibleSourceIngredientIds: Object.freeze(extra?.possibleSourceIngredientIds || []),
    crossContactRelevant: !!extra?.crossContactRelevant,
    quantitySensitive: !!extra?.quantitySensitive,
    preparationSensitive: !!extra?.preparationSensitive,
    certificationRelevant: !!extra?.certificationRelevant,
    regionSensitive: extra?.regionSensitive !== false,
    customizable: extra?.customizable !== false,
    ruleVersion: 1,
    rules: Object.freeze({
      direct: Object.freeze(extra?.rules?.direct || []),
      caution: Object.freeze(extra?.rules?.caution || []),
      sourceDependent: Object.freeze(extra?.rules?.sourceDependent || []),
      quantityDependent: Object.freeze(extra?.rules?.quantityDependent || []),
      preparationDependent: Object.freeze(extra?.rules?.preparationDependent || []),
      exclusions: Object.freeze(extra?.rules?.exclusions || []),
    }),
    subgroup: extra?.subgroup || "",
    legacy: Object.freeze(extra?.legacy || {}),
  });

  const allergy = (id, label, terms, extra = {}) => base(
    id, "food_allergies", label, "allergy",
    `Avoids ${label.replace(/ allergy/i, "").toLowerCase()} and recognized aliases; cross-contact follows the profile setting.`,
    { ...extra, crossContactRelevant: true, severityModel: "allergen", canonicalIngredientIds: terms, rules: { direct: terms, ...(extra.rules || {}) } },
  );

  const definitions = [
    base("jain", "religious_diets", "Jain", "religious", "One customizable Jain profile; ROOTS does not claim one practice is universal.", { legacy: { group: "religiousDiets", id: "jain" }, searchTerms: ["onion", "garlic", "root vegetables"] }),
    base("halal", "religious_diets", "Halal", "religious", "Checks confirmed conflicts and source or certification uncertainty.", { legacy: { group: "religiousDiets", id: "halal" }, certificationRelevant: true, searchTerms: ["pork", "gelatin", "alcohol"] }),
    base("kosher", "religious_diets", "Kosher", "religious", "Checks confirmed conflicts, meat-and-dairy combinations, and source uncertainty.", { legacy: { group: "religiousDiets", id: "kosher" }, certificationRelevant: true }),
    base("hindu_vegetarian", "religious_diets", "Hindu Vegetarian", "religious", "Vegetarian rules with a configurable egg setting.", { legacy: { group: "religiousDiets", id: "hindu_vegetarian" } }),
    base("buddhist_vegetarian", "religious_diets", "Buddhist Vegetarian", "religious", "Configurable vegetarian practice with optional pungent-vegetable avoidance.", { defaultSettings: { avoidEggs: false, avoidFivePungentVegetables: false }, rules: { direct: ["meat", "poultry", "fish", "shellfish"], caution: ["natural flavors"] } }),

    allergy("peanut_allergy", "Peanut Allergy", ["peanut", "groundnut", "arachis oil", "peanut flour"], { subgroup: "Peanuts and Tree Nuts", searchTerms: ["nuts"] }),
    allergy("tree_nut_allergy_group", "Tree Nut Allergy", ["almond", "cashew", "pistachio", "walnut", "pecan", "hazelnut", "brazil nut", "macadamia"], { subgroup: "Peanuts and Tree Nuts", defaultSettings: { selectedTreeNuts: ["almond", "cashew", "pistachio", "walnut", "pecan", "hazelnut", "brazil_nut", "macadamia"] }, searchTerms: ["nuts"] }),
    ...[
      ["almond_allergy", "Almond Allergy", "almond"], ["cashew_allergy", "Cashew Allergy", "cashew"],
      ["pistachio_allergy", "Pistachio Allergy", "pistachio"], ["walnut_allergy", "Walnut Allergy", "walnut"],
      ["pecan_allergy", "Pecan Allergy", "pecan"], ["hazelnut_allergy", "Hazelnut Allergy", "hazelnut"],
      ["brazil_nut_allergy", "Brazil Nut Allergy", "brazil nut"], ["macadamia_allergy", "Macadamia Allergy", "macadamia"],
    ].map(([id, label, term]) => allergy(id, label, [term], { subgroup: "Peanuts and Tree Nuts" })),
    allergy("milk_allergy", "Milk Allergy", ["milk", "casein", "caseinate", "whey", "milk solids", "butter", "ghee", "lactalbumin", "lactoglobulin", "cream", "curds", "milk protein"], { subgroup: "Milk and Egg", searchTerms: ["dairy allergy"] }),
    allergy("egg_allergy", "Egg Allergy", ["egg", "albumen", "ovalbumin", "mayonnaise", "egg powder"], { subgroup: "Milk and Egg" }),
    allergy("wheat_allergy", "Wheat Allergy", ["wheat", "durum", "semolina", "spelt", "farro", "einkorn"], { subgroup: "Grains", searchTerms: ["gluten allergy"] }),
    allergy("soy_allergy", "Soy Allergy", ["soy", "soya", "tofu", "edamame", "tempeh", "soy lecithin"], { subgroup: "Soy and Legumes" }),
    allergy("sesame_allergy", "Sesame Allergy", ["sesame", "tahini", "benne", "gingelly"], { subgroup: "Seeds" }),
    allergy("mustard_allergy", "Mustard Allergy", ["mustard", "mustard seed", "mustard flour"], { subgroup: "Seeds" }),
    allergy("fish_allergy", "Fish Allergy", ["fish", "salmon", "tuna", "cod", "anchovy", "fish sauce"], { subgroup: "Fish and Shellfish" }),
    allergy("shellfish_allergy", "Shellfish Allergy", ["shrimp", "prawn", "crab", "lobster", "crayfish"], { subgroup: "Fish and Shellfish" }),
    allergy("mollusk_allergy", "Mollusk Allergy", ["mollusk", "oyster", "clam", "mussel", "scallop", "squid", "octopus"], { subgroup: "Fish and Shellfish" }),
    allergy("celery_allergy", "Celery Allergy", ["celery", "celeriac", "celery salt"], { subgroup: "Fruits and Vegetables" }),
    allergy("lupin_allergy", "Lupin Allergy", ["lupin", "lupine", "lupin flour"], { subgroup: "Soy and Legumes" }),
    allergy("corn_allergy", "Corn Allergy or Intolerance", ["corn", "maize", "corn starch", "corn syrup"], { subgroup: "Grains", rules: { sourceDependent: ["dextrose", "maltodextrin", "modified starch", "sorbitol", "citric acid", "ascorbic acid", "xanthan gum", "caramel color", "flavor carrier"] }, searchTerms: ["maize"] }),
    allergy("oral_allergy_syndrome", "Oral Allergy Syndrome", ["apple", "peach", "cherry", "pear", "carrot", "celery", "hazelnut"], { subgroup: "Fruits and Vegetables", preparationSensitive: true, defaultSettings: { rawOnly: true, triggers: [] }, rules: { preparationDependent: ["raw apple", "raw peach", "raw carrot", "raw celery"] }, searchTerms: ["pollen food syndrome", "oas"] }),

    base("celiac_disease", "medical_clinical", "Celiac Disease", "medical", "Strict gluten evidence with configurable oat, certification, and cross-contact handling.", { certificationRelevant: true, crossContactRelevant: true, defaultSettings: { requireCertifiedGlutenFree: false, avoidOatsUnlessCertified: true, sharedEquipment: "avoid", sharedFacility: "caution" }, searchTerms: ["gluten allergy", "coeliac"], rules: { direct: ["wheat", "barley", "rye", "malt", "brewer's yeast", "spelt", "farro", "einkorn", "semolina", "durum", "triticale"], caution: ["oats"], sourceDependent: ["modified food starch", "wheat-derived glucose syrup"] } }),
    base("gluten_sensitivity", "digestive_health", "Gluten Sensitivity", "digestive", "Tracks gluten ingredients separately from Celiac Disease.", { defaultSettings: { oatsAllowed: true, traceHandling: "caution", requireCertifiedGlutenFree: false }, searchTerms: ["non celiac gluten sensitivity", "gluten allergy"], rules: { direct: ["wheat", "barley", "rye", "malt", "spelt", "farro", "semolina", "durum"], caution: ["oats", "modified food starch"] } }),
    base("lactose_intolerance", "digestive_health", "Lactose Intolerance", "intolerance", "Quantity-sensitive lactose handling; it is not Milk Allergy.", { quantitySensitive: true, defaultSettings: { tolerance: "unknown", allowLactoseFree: true }, searchTerms: ["lactose", "dairy intolerance"], rules: { quantityDependent: ["milk", "cream", "whey", "milk solids", "lactose"], exclusions: ["lactose free", "lactose-free"] } }),
    base("low_fodmap", "digestive_health", "Low FODMAP", "digestive", "Tracks fermentable-carbohydrate groups without treating ingredient presence as a definitive serving-size verdict.", { quantitySensitive: true, defaultSettings: { mode: "elimination", groups: ["fructans", "gos", "lactose", "excess_fructose", "sorbitol", "mannitol", "xylitol", "maltitol", "other_polyols"] }, searchTerms: ["ibs", "fructans", "polyols"], rules: { quantityDependent: ["onion", "garlic", "inulin", "chicory root", "agave", "fruit concentrate", "sorbitol", "mannitol", "xylitol", "maltitol", "sugar alcohol", "legume", "wheat"] } }),
    base("low_histamine", "digestive_health", "Low Histamine", "sensitivity", "Uses cautious commonly-avoided and possible-trigger evidence; individual tolerance varies.", { defaultSettings: { userTriggers: [] }, searchTerms: ["histamine intolerance"], rules: { caution: ["fermented", "aged cheese", "processed meat", "vinegar", "yeast extract", "smoked fish"], quantityDependent: ["tomato", "spinach", "eggplant", "citrus"] } }),
    base("alpha_gal_syndrome", "medical_clinical", "Alpha-Gal Syndrome", "medical", "Tracks mammalian ingredients and source-dependent mammalian derivatives without diagnosing the user.", { defaultSettings: { avoidDairy: false, avoidGelatin: true, avoidMammalianAdditives: true, strictUnknownSource: true }, searchTerms: ["alpha gal", "mammalian meat allergy"], rules: { direct: ["beef", "pork", "lamb", "venison", "lard", "tallow", "collagen"], caution: ["gelatin"], sourceDependent: ["glycerin", "stearate", "natural flavors", "capsule"] }, exclusions: ["carrageenan"] }),
    base("low_sodium", "medical_clinical", "Low Sodium", "medical", "Uses a user-configured sodium threshold when nutrition evidence is available.", { quantitySensitive: true, defaultSettings: { maxMgPerServing: 140 }, searchTerms: ["salt", "sodium"], rules: { quantityDependent: ["salt", "sodium", "monosodium glutamate"] } }),
    base("phenylketonuria", "medical_clinical", "Phenylketonuria (PKU)", "medical", "Flags phenylalanine and aspartame evidence without providing treatment advice.", { searchTerms: ["pku", "phenylalanine"], rules: { direct: ["phenylalanine", "aspartame"] } }),
    base("renal_diet", "medical_clinical", "Renal Diet", "medical", "Creates uncertainty when potassium, phosphorus, or sodium nutrition evidence is missing.", { quantitySensitive: true, defaultSettings: { trackSodium: true, trackPotassium: true, trackPhosphorus: true }, rules: { quantityDependent: ["potassium chloride", "phosphate", "phosphoric acid", "sodium"] } }),
    base("warfarin_vitamin_k", "medical_clinical", "Vitamin K Consistency", "medical", "Tracks possible high-vitamin-K ingredients for user review; it does not provide dosing advice.", { quantitySensitive: true, rules: { quantityDependent: ["kale", "spinach", "collard greens", "vitamin k"] } }),

    ...[
      ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["pescatarian", "Pescatarian"],
      ["lifestyle_dairy_free", "Dairy-Free"], ["egg_free", "Egg-Free"], ["legacy_gluten_free", "Gluten-Free (Legacy)"],
    ].map(([id, label]) => base(id, "lifestyle_diets", label, "lifestyle", `${label} compatibility using the existing deterministic ROOTS rules.`, { legacy: { group: "lifestyleDiets", id: id === "lifestyle_dairy_free" ? "dairy_free" : id === "legacy_gluten_free" ? "gluten_free" : id } })),

    base("sulfite_sensitivity", "food_sensitivities", "Sulfite Sensitivity", "sensitivity", "Tracks declared sulfites and common sulfite additives.", { searchTerms: ["sulphite", "e220", "e228"], rules: { direct: ["sulfite", "sulphite", "sulfur dioxide", "sodium metabisulfite", "potassium bisulfite", "e220", "e221", "e222", "e223", "e224", "e225", "e226", "e227", "e228"] } }),
    base("msg_sensitivity", "food_sensitivities", "MSG Sensitivity", "sensitivity", "Tracks monosodium glutamate and user-selected related terms.", { searchTerms: ["msg"], rules: { direct: ["msg", "monosodium glutamate"], caution: ["yeast extract", "hydrolyzed protein"] } }),
    base("caffeine_sensitivity", "food_sensitivities", "Caffeine Sensitivity", "sensitivity", "Quantity-sensitive caffeine awareness.", { quantitySensitive: true, rules: { quantityDependent: ["caffeine", "coffee", "tea extract", "guarana"] } }),
    base("artificial_sweeteners", "food_sensitivities", "Artificial Sweetener Sensitivity", "sensitivity", "Tracks selected high-intensity sweeteners.", { rules: { direct: ["aspartame", "sucralose", "acesulfame potassium", "saccharin"] } }),
    base("avoid_msg", "ingredient_preferences", "Avoid MSG", "preference", "A personal ingredient preference, not an allergy.", { rules: { direct: ["msg", "monosodium glutamate"] } }),
    base("avoid_artificial_colors", "ingredient_preferences", "Avoid Artificial Colors", "preference", "A personal preference for avoiding declared artificial colors.", { rules: { direct: ["artificial color", "red 40", "yellow 5", "yellow 6", "blue 1"] } }),
  ];

  root.ROOTS_RESTRICTION_DEFINITIONS = Object.freeze({
    schemaVersion: 1,
    categories,
    restrictions: Object.freeze(definitions),
    validTypes: Object.freeze(["allergy", "intolerance", "religious", "medical", "digestive", "lifestyle", "sensitivity", "preference", "custom"]),
  });
})(typeof window !== "undefined" ? window : globalThis);
