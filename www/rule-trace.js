(function (root) {
  "use strict";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function ingredientHandoff(result, context) {
    const reasons = clone(result?.reasons || []);
    return {
      schemaVersion: 1,
      ingredientName: result?.displayName || result?.rawName || "",
      canonicalIngredientId: result?.matchedIngredientId || null,
      originalLabelTerm: result?.rawName || "",
      verdict: result?.status || "CAUTION",
      activeRestrictionConflicts: reasons.map((item) => item.profileRuleId).filter(Boolean),
      aliases: clone(result?.matchedAliases || []),
      confirmedEvidence: reasons.filter((item) => item.evidenceLevel === "confirmed"),
      sourceUncertainty: reasons.filter((item) => item.evidenceType === "source_dependent"),
      quantityUncertainty: reasons.filter((item) => item.evidenceType === "quantity_dependent"),
      preparationUncertainty: reasons.filter((item) => item.evidenceType === "preparation_dependent"),
      crossContactEvidence: reasons.filter((item) => /cross_contact|shared_|declared_/.test(item.evidenceType || "")),
      certificationEvidence: reasons.filter((item) => item.evidenceType === "certification_required"),
      ruleTrace: reasons.map((item, index) => ({
        order: index, restrictionId: item.profileRuleId, ruleId: item.id,
        evidenceLevel: item.evidenceLevel, evidenceType: item.evidenceType, effect: item.severity,
      })),
      userSettings: clone(context?.userSettings || {}),
      regionalContext: context?.region || "",
      suggestedVerificationQuestions: clone(result?.verificationQuestions || []),
      engineVersion: result?.engineVersion || null,
    };
  }
  function attach(result, context) {
    return { ...result, phase6Handoff: ingredientHandoff(result, context) };
  }
  root.ROOTS_RULE_TRACE = { ingredientHandoff, attach };
})(typeof window !== "undefined" ? window : globalThis);
