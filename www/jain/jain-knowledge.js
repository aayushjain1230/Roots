(function (root) {
  "use strict";
  const VERSION = 1;
  const date = "2026-08-16";
  const rec = (id, topic, category, concepts, summary, explanation, foodImplications, sourceRefs, ruleLinks) => Object.freeze({
    id, schemaVersion: 1, topic, category,
    traditionApplicability: ["general"],
    observanceApplicability: ["normal", "paryushan", "das_lakshan"],
    concepts, summary, explanation, foodImplications,
    sourceRefs, evidenceClass: "structured_source", ruleLinks,
    version: 1, lastUpdated: date,
  });
  const records = Object.freeze([
    rec("jain-root-vegetables", "Root vegetables", "food_rule", ["ahimsa", "root_vegetables"], "Many Jain food practices restrict root and underground vegetables.", "ROOTS treats root vegetables as a configurable Jain rule because practice varies. When enabled, potato, onion, garlic, carrot, beet, radish, ginger, and similar underground foods conflict with the effective Jain profile.", ["potato", "onion", "garlic", "carrot", "beet", "radish", "ginger"], ["jain-practice-observance-v1"], ["rule-jain-root-vegetable"]),
    rec("jain-onion-garlic", "Onion and garlic", "food_rule", ["ahimsa", "onion_garlic"], "Onion and garlic are separately configurable because many users track them specifically.", "ROOTS flags onion, garlic, shallot, leek, and chive when the user's Jain settings exclude onion and garlic. This remains independent from mother tongue and app language.", ["onion", "garlic", "shallot", "leek", "chive"], ["jain-practice-observance-v1"], ["rule-jain-onion-garlic"]),
    rec("jain-animal-additives", "Animal-derived additives", "ingredient_source", ["animal_source", "modern_additives"], "Animal-derived additives conflict when the user's Jain profile excludes animal-derived ingredients.", "Confirmed gelatin, carmine, shellac, isinglass, collagen, animal rennet, and similar animal or insect-derived additives produce a deterministic Do Not Eat result for Jain users with this rule enabled.", ["gelatin", "carmine", "shellac", "animal rennet", "isinglass"], ["jain-additive-source-v1"], ["rule-jain-animal-additives"]),
    rec("jain-source-dependent-additives", "Source-dependent additives", "ingredient_source", ["uncertainty", "modern_additives"], "Some additives may be plant, microbial, synthetic, or animal-derived.", "For rennet, enzymes, glycerin, mono- and diglycerides, natural flavors, emulsifiers, stearates, L-cysteine, and vitamin D3, ROOTS requires source evidence before treating the ingredient as compatible when animal-derived additives matter.", ["rennet", "enzymes", "glycerin", "natural flavors", "emulsifiers", "stearates", "L-cysteine"], ["jain-additive-source-v1"], ["rule-jain-source-dependent-additives"]),
    rec("jain-paryushan", "Paryushan", "observance", ["paryushan", "temporary_rules"], "Paryushan can activate temporary Jain food rules when the user opts in.", "ROOTS stores Paryushan settings separately from permanent Jain settings. During an active opted-in observance, deterministic scans, recipes, restaurants, shopping, dictionary context, and Ask context use the effective Jain profile.", ["observance settings", "temporary food rules"], ["jain-practice-observance-v1", "jain-calendar-static-v1"], ["rule-jain-paryushan-root-tightening", "rule-jain-paryushan-fermentation"]),
    rec("jain-das-lakshan", "Das Lakshan", "observance", ["das_lakshan", "digambar"], "Das Lakshan uses the same observance framework with tradition-aware activation.", "Digambar users may receive Das Lakshan prompts and optional temporary rules. Users marked Not sure receive neutral informational notices rather than automatic observance activation.", ["observance settings", "temporary food rules"], ["jain-practice-observance-v1", "jain-calendar-static-v1"], ["rule-jain-das-lakshan-source-dependent"]),
    rec("jain-ayambil", "Ayambil", "fasting_term", ["ayambil", "fasting"], "Ayambil is an austerity/fasting-related food practice and belongs in the observance layer.", "ROOTS v1 records Ayambil as knowledge and calendar-ready terminology, but full fasting workflow remains a future practice layer so packaged-food compatibility is not changed by time-of-day or fasting reminders.", ["simple foods", "fasting context"], ["jain-practice-observance-v1"], []),
  ]);
  const byId = new Map(records.map((item) => [item.id, item]));
  root.ROOTS_JAIN_KNOWLEDGE = Object.freeze({ VERSION, records, byId, get: (id) => byId.get(id) || null });
})(typeof window !== "undefined" ? window : globalThis);
