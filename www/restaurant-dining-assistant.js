(function (root) {
  "use strict";
  const VERSION = 1, CACHE_KEY = "roots-dining-explanation-cache-v1", CACHE_LIMIT = 24;
  const clean = (value, limit = 4000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const list = (value) => Array.isArray(value) ? value : [];
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
  const hash = (value) => {
    let result = 2166136261;
    for (const character of JSON.stringify(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
  };
  const evidenceOf = (context) => list(context?.dish?.evidence || context?.evidence).map((item, index) => ({
    id: clean(item?.id || `evidence-${index}`, 180), level: clean(item?.level || "unknown", 40),
    source: clean(item?.source || "restaurant_evidence", 100), text: clean(item?.text || item?.label || item, 800),
    effect: clean(item?.effect || "", 40),
  })).filter((item) => item.text);
  function normalize(input) {
    const dish = input?.dish || input?.evaluation || null, summary = input?.summary || input?.restaurantSummary || null;
    return {
      schemaVersion: 1, restaurant: {
        id: clean(input?.restaurant?.id || input?.restaurant?.restaurantId || summary?.restaurantId, 180),
        name: clean(input?.restaurant?.name || summary?.restaurantName, 240),
        cuisine: clean(input?.restaurant?.cuisine, 120),
      },
      dish: dish ? {
        id: clean(dish.dishId || dish.id, 180), name: clean(dish.dishName || dish.name, 240),
        verdict: clean(dish.verdict, 50), summary: clean(dish.summary, 1000),
        evidence: evidenceOf({ dish }), unknowns: list(dish.unknowns).map((item) => ({ id: clean(item?.id || item?.evidenceId, 180), text: clean(item?.text || item, 800) })),
        modifications: list(dish.suggestedModifications).map((item) => clean(item?.instruction || item?.label || item, 500)),
        conflicts: list(dish.profileConflicts).map((item) => clean(item?.label || item, 500)),
        notes: list(dish.restaurantNotes).map((item) => clean(item?.text || item, 500)),
        ruleTrace: clone(list(dish.ruleTrace)), evidenceGraph: clone(dish.evidenceGraph || null),
      } : null,
      ranking: summary ? {
        category: clean(summary.matchCategory, 80), reasons: list(summary.topReasons).map((item) => clean(item, 500)),
        limitations: list(summary.limitations).map((item) => clean(item, 500)), evidenceLevel: clean(summary.evidence?.level, 40),
      } : null,
      profile: clone(input?.profile ? {
        id: input.profile.id, name: input.profile.name, religiousDiets: input.profile.religiousDiets,
        lifestyleDiets: input.profile.lifestyleDiets, allergies: input.profile.allergies,
        customRules: input.profile.customRules, dislikes: input.profile.dislikes, crossContact: input.profile.crossContact,
      } : input?.profileSnapshot || null),
      questions: clone(list(input?.questions)), sourceUpdatedAt: clean(input?.sourceUpdatedAt || input?.menu?.lastNormalizedAt, 80),
    };
  }
  function fallback(context, mode) {
    const dish = context.dish, ranking = context.ranking;
    if (dish) {
      const evidence = dish.evidence.map((item) => item.text);
      const parts = [dish.summary || `${dish.name} is currently marked ${dish.verdict.replaceAll("_", " ")}.`];
      if (dish.conflicts.length) parts.push(`Confirmed conflicts: ${dish.conflicts.join("; ")}.`);
      if (dish.unknowns.length) parts.push(`Still unknown: ${dish.unknowns.map((item) => item.text).join("; ")}.`);
      if (dish.modifications.length) parts.push(`Menu-supported changes: ${dish.modifications.join("; ")}.`);
      if (mode === "technical") parts.push(`${dish.ruleTrace.length} rule-trace step(s) are available below.`);
      return { answer: parts.join(" "), evidenceIds: dish.evidence.map((item) => item.id), evidence, offline: true };
    }
    if (ranking) return {
      answer: `${context.restaurant.name || "This restaurant"} is ranked ${ranking.category.replaceAll("_", " ")} because ${ranking.reasons.join("; ") || "the deterministic ranking evidence is limited"}. ${ranking.limitations.length ? `Limitations: ${ranking.limitations.join("; ")}.` : ""}`,
      evidenceIds: [], evidence: [...ranking.reasons, ...ranking.limitations], offline: true,
    };
    return { answer: "I don't know based on current restaurant information.", evidenceIds: [], evidence: [], offline: true };
  }
  const readCache = () => { try { const value = JSON.parse(localStorage.getItem(CACHE_KEY)); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const writeCache = (records) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(records.slice(0, CACHE_LIMIT))); } catch (_) { /* optional offline cache */ } };
  function prompt(context, question, mode, history) {
    return `You are ROOTS' restaurant explanation layer. The deterministic engine has already decided every verdict and ranking.
Never decide or change compatibility. Never infer ingredients, preparation, certification, cross-contact, confidence percentages, or substitutions.
Use only the JSON evidence below. If it does not answer the question, answer exactly: "I don't know based on current restaurant information."
Return strict JSON: {"answer":"plain text","evidenceIds":["only IDs present below"]}. Keep ${mode === "simple" ? "language understandable to a 12-year-old" : mode === "technical" ? "precise technical language that explains rules and unknown propagation" : "clear concise language"}.
Question: ${clean(question, 800)}
Current-session conversation: ${JSON.stringify(list(history).slice(-8).map((item) => ({ role: item.role, text: clean(item.text, 1200) })))}
Structured ROOTS context: ${JSON.stringify(context)}`;
  }
  async function explain(input, question, options) {
    const context = normalize(input), mode = options?.mode || "standard", fallbackResult = fallback(context, mode);
    if (!clean(question)) return fallbackResult;
    const key = hash({ context, question: clean(question), mode, history: list(options?.history).slice(-8) });
    const cached = readCache().find((item) => item.key === key);
    if (cached) return { ...cached.result, cached: true };
    if (root.navigator?.onLine === false || !root.BIJ_OCR?.generateText) return fallbackResult;
    let parsed;
    try {
      parsed = JSON.parse(await root.BIJ_OCR.generateText(prompt(context, question, mode, options?.history), { temperature: 0.1, json: true, task: "dining-explanation" }));
    } catch (_) { return fallbackResult; }
    const allowed = new Set(context.dish?.evidence.map((item) => item.id) || []);
    const evidenceIds = list(parsed?.evidenceIds).map((item) => clean(item, 180));
    if (!clean(parsed?.answer, 5000) || evidenceIds.some((id) => !allowed.has(id))) return fallbackResult;
    const result = { answer: clean(parsed.answer, 5000), evidenceIds, evidence: context.dish?.evidence.filter((item) => evidenceIds.includes(item.id)).map((item) => item.text) || [], offline: false };
    writeCache([{ key, result, createdAt: new Date().toISOString() }, ...readCache().filter((item) => item.key !== key)]);
    return result;
  }
  function followUps(input) {
    const context = normalize(input), questions = [];
    list(context.dish?.unknowns).forEach((item) => questions.push({ text: `What should I ask about ${item.text.replace(/[.!?]+$/, "")}?`, sourceId: item.id }));
    list(context.dish?.modifications).forEach((item, index) => questions.push({ text: `Why does this change help: ${item}?`, sourceId: `modification-${index}` }));
    if (context.ranking?.limitations.length) questions.push({ text: "What limits this restaurant ranking?", sourceId: "ranking-limitations" });
    return questions.slice(0, 6);
  }
  function session(input) {
    const context = normalize(input), messages = [];
    return {
      context, messages,
      async ask(question, options) {
        const text = clean(question, 800); if (!text) throw new TypeError("Enter a restaurant question.");
        messages.push({ role: "user", text });
        const result = await explain(context, text, { ...options, history: messages });
        messages.push({ role: "assistant", text: result.answer, evidenceIds: result.evidenceIds });
        if (messages.length > 16) messages.splice(0, messages.length - 16);
        return result;
      },
      clear() { messages.splice(0); },
    };
  }
  function serverResponse(question, response, reEvaluate) {
    const allowed = new Set(["confirmed_yes", "confirmed_no", "not_sure"]);
    if (!question?.id || !allowed.has(response)) throw new TypeError("A deterministic question and supported staff response are required.");
    const evidence = {
      id: `staff-response-${question.id}`, source: "restaurant_staff_response", level: response === "not_sure" ? "needs_confirmation" : "confirmed",
      text: response === "confirmed_yes" ? `Restaurant staff answered yes: ${question.question}` : response === "confirmed_no" ? `Restaurant staff answered no: ${question.question}` : `Restaurant staff could not confirm: ${question.question}`,
      sourceQuestionId: question.id, sourceEvidenceIds: list(question.sourceEvidenceIds), response,
    };
    return {
      evidence, recheckRequired: true,
      evaluation: typeof reEvaluate === "function" ? reEvaluate(evidence) : null,
      message: "The response was recorded as evidence. Compatibility changes only after the deterministic engine reevaluates it.",
    };
  }
  root.ROOTS_DINING_ASSISTANT = { normalize, explain, fallback, followUps, session, serverResponse, constants: { VERSION, CACHE_KEY, CACHE_LIMIT } };
})(typeof window !== "undefined" ? window : globalThis);
