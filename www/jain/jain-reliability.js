(function (root) {
  "use strict";
  const VERSION = 1;
  const VERDICTS = Object.freeze({ CAN_EAT: "You Can Eat This", CAN_EAT_WITH_CHANGES: "You Can Eat This With Changes", RISK: "Eat At Your Own Risk", DO_NOT_EAT: "Do Not Eat", NOT_ENOUGH: "Not Enough Information" });
  function reliability(evidence) {
    const e = evidence || {};
    if (e.offline && !e.cached) return "Limited Evidence";
    if (e.incomplete || e.unknownCount > 0 || e.sourceDependentUnknownCount > 0 || e.stale) return "Limited Evidence";
    if (e.directLabel || e.manufacturerConfirmed || e.completeIngredientList) return "Verified";
    return "Strong Evidence";
  }
  function fromDietaryResult(result, context) {
    const avoid = result?.avoidItems || [], caution = result?.cautionItems || [], unresolved = result?.unresolvedItems || [];
    const hasInsufficient = context?.insufficientEvidence || (!avoid.length && !caution.length && context?.ingredientCount === 0);
    let key = "CAN_EAT";
    if (hasInsufficient) key = "NOT_ENOUGH";
    else if (avoid.length) key = "DO_NOT_EAT";
    else if (caution.length || unresolved.length) key = "RISK";
    const changedByObservance = !!result?.jain?.changedByObservance;
    const label = changedByObservance && key === "DO_NOT_EAT" ? `Do Not Eat During ${result.jain.observanceId === "paryushan" ? "Paryushan" : "Current Observance"}` : VERDICTS[key];
    return { key, label, reliability: reliability({ completeIngredientList: !hasInsufficient, directLabel: context?.sourceType === "label" || context?.sourceType === "barcode", sourceDependentUnknownCount: caution.length, unknownCount: unresolved.length, offline: context?.offline, cached: context?.cached }), changedByObservance };
  }
  root.ROOTS_JAIN_RELIABILITY = Object.freeze({ VERSION, VERDICTS, getReliability: reliability, fromDietaryResult });
})(typeof window !== "undefined" ? window : globalThis);
