(function (root) {
  "use strict";

  const VERSION = 1;

  function sourcePresent(evidence, sourceType) {
    return Boolean(evidence?.claims?.some((claim) => claim?.source?.type === sourceType));
  }

  function resolve(input) {
    const decision = input?.decision || root.ROOTS_DECISION_ENGINE?.decide?.(input);
    const evidence = input?.evidence || null;
    const attempts = [
      { id: "current_label", label: "Current physical label", status: sourcePresent(evidence, "physical_label") ? "available" : "unavailable" },
      { id: "manufacturer", label: "Manufacturer information", status: sourcePresent(evidence, "manufacturer") ? "available" : "unavailable" },
      { id: "certification", label: "Certification", status: sourcePresent(evidence, "certification") ? "available" : "unavailable" },
      { id: "structured_dataset", label: "Structured product data", status: sourcePresent(evidence, "trusted_dataset") ? "available" : "unavailable" }
    ];
    const unresolved = Array.isArray(decision?.unresolved) ? decision.unresolved : [];
    const questions = unresolved.slice(0, 8).map((item) => ({
      id: item.id || item.canonicalId || "unknown",
      question: `Can you confirm the source and ingredients of ${item.displayName || item.name || item.canonicalId || "this ingredient"}?`,
      reason: item.reason || item.message || "This detail affects compatibility."
    }));
    (decision?.evidenceConflicts || []).slice(0, 4).forEach((conflict, index) => questions.push({ id: `evidence-conflict-${index}`, question: "Which source reflects the current product formulation?", reason: conflict.reason || "Available sources disagree." }));

    return Object.freeze({
      version: VERSION,
      status: decision?.status === "VERIFY" ? "STILL_NEEDS_VERIFICATION" : "RESOLVED",
      decision: decision?.status || "VERIFY",
      attempts: Object.freeze(attempts),
      questions: Object.freeze(questions),
      resolvedAt: decision?.status === "VERIFY" ? null : new Date().toISOString()
    });
  }

  root.ROOTS_RESOLUTION_ENGINE = Object.freeze({ VERSION, resolve });
})(typeof window !== "undefined" ? window : globalThis);
