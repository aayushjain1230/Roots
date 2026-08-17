(function (root) {
  "use strict";
  const active = new Map();
  const allowedModes = new Set(["detailed", "simple", "educational", "comparison"]);
  const clean = (value, limit = 6000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  function buildContext(subject, profile, evidence, options) {
    return root.ROOTS_EXPLANATION_CONTEXT.buildContext(subject, profile, evidence, options);
  }
  function getQuick(context) { return root.ROOTS_EXPLANATION_TEMPLATES.quick(context); }
  function getTechnical(context) { return root.ROOTS_EXPLANATION_TEMPLATES.technical(context); }
  function fallback(context, mode) { return mode === "simple" ? root.ROOTS_EXPLANATION_TEMPLATES.simple(context) : root.ROOTS_EXPLANATION_TEMPLATES.detailedFallback(context); }
  function validateOutput(context, output, mode) {
    if (!output || output.schemaVersion !== 1 || output.verdict !== context.verdict || output.grounding?.didNotChangeVerdict !== true) return null;
    const reasonIds = new Set(context.reasons.map((item) => item.restrictionId));
    const evidenceIds = new Set(context.evidence.map((item) => item.id));
    if ((output.grounding?.usedRestrictionIds || []).some((id) => !reasonIds.has(id))) return null;
    if ((output.grounding?.usedEvidenceIds || []).some((id) => !evidenceIds.has(id))) return null;
    const critical = context.reasons.filter((item) => item.severity === "avoid" || item.evidenceLevel !== "confirmed");
    const usedRestrictions = new Set(output.grounding?.usedRestrictionIds || []);
    const usedEvidence = new Set(output.grounding?.usedEvidenceIds || []);
    if (critical.some((item) => !usedRestrictions.has(item.restrictionId) || !usedEvidence.has(item.id))) return null;
    if (!clean(output.title, 300) || !clean(output.summary, 2500) || !Array.isArray(output.sections)) return null;
    if (critical.length && (output.importantWarnings || []).length < critical.length) return null;
    const text = JSON.stringify(output);
    if (/<\/?[a-z][\s\S]*>/i.test(text) || /\b(guaranteed safe|diagnos(?:e|is)|treatment plan|ignore previous|system prompt)\b/i.test(text)) return null;
    return {
      schemaVersion: 1, mode, verdict: context.verdict,
      title: clean(output.title, 300), summary: clean(output.summary, 2500),
      sections: output.sections.slice(0, 8).map((item, index) => ({ id: clean(item.id || `section-${index}`, 80), title: clean(item.title, 160), body: clean(item.body, 2500) })).filter((item) => item.title && item.body),
      importantWarnings: (output.importantWarnings || []).slice(0, 12).map((item) => clean(item, 800)),
      suggestedActions: (output.suggestedActions || []).slice(0, 8).map((item) => clean(item, 800)),
      grounding: output.grounding,
      deterministic: false,
    };
  }
  async function generate(context, mode, options) {
    if (!allowedModes.has(mode)) throw new TypeError("Unsupported explanation mode.");
    const language = options?.language || "en", cached = root.ROOTS_EXPLANATION_CACHE?.get(context, mode, language, 1);
    if (cached) return cached;
    const local = fallback(context, mode);
    if (root.navigator?.onLine === false || !root.BIJ_OCR?.explainEvidence) return { ...local, offline: true };
    const requestId = options?.requestId || `explain-${Date.now().toString(36)}`;
    const controller = new AbortController();
    active.get(requestId)?.abort();
    active.set(requestId, controller);
    options?.signal?.addEventListener?.("abort", () => controller.abort(), { once: true });
    let result = null;
    try {
      const response = await root.BIJ_OCR.explainEvidence({ mode, language, context }, { signal: controller.signal });
      result = validateOutput(context, response, mode);
    } catch (_) { result = null; }
    finally { active.delete(requestId); }
    if (!result) return { ...local, fallbackReason: "The longer explanation could not be validated." };
    root.ROOTS_EXPLANATION_CACHE?.set(context, mode, language, result, { promptVersion: 1 });
    return result;
  }
  const getDetailed = (context, options) => generate(context, "detailed", options);
  const getSimple = (context, options) => generate(context, "simple", options);
  function cancel(requestId) { const controller = active.get(requestId); controller?.abort(); active.delete(requestId); return !!controller; }
  async function translate(explanation, language, options) { return root.ROOTS_EXPLANATION_TRANSLATION.translate(explanation, language, options); }
  root.ROOTS_EXPLANATIONS = {
    buildContext, getQuick, getDetailed, getSimple, getTechnical, translate, cancel,
    clearCache: (options) => root.ROOTS_EXPLANATION_CACHE?.clear(options), validateOutput,
  };
})(typeof window !== "undefined" ? window : globalThis);
