(function (root) {
  "use strict";
  const VERSION = 1;
  const CATEGORIES = Object.freeze(["Ingredients", "Preparation", "Cross Contact", "Modifications", "Other"]);
  const PRIORITIES = Object.freeze({ high: 3, medium: 2, low: 1 });
  const clean = (value, limit = 1000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const list = (value) => Array.isArray(value) ? value : [];
  const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  function source(item, fallback, index) {
    return {
      id: clean(item?.id || item?.evidenceId || `${fallback}-${index}`, 180),
      type: clean(item?.source || item?.type || fallback, 80),
      text: clean(item?.text || item?.message || item?.label || item?.ingredient || item, 1000),
      effect: clean(item?.effect || item?.level || "", 40),
    };
  }
  function question(id, category, priority, text, reason, evidence) {
    if (!CATEGORIES.includes(category) || !PRIORITIES[priority] || !clean(text) || !evidence?.id) return null;
    return {
      schemaVersion: 1, id: `question-${slug(id || text)}`, category, priority,
      question: clean(text, 500), reason: clean(reason, 500),
      sourceEvidenceIds: [evidence.id], sourceEvidence: [evidence],
    };
  }
  function ingredientQuestion(evidence, index) {
    const value = evidence.text.toLowerCase();
    const subject = /\bbroth\b/.test(value) ? "broth" : /\bsauce\b/.test(value) ? "sauce" : /\bseasoning\b/.test(value) ? "seasoning" : /\bdressing\b/.test(value) ? "dressing" : /\bbutter\b/.test(value) ? "butter" : /\begg\b/.test(value) ? "egg" : clean(evidence.text.replace(/^(unknown|possible|unconfirmed)\s*/i, ""), 100);
    if (!subject) return null;
    return question(`ingredient-${evidence.id}-${index}`, "Ingredients", "high", `What ingredients are used in the ${subject}?`, `ROOTS could not confirm the ${subject}'s ingredients.`, evidence);
  }
  function warningQuestion(evidence, index) {
    const value = evidence.text.toLowerCase();
    if (/\b(fryer|fried|frying)\b/.test(value)) return question(`fryer-${evidence.id}-${index}`, "Cross Contact", "high", "Is this cooked in a dedicated fryer?", "The available evidence does not confirm fryer separation.", evidence);
    if (/\b(shared|cross[- ]?contact|same equipment|utensil|prep area|grill)\b/.test(value)) return question(`cross-${evidence.id}-${index}`, "Cross Contact", "high", "Can this be prepared using separate utensils and a separate preparation area?", "The available evidence identifies possible shared preparation.", evidence);
    if (/\b(prepar|method|cooked|kitchen)\b/.test(value)) return question(`prep-${evidence.id}-${index}`, "Preparation", "medium", "How is this dish prepared?", "The preparation method is not fully documented.", evidence);
    return question(`other-${evidence.id}-${index}`, "Other", "low", `Could you please confirm: ${evidence.text.replace(/[?.!]+$/, "")}?`, "ROOTS identified an unresolved menu detail.", evidence);
  }
  function modificationQuestion(modifier, index) {
    const evidence = source({ ...modifier, source: "selected_menu_modifier" }, "selected-modifier", index);
    const label = clean(modifier?.label || modifier?.instruction || modifier, 300).replace(/[.!]+$/, "");
    if (!label) return null;
    return question(`modifier-${evidence.id}-${index}`, "Modifications", "medium", `Can this dish be prepared with this requested change: ${label}?`, "This change is part of the selected order and should be confirmed with staff.", evidence);
  }
  function generate(context) {
    const analysis = context?.meal?.analysis || context?.analysis || context?.evaluation || {};
    const dishEvidence = context?.dishEvidence || context?.meal?.main?.evidence || {};
    const unknowns = [...list(analysis.unknowns), ...list(dishEvidence.unknowns)].map((item, index) => source(item, "unknown", index));
    const relevantEvidence = list(analysis.evidence).filter((item) => /cross_contact|preparation|uncertain|unknown/i.test(String(item?.source || item?.effect || "")));
    const warnings = [...list(analysis.warnings), ...list(dishEvidence.warnings), ...list(analysis.crossContactConcerns), ...relevantEvidence].map((item, index) => source(item, "warning", index));
    const modifiers = list(context?.selectedModifiers).length ? list(context.selectedModifiers) : list(context?.meal?.main?.options).filter((item) => list(context?.meal?.selectedOptionIds).includes(item.id));
    const generated = [
      ...unknowns.map(ingredientQuestion),
      ...warnings.map(warningQuestion),
      ...modifiers.map(modificationQuestion),
    ].filter(Boolean);
    const seen = new Set();
    const questions = generated.filter((item) => {
      const key = `${item.category}|${item.question.toLowerCase()}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).sort((a, b) => PRIORITIES[b.priority] - PRIORITIES[a.priority] || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
    return {
      schemaVersion: 1, engineVersion: VERSION,
      id: `question-set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      restaurant: { id: clean(context?.restaurant?.id || context?.restaurant?.restaurantId, 180), name: clean(context?.restaurant?.name, 200) },
      dish: { id: clean(context?.dish?.id || context?.meal?.main?.dishId || context?.meal?.mainDishId, 180), name: clean(context?.dish?.name || context?.meal?.main?.name || context?.meal?.mainDishName, 240) },
      sourceContext: {
        mealId: clean(context?.meal?.id || context?.savedMealId, 180), profileId: clean(context?.profile?.id || context?.profile?.profileId, 180),
        menuId: clean(context?.menu?.id || context?.menu?.menuId, 180), menuUpdatedAt: clean(context?.menu?.lastNormalizedAt || context?.menu?.menuUpdatedAt, 80),
      },
      questions, generatedAt: new Date().toISOString(), deterministic: true,
    };
  }
  function group(set) {
    return CATEGORIES.map((category) => ({ category, questions: list(set?.questions).filter((item) => item.category === category) })).filter((item) => item.questions.length);
  }
  root.ROOTS_SERVER_QUESTIONS = { generate, group, constants: { VERSION, CATEGORIES, PRIORITIES } };
})(typeof window !== "undefined" ? window : globalThis);
