(function (root) {
  "use strict";
  const list = (value) => Array.isArray(value) ? value : [];
  function validateAgainstProfile(candidate, profile) {
    const evaluation = candidate?.evaluation || candidate?.report?.evaluation;
    if (!evaluation || !["SAFE", "BEST_CHOICE", "COMPATIBLE"].includes(evaluation.verdict)) return { valid: false, reason: "This candidate has not been deterministically confirmed as compatible." };
    const sameProfile = !candidate?.profile?.id || !profile?.id || candidate.profile.id === profile.id;
    return sameProfile ? { valid: true, reason: "Previously evaluated as compatible for this profile." } : { valid: false, reason: "This candidate was checked with a different profile." };
  }
  function findForProduct(context, profile) {
    const saved = root.ROOTS_REPORT_ACTIONS?.getSavedProducts?.() || [];
    return saved.map((item) => ({ ...item, validation: validateAgainstProfile(item, profile) })).filter((item) => item.validation.valid).slice(0, 5);
  }
  function findForIngredient(context, profile) {
    return findForProduct(context, profile).filter((item) => !list(item.report?.evaluation?.summaryReasons).some((reason) => context.reasons.some((current) => current.restrictionId === reason.profileRuleId)));
  }
  function findForDish(context, profile, menu) {
    const dishes = list(menu?.report?.dishes || menu?.dishes);
    return dishes.filter((dish) => ["SAFE", "SAFE_WITH_MODIFICATION"].includes(dish.verdict)).map((dish) => ({
      id: dish.dishId, name: dish.dishName, verdict: dish.verdict, menuSupported: true,
      validation: { valid: true, reason: "This dish exists on the same analyzed menu and passed deterministic evaluation." },
    })).slice(0, 5);
  }
  root.ROOTS_ALTERNATIVES = { findForIngredient, findForProduct, findForDish, validateAgainstProfile };
})(typeof window !== "undefined" ? window : globalThis);
