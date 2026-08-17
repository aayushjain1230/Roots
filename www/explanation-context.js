(function (root) {
  "use strict";
  const VERSION = 1;
  const CONTEXT_TYPES = new Set(["ingredient", "product", "dish", "meal", "restaurant_ranking", "server_question"]);
  const VERDICTS = new Set(["SAFE", "CAUTION", "AVOID", "BEST_CHOICE", "COMPATIBLE", "SAFE_WITH_MODIFICATION", "NEEDS_CONFIRMATION", "EXCELLENT_MATCH", "GOOD_MATCH", "LIMITED_OPTIONS", "NEEDS_MORE_INFORMATION", "POOR_MATCH"]);
  const clean = (value, limit = 1000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const list = (value) => Array.isArray(value) ? value : [];
  const unique = (values, limit = 30) => [...new Set(values.filter(Boolean))].slice(0, limit);
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
  const evidenceType = (value) => {
    const type = clean(value, 80);
    if (["quantity_dependent", "nutrition_quantity"].includes(type)) return "quantity";
    if (type === "preparation_dependent") return "preparation";
    if (["certification", "certification_required"].includes(type)) return "certification";
    if (/cross_contact|shared_|declared_/.test(type)) return "cross_contact";
    if (type === "source_dependent") return "source";
    return "direct";
  };
  const readable = (value) => clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  function restrictionLabel(id) {
    return root.ROOTS_RESTRICTIONS?.getRestriction?.(id)?.label || readable(id);
  }
  function normalizeReason(reason, index) {
    return {
      id: clean(reason?.id || `reason-${index}`, 180),
      restrictionId: clean(reason?.profileRuleId || reason?.restrictionId || reason?.ruleId || "unknown", 180),
      restrictionLabel: restrictionLabel(reason?.profileRuleId || reason?.restrictionId || reason?.ruleId || "unknown"),
      category: clean(reason?.category || "unknown", 80),
      severity: clean(reason?.severity || "caution", 40),
      text: clean(reason?.label || reason?.text || "Review this evidence.", 1200),
      evidenceType: clean(reason?.evidenceType || "direct_ingredient", 80),
      evidenceKind: evidenceType(reason?.evidenceType),
      evidenceLevel: clean(reason?.evidenceLevel || "needs_confirmation", 60),
      ruleVersion: Number(reason?.ruleVersion || 1),
      userSettings: clone(reason?.userSettings || {}),
      evidenceValue: reason?.evidenceValue ?? null,
    };
  }
  function reasonsFrom(subject, evidence) {
    const reasons = list(subject?.reasons).length ? subject.reasons : list(evidence?.reasons);
    if (reasons.length) return reasons.slice(0, 30).map(normalizeReason);
    return list(subject?.evidence || evidence?.evidence).slice(0, 30).map((item, index) => normalizeReason({
      id: item?.id || `evidence-${index}`,
      profileRuleId: item?.restrictionId || item?.profileRuleId || item?.ruleId || item?.source || "restaurant_evidence",
      category: item?.category || (String(item?.source || "").includes("cross") ? "cross_contact" : "restaurant_evidence"),
      severity: item?.effect === "avoid" ? "avoid" : item?.effect === "preference" ? "preference" : "caution",
      label: item?.text || item?.label || item,
      evidenceType: item?.evidenceType || item?.source || "menu_evidence",
      evidenceLevel: item?.level || item?.evidenceLevel || "needs_confirmation",
    }, index));
  }
  function aliasesFor(subject) {
    const record = subject?.matchedIngredientId ? root.ROOTS_INGREDIENT_KNOWLEDGE?.byId?.get(subject.matchedIngredientId) : null;
    return unique([...(subject?.matchedAliases || []), ...(record?.aliases || [])].map((item) => clean(item, 120)), 20);
  }
  function relevantProfile(profile, reasons) {
    const ids = unique(reasons.map((reason) => reason.restrictionId).filter((id) => id && id !== "unknown"), 20);
    return {
      profileId: clean(profile?.id, 180),
      displayName: clean(profile?.name || "My Profile", 120),
      relevantRestrictions: ids.map((id) => {
        const selection = root.ROOTS_RESTRICTIONS?.getSelected?.(profile)?.find((item) => item.id === id);
        return { id, label: restrictionLabel(id), settings: clone(selection?.settings || {}) };
      }),
    };
  }
  function questionsFor(subject, reasons) {
    const supplied = list(subject?.verificationQuestions).map((item) => clean(item, 500));
    const generated = reasons.filter((reason) => reason.evidenceLevel !== "confirmed").map((reason) => {
      if (reason.evidenceKind === "source") return `Can the manufacturer confirm the source of ${clean(subject?.displayName || subject?.rawName || "this ingredient", 160)}?`;
      if (reason.evidenceKind === "quantity") return `What amount is present per serving?`;
      if (reason.evidenceKind === "preparation") return `How is this ingredient prepared?`;
      if (reason.evidenceKind === "certification") return `Is there a current certification that applies to this product?`;
      if (reason.evidenceKind === "cross_contact") return `What shared equipment or facility handling applies?`;
      return `Can this ingredient information be confirmed?`;
    });
    return unique([...supplied, ...generated], 8);
  }
  function buildContext(subject, profile, evidence, options) {
    const contextType = CONTEXT_TYPES.has(options?.contextType) ? options.contextType : "ingredient";
    const reasons = reasonsFrom(subject, evidence);
    const name = clean(subject?.displayName || subject?.dishName || subject?.name || subject?.rawName || "Unknown item", 240);
    const originalTerm = clean(subject?.rawName || subject?.originalTerm || subject?.nameOriginal || name, 500);
    const verdict = clean(subject?.status || subject?.verdict || evidence?.verdict || "CAUTION", 50).toUpperCase();
    const normalizedVerdict = VERDICTS.has(verdict) ? verdict : "CAUTION";
    const trace = list(subject?.phase6Handoff?.ruleTrace || subject?.ruleTrace || evidence?.ruleTrace).slice(0, 50).map((item, index) => ({
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      restrictionId: clean(item?.restrictionId || item?.profileRuleId, 180),
      ruleId: clean(item?.ruleId || item?.id, 180),
      evidenceId: clean(item?.evidenceId || "", 180),
      evidenceLevel: clean(item?.evidenceLevel || "needs_confirmation", 60),
      evidenceType: clean(item?.evidenceType || "direct_ingredient", 80),
      effect: clean(item?.effect || item?.severity, 50),
    }));
    const certificationRecords = list(subject?.certifications || evidence?.certifications).slice(0, 12).map((item, index) => normalizeReason({
      id: item?.id || `certification-${index}`,
      profileRuleId: item?.restrictionId || "certification_evidence",
      category: "certification",
      severity: "safe",
      label: item?.label || item?.name || item?.text || item,
      evidenceType: "certification",
      evidenceLevel: item?.status === "expired" || item?.stale === true ? "needs_confirmation" : "confirmed",
    }, index));
    const context = {
      schemaVersion: VERSION,
      contextType,
      subject: {
        id: clean(subject?.matchedIngredientId || subject?.dishId || subject?.id || subject?.normalizedName, 180),
        displayName: name,
        canonicalName: clean(subject?.normalizedName || name, 240),
        originalTerm,
      },
      verdict: normalizedVerdict,
      profile: relevantProfile(profile, reasons),
      reasons,
      evidence: reasons.map((reason) => ({
        id: reason.id, text: reason.text, source: reason.evidenceType,
        level: reason.evidenceLevel, kind: reason.evidenceKind,
      })),
      aliases: aliasesFor(subject),
      regionalTerms: unique(list(subject?.regionalTerms || subject?.phase6Handoff?.regionalTerminology).map((item) => clean(item, 120)), 12),
      sourceStatus: reasons.some((reason) => reason.evidenceKind === "source") ? "uncertain" : "not_applicable",
      quantityStatus: reasons.some((reason) => reason.evidenceKind === "quantity") ? "unknown_or_threshold_dependent" : "not_applicable",
      preparationStatus: reasons.some((reason) => reason.evidenceKind === "preparation") ? "uncertain" : "not_applicable",
      crossContact: reasons.filter((reason) => reason.evidenceKind === "cross_contact"),
      certification: [...reasons.filter((reason) => reason.evidenceKind === "certification"), ...certificationRecords],
      verificationQuestions: questionsFor(subject, reasons),
      ruleTrace: trace,
      engine: {
        dietaryVersion: Number(subject?.engineVersion || evidence?.engineVersion || 1),
        ingredientKnowledgeVersion: Number(subject?.ingredientKnowledgeVersion || evidence?.ingredientKnowledgeVersion || 1),
        restrictionVersion: Number(evidence?.restrictionSchemaVersion || 1),
      },
      evaluatedAt: clean(evidence?.evaluatedAt || options?.evaluatedAt, 80),
      metadata: {
        removable: options?.removable === true,
        removalResult: VERDICTS.has(options?.removalResult) ? options.removalResult : null,
        sourceFreshness: clean(options?.sourceFreshness || "", 80),
      },
    };
    return Object.freeze(context);
  }
  function forProduct(scan) {
    const evaluation = scan?.evaluation || {};
    const subject = {
      id: scan?.product?.barcode || scan?.product?.id || "product",
      displayName: scan?.product?.productName || scan?.product?.name || "Scanned Product",
      normalizedName: scan?.product?.productName || scan?.product?.name || "product",
      rawName: scan?.product?.productName || scan?.product?.name || "Scanned Product",
      status: evaluation.verdict,
      reasons: evaluation.summaryReasons || [],
      ruleTrace: evaluation.ruleTrace || [],
      certifications: evaluation.certifications || [],
      engineVersion: evaluation.engineVersion,
      ingredientKnowledgeVersion: evaluation.ingredientKnowledgeVersion,
    };
    return buildContext(subject, scan?.profile || root.ROOTS_PROFILE?.getActiveProfile?.(), evaluation, { contextType: "product", evaluatedAt: evaluation.evaluatedAt });
  }
  root.ROOTS_EXPLANATION_CONTEXT = { buildContext, forProduct, normalizeReason, evidenceType, constants: { VERSION, CONTEXT_TYPES: [...CONTEXT_TYPES], VERDICTS: [...VERDICTS] } };
})(typeof window !== "undefined" ? window : globalThis);
