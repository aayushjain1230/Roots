(function (root) {
  "use strict";
  /* FUTURE_ROLLOUT entries remain implemented and stored. Changing this one policy
     deliberately re-enables selection and evaluation without deleting migrations. */
  const DEFAULTS = Object.freeze({
    jain: true,
    peanut: true, tree_nut: true, milk: true, egg: true, wheat: true,
    soy: true, fish: true, shellfish: true, sesame: true,
    custom_avoid: true,
    halal: false, kosher: false, hindu_vegetarian: false,
    vegetarian: false, vegan: false, pescatarian: false,
    dairy_free: false, egg_free: false, gluten_free: false,
    celiac_disease: false, gluten_sensitivity: false,
  });
  const RESTRICTION_MAP = Object.freeze({
    jain: "jain", halal: "halal", kosher: "kosher", hindu_vegetarian: "hindu_vegetarian",
    vegetarian: "vegetarian", vegan: "vegan", pescatarian: "pescatarian",
    lifestyle_dairy_free: "dairy_free", egg_free: "egg_free", legacy_gluten_free: "gluten_free",
    celiac_disease: "celiac_disease", gluten_sensitivity: "gluten_sensitivity",
    peanut_allergy: "peanut", tree_nut_allergy_group: "tree_nut", milk_allergy: "milk",
    egg_allergy: "egg", wheat_allergy: "wheat", soy_allergy: "soy", fish_allergy: "fish",
    shellfish_allergy: "shellfish", sesame_allergy: "sesame",
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function createPolicy(overrides) {
    const flags = Object.freeze({ ...DEFAULTS, ...(overrides || {}) });
    const available = (id) => flags[RESTRICTION_MAP[id] || id] === true;
    const projectProfile = (input) => {
      const profile = clone(input || {});
      profile.religiousDiets = (profile.religiousDiets || []).map((item) => ({ ...item, enabled: item.enabled && available(item.id) }));
      profile.lifestyleDiets = (profile.lifestyleDiets || []).map((item) => ({ ...item, enabled: item.enabled && available(item.id) }));
      profile.allergies = (profile.allergies || []).filter((item) => item.type !== "built_in" || available(item.id));
      profile.restrictions = (profile.restrictions || []).filter((item) => !item?.enabled || available(item.id));
      return profile;
    };
    return Object.freeze({ flags, isAvailable: available, isSelectableRestriction: (item) => available(item?.id), projectProfile });
  }
  const policy = createPolicy();
  root.ROOTS_DIETARY_FEATURES = Object.freeze({ ...policy, createPolicy, defaults: DEFAULTS, restrictionMap: RESTRICTION_MAP });
})(typeof window !== "undefined" ? window : globalThis);
