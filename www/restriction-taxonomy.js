(function (root) {
  "use strict";
  const source = root.ROOTS_RESTRICTION_DEFINITIONS;
  if (!source) throw new Error("Restriction definitions must load before the taxonomy.");
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const byId = new Map(source.restrictions.map((item) => [item.id, item]));
  const categories = source.categories.map((category) => Object.freeze({
    ...category,
    restrictionCount: source.restrictions.filter((item) => item.categoryId === category.id).length,
  }));
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let searchIndex = null;
  function buildSearchIndex() {
    if (searchIndex) return searchIndex;
    searchIndex = source.restrictions.map((restriction) => {
      const category = categories.find((item) => item.id === restriction.categoryId);
      const terms = [
        restriction.label, restriction.shortLabel, restriction.description, category?.label,
        ...restriction.searchTerms, ...restriction.canonicalIngredientIds,
        ...restriction.possibleSourceIngredientIds,
        ...Object.values(restriction.rules).flat(),
      ].map(normalize).filter(Boolean);
      return { restriction, text: [...new Set(terms)].join(" ") };
    });
    return searchIndex;
  }
  function search(query, options) {
    const term = normalize(query);
    if (!term) return [];
    const categoryId = options?.categoryId;
    return buildSearchIndex()
      .filter((entry) => (!categoryId || entry.restriction.categoryId === categoryId) && entry.text.includes(term))
      .map((entry) => clone(entry.restriction));
  }
  function explicitSelections(profile) {
    return Array.isArray(profile?.restrictions) ? profile.restrictions.filter((item) => item?.enabled !== false && byId.has(item?.id)) : [];
  }
  function legacySelections(profile) {
    const selected = [];
    source.restrictions.forEach((restriction) => {
      const legacy = restriction.legacy;
      if (!legacy?.group) return;
      const item = profile?.[legacy.group]?.find?.((entry) => entry.id === legacy.id && entry.enabled);
      if (item) selected.push({ id: restriction.id, enabled: true, settings: clone(item.options || {}), source: "legacy_profile" });
    });
    const allergyMap = {
      peanut: "peanut_allergy", tree_nut: "tree_nut_allergy_group", milk: "milk_allergy",
      egg: "egg_allergy", soy: "soy_allergy", wheat: "wheat_allergy", sesame: "sesame_allergy",
      fish: "fish_allergy", shellfish: "shellfish_allergy",
    };
    (profile?.allergies || []).filter((item) => item.type === "built_in").forEach((item) => {
      if (allergyMap[item.id]) selected.push({ id: allergyMap[item.id], enabled: true, settings: {}, source: "legacy_profile" });
    });
    return selected;
  }
  function getSelected(profile) {
    const merged = new Map();
    [...legacySelections(profile), ...explicitSelections(profile)].forEach((item) => {
      const definition = byId.get(item.id);
      if (definition) merged.set(item.id, {
        id: item.id, enabled: true, settings: { ...clone(definition.defaultSettings), ...clone(item.settings || {}) },
        source: item.source || "restriction_profile",
      });
    });
    return [...merged.values()];
  }
  function validateSelection(profile) {
    const errors = [];
    explicitSelections(profile).forEach((item) => {
      const definition = byId.get(item.id);
      if (!definition) errors.push(`Unknown restriction: ${item.id}`);
      if (item.settings != null && (typeof item.settings !== "object" || Array.isArray(item.settings))) errors.push(`Invalid settings: ${item.id}`);
    });
    return { valid: errors.length === 0, errors };
  }
  function compileProfile(profile) {
    const selected = getSelected(profile).map((selection) => ({
      ...selection,
      definition: clone(byId.get(selection.id)),
    }));
    return Object.freeze({
      schemaVersion: 1,
      profileId: profile?.id || "default",
      profileUpdatedAt: profile?.updatedAt || "",
      selected: Object.freeze(selected),
      selectedIds: Object.freeze(selected.map((item) => item.id)),
      crossContact: clone(profile?.crossContact || {}),
    });
  }
  root.ROOTS_RESTRICTIONS = {
    getCategories: () => clone(categories),
    getRestriction: (id) => byId.has(id) ? clone(byId.get(id)) : null,
    getRestrictions: (categoryId) => clone(source.restrictions.filter((item) => !categoryId || item.categoryId === categoryId)),
    search,
    getSelected,
    validateSelection,
    compileProfile,
    getRuleTrace: (result) => clone(result?.ruleTrace || result?.phase6Handoff?.ruleTrace || []),
    normalizeSearchTerm: normalize,
    getSearchIndexBuildCount: () => searchIndex ? 1 : 0,
  };
})(typeof window !== "undefined" ? window : globalThis);
