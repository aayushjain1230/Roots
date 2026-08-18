(function (root) {
  "use strict";
  const VERSION = 1;
  function todaySummary(profile, date) {
    const active = root.ROOTS_JAIN_OBSERVANCES?.getActive(profile, date);
    if (!active?.enabled) return null;
    const effective = root.ROOTS_JAIN_EFFECTIVE_PROFILE.getEffectiveProfile({ profile, date });
    return { title: "Today", label: `${active.label} · Day ${active.day}`, additionalRuleCount: effective.observanceRules.length, rules: effective.observanceRules };
  }
  function evaluateFood(foodEvidence, effectiveProfile) {
    const profile = foodEvidence?.profile || null;
    const parsed = foodEvidence?.parsed || root.ROOTS_DIETARY_ENGINE?.parseIngredientText?.(foodEvidence?.ingredientText || "");
    const result = root.ROOTS_DIETARY_ENGINE?.evaluateParsedProduct?.(parsed, profile || {}, { evaluatedAt: foodEvidence?.evaluatedAt });
    return { ...result, jainVerdict: root.ROOTS_JAIN_RELIABILITY?.fromDietaryResult?.(result, { sourceType: foodEvidence?.sourceType, ingredientCount: parsed?.ingredients?.length }) || null, effectiveProfile };
  }
  root.ROOTS_JAIN = Object.freeze({
    VERSION,
    isEnabled: (profile) => root.ROOTS_JAIN_PROFILE.isEnabled(profile),
    getSettings: (profile) => root.ROOTS_JAIN_PROFILE.getSettings(profile),
    getEffectiveProfile: (profile, context) => root.ROOTS_JAIN_EFFECTIVE_PROFILE.getEffectiveProfile({ profile, ...(context || {}) }),
    evaluateFood,
    evaluateIngredient: (ingredient, effectiveProfile) => root.ROOTS_DIETARY_ENGINE?.evaluateIngredient?.(ingredient, effectiveProfile?.sourceProfile || {}),
    getReliability: (evidence) => root.ROOTS_JAIN_RELIABILITY.getReliability(evidence),
    getCurrentObservance: (profile, date) => root.ROOTS_JAIN_OBSERVANCES.getActive(profile, date),
    getTodaySummary: todaySummary,
    searchKnowledge: (query, context) => root.ROOTS_JAIN_SEARCH.searchKnowledge(query, context),
    getIngredientEntry: (id, profile, status) => root.ROOTS_JAIN_INGREDIENTS.getEntry(id, profile, status),
    getRuleExplanation: (ruleId) => {
      const rule = root.ROOTS_JAIN_RULES.getRule(ruleId);
      const records = (root.ROOTS_JAIN_KNOWLEDGE.records || []).filter((item) => (item.ruleLinks || []).includes(ruleId));
      return rule ? { rule, records } : null;
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
