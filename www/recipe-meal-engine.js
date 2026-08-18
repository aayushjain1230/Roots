(function (root) {
  "use strict";
  const VERSION = 1;
  const clean = (value, limit = 20000) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, limit);

  function analyzeIngredients(text, profile) {
    const dietary = root.ROOTS_DIETARY_ENGINE;
    if (!dietary) throw new Error("The deterministic dietary engine is unavailable.");
    const parsed = dietary.parseIngredientText(clean(text));
    if (!parsed.ingredients?.length) return { version: VERSION, status: "VERIFY", evaluation: null, parsed, reason: "No ingredient list could be verified." };
    const storedProfile = profile || root.ROOTS_PROFILE?.getActiveProfile?.() || {};
    const effectiveProfile = root.ROOTS_DIETARY_FEATURES?.projectProfile?.(storedProfile) || storedProfile;
    const evaluation = dietary.evaluateParsedProduct(parsed, effectiveProfile);
    const hasRestrictions = [...(effectiveProfile.religiousDiets || []), ...(effectiveProfile.lifestyleDiets || [])].some((item) => item?.enabled)
      || (effectiveProfile.allergies || []).length > 0 || (effectiveProfile.customRules || []).length > 0;
    const unmatched = hasRestrictions && (evaluation.safeItems || []).some((item) => !item.matchedIngredientId);
    const status = evaluation.verdict === "AVOID" ? "CONFLICT"
      : evaluation.verdict === "SAFE" && !(evaluation.unresolvedItems || []).length && !unmatched ? "MATCH" : "VERIFY";
    return { version: VERSION, status, evaluation, parsed, reason: status === "MATCH" ? "No known conflicts were found in the listed ingredients." : status === "CONFLICT" ? evaluation.summaryReasons?.[0]?.label || "A profile conflict was found." : evaluation.summaryReasons?.[0]?.label || "Some ingredients need verification." };
  }

  function validateMealIdeas(items, profile) {
    return (Array.isArray(items) ? items : []).slice(0, 12).map((item, index) => {
      const ingredients = Array.isArray(item?.ingredients) ? item.ingredients.map((value) => clean(value, 240)).filter(Boolean).slice(0, 30) : [];
      const check = analyzeIngredients(ingredients.join(", "), profile);
      return {
        id: clean(item?.id, 120) || `meal-${index + 1}`,
        name: clean(item?.name, 200) || "Meal idea",
        reason: clean(item?.reason, 500), modification: clean(item?.modification, 500), ingredients,
        deterministicStatus: check.status, deterministicReason: check.reason,
        evaluation: check.evaluation,
      };
    });
  }

  root.ROOTS_RECIPE_MEAL_ENGINE = Object.freeze({ VERSION, analyzeIngredients, validateMealIdeas });
})(typeof window !== "undefined" ? window : globalThis);
