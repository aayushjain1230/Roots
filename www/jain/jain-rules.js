(function (root) {
  "use strict";
  const VERSION = 1;
  const rule = (id, type, label, optionKey, ingredientIds, aliasIds, extra) => Object.freeze({
    id, type, label, optionKey,
    description: extra?.description || label,
    ingredientIds: ingredientIds || [],
    aliasIds: aliasIds || [],
    categories: extra?.categories || [],
    applicableTraditions: extra?.applicableTraditions || ["general"],
    applicableObservances: extra?.applicableObservances || ["normal", "paryushan", "das_lakshan"],
    sourceRefs: extra?.sourceRefs || ["jain-practice-observance-v1"],
    version: 1,
    enabledByDefault: extra?.enabledByDefault !== false,
    userConfigurable: extra?.userConfigurable !== false,
    effect: extra?.effect || "avoid",
  });
  const baselineRules = Object.freeze([
    rule("rule-jain-meat-fish-seafood", "baseline", "Meat, fish, and seafood restricted", "avoidMeatFishSeafood", ["beef", "pork", "chicken", "fish", "shrimp", "meat_stock", "bone_broth"], ["meat", "fish", "shellfish"], { categories: ["meat", "fish", "shellfish"] }),
    rule("rule-jain-eggs", "personal", "Egg restricted", "avoidEggs", ["egg", "mayonnaise"], ["egg"], { categories: ["egg"] }),
    rule("rule-jain-onion-garlic", "personal", "Onion and garlic restricted", "avoidOnionGarlic", ["onion", "garlic", "shallot", "leek", "chive"], ["onion_garlic"], { categories: ["onion_garlic"] }),
    rule("rule-jain-root-vegetable", "personal", "Root vegetables restricted", "avoidAllRootVegetables", ["potato", "sweet_potato", "yam", "carrot", "beet", "radish", "turnip", "ginger", "turmeric_root", "tapioca"], ["root_vegetable"], { categories: ["root_vegetable"] }),
    rule("rule-jain-honey", "personal", "Honey restricted", "avoidHoney", ["honey"], ["honey"], { categories: ["honey"] }),
    rule("rule-jain-animal-additives", "personal", "Animal-derived additives restricted", "avoidAnimalDerivedAdditives", ["gelatin", "porcine_gelatin", "fish_gelatin", "carmine", "shellac", "isinglass", "collagen", "animal_rennet", "pepsin"], ["animal_derived", "insect_derived"], { categories: ["animal_derived", "insect_derived"], sourceRefs: ["jain-additive-source-v1"] }),
    rule("rule-jain-source-dependent-additives", "personal", "Unknown source additives need verification", "avoidAnimalDerivedAdditives", ["rennet", "enzymes", "glycerin", "mono_diglycerides", "natural_flavors", "l_cysteine", "vitamin_d3", "stearates", "emulsifier"], ["source_dependent"], { effect: "caution", categories: ["source_dependent"], sourceRefs: ["jain-additive-source-v1"] }),
    rule("rule-jain-mushrooms", "personal", "Mushrooms restricted", "avoidMushrooms", ["mushroom"], ["mushroom"], { categories: ["mushroom"], enabledByDefault: false }),
    rule("rule-jain-fermentation", "personal", "Fermented ingredients restricted", "avoidFermentedIngredients", ["cultures", "brewers_yeast", "beer"], ["fermentation"], { categories: ["fermentation"], enabledByDefault: false }),
    rule("rule-jain-artificial-additives", "personal", "Artificial additives restricted", "avoidArtificialAdditives", ["artificial_flavors", "colors", "preservatives"], ["artificial_additive"], { categories: ["artificial_additive"], enabledByDefault: false }),
  ]);
  const observanceRules = Object.freeze({
    paryushan: Object.freeze([
      rule("rule-jain-paryushan-root-tightening", "observance-specific", "Paryushan root-vegetable rule active", "avoidAllRootVegetables", ["potato", "carrot", "beet", "radish", "ginger"], ["root_vegetable"], { applicableObservances: ["paryushan"] }),
      rule("rule-jain-paryushan-fermentation", "observance-specific", "Paryushan fermented-ingredient caution active", "avoidFermentedIngredients", ["cultures", "brewers_yeast"], ["fermentation"], { applicableObservances: ["paryushan"], effect: "caution", enabledByDefault: true }),
      rule("rule-jain-paryushan-source-dependent", "observance-specific", "Paryushan source-dependent additive caution active", "avoidAnimalDerivedAdditives", ["rennet", "enzymes", "natural_flavors"], ["source_dependent"], { applicableObservances: ["paryushan"], effect: "caution", sourceRefs: ["jain-additive-source-v1"] }),
    ]),
    das_lakshan: Object.freeze([
      rule("rule-jain-das-lakshan-source-dependent", "observance-specific", "Das Lakshan source-dependent additive caution active", "avoidAnimalDerivedAdditives", ["rennet", "enzymes", "natural_flavors"], ["source_dependent"], { applicableObservances: ["das_lakshan"], effect: "caution", sourceRefs: ["jain-additive-source-v1"] }),
    ]),
  });
  function allRules() { return Object.freeze([...baselineRules, ...Object.values(observanceRules).flat()]); }
  root.ROOTS_JAIN_RULES = Object.freeze({ VERSION, baselineRules, observanceRules, allRules, getRule: (id) => allRules().find((item) => item.id === id) || null });
})(typeof window !== "undefined" ? window : globalThis);
