(function (root) {
  "use strict";
  const VERSION = 1;
  const clean = (value, limit = 2000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

  function build(options) {
    const scan = options?.scan || root.ROOTS_SCAN_PIPELINE?.getCurrent?.() || null;
    const profile = options?.profile || root.ROOTS_PROFILE?.getActiveProfile?.() || null;
    const evidence = (scan?.evidence?.claims || []).slice(0, 30).map((claim) => ({
      id: clean(claim.id, 180), predicate: clean(claim.predicate, 120), value: clean(claim.object, 4000),
      sourceType: clean(claim.source?.type, 80), sourceTier: clean(claim.source?.tier, 4),
      direction: clean(claim.direction, 20), level: clean(claim.level, 40), observedAt: claim.observedAt || null,
    }));
    const unresolved = (scan?.decision?.unresolved || []).slice(0, 20).map((item) => ({
      id: clean(item.id || item.canonicalId || item.normalizedName, 180),
      name: clean(item.displayName || item.rawName || item.name, 240),
      reason: clean(item.reason || item.reasons?.[0]?.label, 1000),
    }));
    const questions = (scan?.resolution?.questions || []).slice(0, 12).map((item) => ({ id: clean(item.id, 180), question: clean(item.question, 1000), reason: clean(item.reason, 1000) }));
    const effective = profile ? root.ROOTS_EFFECTIVE_RULES?.expand?.(profile) || null : null;
    const jainEffective = profile ? root.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile?.({ profile }) || null : null;
    const jainContext = jainEffective?.jainEnabled ? {
      diet: "jain",
      tradition: jainEffective.tradition,
      effectiveRuleIds: jainEffective.effectiveRules.map((rule) => rule.id),
      activeObservance: jainEffective.activeObservance?.id || null,
      observanceDay: jainEffective.activeObservance?.day || null,
      retrievedKnowledgeIds: root.ROOTS_JAIN_SEARCH?.searchKnowledge?.(options?.question || scan?.decision?.reason || "", { limit: 4 }).map((record) => record.id) || [],
    } : null;
    return Object.freeze({
      schemaVersion: VERSION,
      contextType: scan ? "product_scan" : "general_education",
      profile: profile ? { id: profile.id || null, name: clean(profile.name, 160), effectiveRules: clone(effective), jain: clone(jainContext) } : null,
      subject: scan ? { name: clean(scan.product?.productName || "Scanned product", 300), brand: clean(scan.product?.brand, 200), barcode: clean(scan.product?.barcode, 32) } : null,
      decision: scan?.decision ? { status: scan.decision.status, reason: clean(scan.decision.reason, 1200) } : null,
      deterministicVerdict: scan?.evaluation?.verdict || null,
      evidence, unresolved, resolutionQuestions: questions,
      allowedEvidenceIds: evidence.map((item) => item.id),
    });
  }

  function validateResponse(raw, context) {
    let value = raw;
    if (typeof raw === "string") {
      try { value = JSON.parse(raw); } catch (_) { return null; }
    }
    if (!value || typeof value !== "object") return null;
    const answer = clean(value.answer, 6000);
    const used = Array.isArray(value.usedEvidenceIds) ? value.usedEvidenceIds.map((item) => clean(item, 180)).filter(Boolean) : [];
    const allowed = new Set(context?.allowedEvidenceIds || []);
    if (!answer || used.some((id) => !allowed.has(id))) return null;
    if (/\b(?:guaranteed safe|100% safe|definitely safe|ignore (?:the|your) label)\b/i.test(answer)) return null;
    if (context?.decision?.status && new RegExp(`\\b(?:decision|verdict)\\s*(?:is|:)\\s*(?!${context.decision.status})`, "i").test(answer)) return null;
    return Object.freeze({ answer, usedEvidenceIds: used, unknownsAcknowledged: value.unknownsAcknowledged === true });
  }

  function fallback(context) {
    if (!context?.decision) return "I can explain general ingredient information, but I need a scan or restaurant evidence before making a profile-specific claim.";
    const unknown = context.unresolved?.[0];
    return [context.decision.reason, unknown ? `${unknown.name || "One ingredient"} still needs confirmation.` : "", context.resolutionQuestions?.[0]?.question || ""].filter(Boolean).join(" ");
  }

  root.ROOTS_ASK_CONTEXT = Object.freeze({ VERSION, build, validateResponse, fallback });
})(typeof window !== "undefined" ? window : globalThis);
