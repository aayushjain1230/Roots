(function (root) {
  "use strict";

  const VERSION = 1;
  const DECISIONS = Object.freeze({ MATCH: "MATCH", CONFLICT: "CONFLICT", VERIFY: "VERIFY" });

  function decide(input) {
    const evaluation = input?.evaluation || input || null;
    const evidence = input?.evidence || null;
    const unresolved = Array.isArray(evaluation?.unresolvedItems) ? evaluation.unresolvedItems : [];
    const evidenceConflicts = Array.isArray(evidence?.conflicts) ? evidence.conflicts : [];
    const hasIngredients = Array.isArray(input?.product?.ingredients) ? input.product.ingredients.length > 0 : Boolean(input?.product?.ingredientsText);
    let status = DECISIONS.VERIFY;
    let reason = "Material product information is incomplete.";

    if (evaluation?.verdict === "AVOID") {
      status = DECISIONS.CONFLICT;
      reason = evaluation.summaryReasons?.[0]?.message || "A known conflict was found for this profile.";
    } else if (evaluation?.verdict === "SAFE" && hasIngredients && unresolved.length === 0 && evidenceConflicts.length === 0) {
      status = DECISIONS.MATCH;
      reason = "No known conflicts were found in the available evidence.";
    } else if (evaluation) {
      reason = evaluation.summaryReasons?.[0]?.message || "One or more details still need verification.";
    }

    return Object.freeze({ version: VERSION, status, reason, legacyVerdict: evaluation?.verdict || null, unresolved, evidenceConflicts, decidedAt: input?.evaluatedAt || evaluation?.evaluatedAt || new Date().toISOString() });
  }

  root.ROOTS_DECISION_ENGINE = Object.freeze({ VERSION, DECISIONS, decide });
})(typeof window !== "undefined" ? window : globalThis);
