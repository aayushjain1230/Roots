(function (root) {
  "use strict";
  const ENTRIES = Object.freeze([
    ["cilantro","Cilantro","coriander leaf","en",["US","MX"],"ingredient","Fresh coriander leaves.",[]],
    ["aubergine","Aubergine","eggplant","en",["GB","FR"],"ingredient","A regional name for eggplant.",["eggplant"]],
    ["brinjal","Brinjal","eggplant","en",["IN"],"ingredient","A common Indian English name for eggplant.",["eggplant"]],
    ["curd","Curd","yogurt","en",["IN"],"dairy","Often means yogurt in Indian English; confirm the recipe.",["milk"]],
    ["maida","Maida","refined wheat flour","hi-Latn",["IN"],"ingredient","A refined wheat flour.",["wheat"]],
    ["atta","Atta","whole wheat flour","hi-Latn",["IN"],"ingredient","Whole wheat flour commonly used for flatbreads.",["wheat"]],
    ["hing","Hing","asafoetida","hi-Latn",["IN"],"seasoning","A seasoning that may be compounded with wheat flour; confirm the product.",[]],
    ["dashi","だし","dashi","ja",["JP"],"broth","Japanese stock that may contain bonito or other fish. This term alone does not confirm a dish contains fish.",["fish"]],
    ["bonito","鰹","bonito","ja",["JP"],"animal_product","A fish commonly used in dashi.",["fish"]],
    ["mirin","みりん","mirin","ja",["JP"],"alcohol","A rice seasoning that commonly contains alcohol; confirm the recipe.",["alcohol"]],
    ["shoyu","醤油","soy sauce","ja",["JP"],"sauce","Japanese soy sauce; it commonly contains soy and may contain wheat.",["soy","wheat"]],
    ["manteca","Manteca","lard or cooking fat","es",["MX"],"animal_product","May refer to lard or another cooking fat. Ask which type is used.",["lard"]],
    ["crema","Crema","cream","es",["MX"],"dairy","A dairy cream used as a topping or ingredient.",["milk"]],
    ["consome","Consomé","broth","es",["MX"],"broth","A broth that may use meat stock. Confirm its ingredients.",["meat_stock"]],
    ["groundnut","Groundnut","peanut","en",["IN","GB"],"allergen","A regional term for peanut.",["peanut"]],
    ["crustaceans","Crustaceans","shellfish such as shrimp or crab","en",["GB","EU"],"allergen","A labeling term covering several shellfish.",["shellfish"]],
  ].map((item, index) => Object.freeze({ id:`travel-glossary-${index}`,termOriginal:item[1],termTranslated:item[2],transliteration:item[3].includes("-Latn")?item[1]:"",language:item[3].split("-")[0],regions:item[4],category:item[5],description:item[6],canonicalIngredientIds:item[7],evidenceLevel:"general_knowledge" })));
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  function search(query, context) {
    const value = clean(query), region = String(context?.countryCode || "").toUpperCase();
    if (!value) return [];
    return ENTRIES.filter((entry) => (!region || entry.regions.includes(region) || context?.allRegions) && [entry.termOriginal, entry.termTranslated, entry.transliteration, ...entry.canonicalIngredientIds].some((term) => clean(term).includes(value))).slice(0, 40);
  }
  function relevant(profile, destination) {
    const ids = new Set((profile?.allergies || []).map((item) => item.id));
    const jain = (profile?.religiousDiets || []).find((item) => item.id === "jain" && item.enabled);
    if (jain?.options?.avoidMeatFishSeafood) ["fish","meat_stock","lard"].forEach((id) => ids.add(id));
    if (jain?.options?.avoidEggs) ids.add("egg");
    if (jain?.options?.avoidOnionGarlic) { ids.add("onion"); ids.add("garlic"); }
    const region = String(destination?.countryCode || "").toUpperCase();
    return ENTRIES.filter((entry) => (!region || entry.regions.includes(region)) && (!ids.size || entry.canonicalIngredientIds.some((id) => ids.has(id)) || ["broth","sauce","seasoning"].includes(entry.category)));
  }
  function countryNotes(countryCode) {
    const notes = {
      JP:["Dashi may contain fish even when a dish looks vegetable-based.","Menus may not list every ingredient; ask about broths and sauces."],
      IN:["Groundnut may be used for peanut.","Hing mixtures may include wheat flour; confirm the product when gluten matters."],
      GB:["Aubergine means eggplant, and coriander may mean cilantro.","Labels may group wheat, barley, and rye as gluten-containing cereals."],
      MX:["Manteca may mean lard; ask which cooking fat is used.","Consomé may use meat stock even when served with vegetables."],
    };
    return notes[String(countryCode || "").toUpperCase()] || ["Menus may not list every ingredient.","Shared-fryer and preparation details may require asking restaurant staff."];
  }
  function adaptQuestion(question, countryCode) {
    const replacements = {GB:[["eggplant","aubergine"],["cilantro","coriander"],["peanut","groundnut"]],IN:[["eggplant","brinjal"],["peanut","groundnut"]]}[String(countryCode||"").toUpperCase()] || [];
    return replacements.reduce((text,[canonical,regional])=>text.replace(new RegExp(`\\b${canonical}\\b`,"gi"),regional),String(question||""));
  }
  root.ROOTS_TRAVEL_GLOSSARY = { search, getEntry: (id) => ENTRIES.find((entry) => entry.id === id) || null, getRelevant: relevant, countryNotes, adaptQuestion, entries: ENTRIES };
})(typeof window !== "undefined" ? window : globalThis);
