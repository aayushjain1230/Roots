(function (root) {
  "use strict";
  const EXTRA = Object.freeze([
    { id: "mirin", label: "Mirin", aliases: ["sweet rice wine"], categories: ["alcohol", "seasoning"], possibleSources: [], notes: "A Japanese rice seasoning that commonly contains alcohol. Check the product or restaurant recipe." },
    { id: "fish_sauce", label: "Fish Sauce", aliases: ["nam pla", "nuoc mam"], categories: ["fish", "seasoning"], possibleSources: ["fish", "salt"], notes: "A fermented seasoning usually made with fish and salt." },
    { id: "bone_char", label: "Bone Char", aliases: ["natural carbon"], categories: ["animal_derived", "processing_aid"], possibleSources: ["animal bone"], notes: "A processing material sometimes used in sugar refining; it may not appear as an ingredient." },
  ]);
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const conflictMap = Object.freeze({
    meat: ["Vegetarian", "Vegan", "Pescatarian"], pork: ["Halal", "Kosher"], fish: ["Vegetarian", "Vegan"],
    shellfish: ["Vegetarian", "Vegan", "Kosher"], dairy: ["Vegan", "Dairy-free"], egg: ["Vegan", "Egg-free"],
    alcohol: ["Halal"], root_vegetable: ["Strict Jain"], onion_garlic: ["Strict Jain"], mushroom: ["Strict Jain"],
    animal_derived: ["Vegan"], wheat: ["Wheat allergy"], gluten_grain: ["Gluten-free"], peanut: ["Peanut allergy"],
    tree_nut: ["Tree-nut allergy"], sesame: ["Sesame allergy"], soy: ["Soy allergy"],
  });
  function all() { return [...(root.ROOTS_INGREDIENT_KNOWLEDGE?.records || []), ...EXTRA]; }
  function view(record) {
    const conflicts = [...new Set((record.categories || []).flatMap((item) => conflictMap[item] || []))];
    return {
      id: record.id, label: record.label, aliases: record.aliases || [], categories: record.categories || [],
      possibleSources: record.possibleSources || [], allergens: record.allergens || [], conflicts,
      uncertainty: record.sourceDependent ? "The source must be confirmed before compatibility can be determined." : "",
      explanation: record.notes || `${record.label} is categorized as ${(record.categories || []).join(", ") || "an ingredient"} in the local ROOTS knowledge base.`,
    };
  }
  function search(query) {
    const value = clean(query).toLowerCase(); if (!value) return [];
    return all().filter((record) => [record.label, record.id, ...(record.aliases || [])].some((item) => clean(item).toLowerCase().includes(value))).slice(0, 30).map(view);
  }
  function get(id) { const record = all().find((item) => item.id === id); return record ? view(record) : null; }
  root.ROOTS_INGREDIENT_EXPLORER = { search, get, all: () => all().map(view) };
})(typeof window !== "undefined" ? window : globalThis);
