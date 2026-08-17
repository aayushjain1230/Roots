(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const verdictLabel = (value) => ({ CAUTION: "Eat with Caution", NEEDS_CONFIRMATION: "Needs Confirmation", BEST_CHOICE: "Best Choice", SAFE_WITH_MODIFICATION: "Can Be Modified" }[value] || clean(value).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()));
  const evidenceLabel = (reason) => reason.evidenceLevel === "confirmed" ? "Confirmed evidence" : reason.evidenceLevel === "likely" ? "Likely evidence" : "Needs confirmation";
  function sortedReasons(context) {
    const rank = { allergy: 0, declared_contains: 0, cross_contact: 1, religious: 2, medical: 3, digestive: 4, lifestyle: 5, custom_avoid: 6, source_dependent: 7, preference: 9 };
    return [...(context?.reasons || [])].sort((a, b) => (rank[a.category] ?? 8) - (rank[b.category] ?? 8));
  }
  function quick(context) {
    const reasons = sortedReasons(context);
    const first = reasons[0];
    const summary = first
      ? `${context.subject.displayName} is marked ${verdictLabel(context.verdict)} because ${first.text.replace(/[.!?]+$/, "")}.`
      : `${context.subject.displayName} is marked ${verdictLabel(context.verdict)} from the available deterministic evidence.`;
    const evidence = first ? `${evidenceLabel(first)}: ${first.evidenceType.replaceAll("_", " ")}.` : "No conflicting ingredient evidence was recorded.";
    return {
      schemaVersion: 1, mode: "quick", verdict: context.verdict,
      title: `Why ${context.subject.displayName} was flagged`,
      summary, evidence,
      reasons: reasons.map((reason) => ({ id: reason.id, title: reason.restrictionLabel, body: reason.text, evidenceLevel: reason.evidenceLevel })),
      importantWarnings: reasons.filter((reason) => reason.severity === "avoid" || reason.evidenceLevel !== "confirmed").map((reason) => reason.text),
      suggestedActions: root.ROOTS_VERIFICATION_QUESTIONS?.generate?.(context).slice(0, 1).map((item) => item.text) || [],
      deterministic: true,
    };
  }
  function simple(context) {
    const base = quick(context);
    const reasons = sortedReasons(context);
    return {
      ...base, mode: "simple",
      summary: reasons.length
        ? `${context.subject.displayName} may not fit your profile. ROOTS found ${reasons.length === 1 ? "one reason" : `${reasons.length} separate reasons`}. ${reasons[0].text} ${reasons[0].evidenceLevel === "confirmed" ? "This comes from confirmed evidence." : "Some information is still missing, so ROOTS is not calling it safe."}`
        : `${context.subject.displayName} has no recorded conflict in the available information.`,
    };
  }
  function detailedFallback(context) {
    const base = quick(context), reasons = sortedReasons(context);
    return {
      ...base, mode: "detailed",
      sections: [
        { id: "why", title: "Why this was flagged", body: reasons.map((reason) => `${reason.restrictionLabel}: ${reason.text}`).join(" ") || base.summary },
        { id: "what", title: "What it is", body: `${context.subject.displayName} is the term ROOTS evaluated from “${context.subject.originalTerm}”.` },
        { id: "evidence", title: "Evidence", body: reasons.map((reason) => `${evidenceLabel(reason)} from ${reason.evidenceType.replaceAll("_", " ")}.`).join(" ") || base.evidence },
        ...(context.aliases.length ? [{ id: "aliases", title: "Other names to watch for", body: context.aliases.join(", ") }] : []),
        ...(reasons.some((reason) => reason.evidenceLevel !== "confirmed") ? [{ id: "unknowns", title: "What remains uncertain", body: reasons.filter((reason) => reason.evidenceLevel !== "confirmed").map((reason) => reason.text).join(" ") }] : []),
        { id: "next", title: "What you can do next", body: (root.ROOTS_VERIFICATION_QUESTIONS?.generate?.(context) || []).map((item) => item.text).join(" ") || "Review the current label or menu evidence before deciding." },
      ],
      offline: true,
    };
  }
  function technical(context) {
    return {
      schemaVersion: 1, mode: "technical", verdict: context.verdict,
      title: `Evidence for ${context.subject.displayName}`,
      fields: {
        finalVerdict: context.verdict,
        canonicalId: context.subject.id || "unmatched",
        canonicalName: context.subject.canonicalName,
        originalLabelTerm: context.subject.originalTerm,
        aliases: context.aliases,
        regionalTerms: context.regionalTerms,
        sourceStatus: context.sourceStatus,
        quantityStatus: context.quantityStatus,
        preparationStatus: context.preparationStatus,
        crossContactStatus: context.crossContact.length ? "present" : "not_listed",
        certificationStatus: context.certification.length ? "evidence_present" : "not_listed",
        restrictions: context.reasons.map((reason) => reason.restrictionId),
        ruleTrace: context.ruleTrace,
        engineVersions: context.engine,
        evaluatedAt: context.evaluatedAt,
      },
      deterministic: true,
    };
  }
  root.ROOTS_EXPLANATION_TEMPLATES = { quick, simple, detailedFallback, technical, sortedReasons, verdictLabel };
})(typeof window !== "undefined" ? window : globalThis);
