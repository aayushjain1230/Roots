(function (root) {
  "use strict";
  const VERSION = 1, CACHE_PREFIX = "roots-dining-card-translation-v1:";
  const clean = (value, limit = 1000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const list = (value) => Array.isArray(value) ? value : [];
  function restrictions(profile) {
    const items = [];
    const definitions = [...list(root.ROOTS_PROFILE_DEFINITIONS?.religiousDiets), ...list(root.ROOTS_PROFILE_DEFINITIONS?.lifestyleDiets)];
    const label = (item) => clean(item?.label || definitions.find((definition) => definition.id === (item?.id || item))?.label || item?.id || item);
    list(profile?.religiousDiets).filter((item) => item.enabled !== false).forEach((item) => items.push(label(item)));
    list(profile?.lifestyleDiets).filter((item) => item.enabled !== false).forEach((item) => items.push(label(item)));
    list(profile?.allergies).forEach((item) => items.push(`${clean(item.label || item.id || item.normalizedTerm || item)} allergy`));
    list(profile?.customRules).filter((item) => item.severity !== "preference").forEach((item) => items.push(`${item.severity === "caution" ? "Ask about" : "Avoid"} ${clean(item.label || item.term || item)}`));
    return [...new Set(items.filter(Boolean))].slice(0, 16);
  }
  function generate(input) {
    const questionSet = input?.questionSet || root.ROOTS_SERVER_QUESTIONS?.generate(input) || { questions: [] };
    const limits = restrictions(input?.profile || {});
    return {
      schemaVersion: 1, version: VERSION, id: `dining-card-${Date.now().toString(36)}`,
      title: "ROOTS Dining Card", introduction: "Hello! I have dietary restrictions. Could you please help me confirm the following?",
      restrictions: limits, questions: list(questionSet.questions).map((item) => ({ id: item.id, text: clean(item.question, 500), sourceEvidenceIds: list(item.sourceEvidenceIds) })),
      thanks: "Thank you for helping me make an informed choice.",
      restaurant: { name: clean(input?.restaurant?.name || questionSet.restaurant?.name, 240) },
      deterministic: true, generatedAt: new Date().toISOString(),
    };
  }
  const cacheKey = (card, language) => `${CACHE_PREFIX}${card.id}:${language}`;
  async function translate(card, language) {
    const cached = localStorage.getItem(cacheKey(card, language));
    if (cached) { try { return JSON.parse(cached); } catch (_) { /* request a fresh translation */ } }
    if (root.navigator?.onLine === false) throw new Error("Connect to the internet to create this translation. Saved translations remain available offline.");
    const prompt = `Translate this ROOTS dining card into ${clean(language, 60)}. Preserve every restriction and question exactly in meaning. Do not add, remove, combine, answer, soften, or strengthen anything. Return strict JSON with the same keys and question IDs: ${JSON.stringify(card)}`;
    const parsed = JSON.parse(await root.BIJ_OCR.generateText(prompt, { temperature: 0, json: true, task: "dining-explanation" }));
    const validQuestions = list(parsed?.questions);
    if (parsed?.id !== card.id || list(parsed?.restrictions).length !== card.restrictions.length || validQuestions.length !== card.questions.length || validQuestions.some((item, index) => item.id !== card.questions[index].id)) throw new Error("The translation changed the card structure and was rejected.");
    const translated = { ...card, title: clean(parsed.title), introduction: clean(parsed.introduction), restrictions: list(parsed.restrictions).map((item) => clean(item)), questions: validQuestions.map((item, index) => ({ ...card.questions[index], text: clean(item.text, 500) })), thanks: clean(parsed.thanks), language: clean(language, 60) };
    localStorage.setItem(cacheKey(card, language), JSON.stringify(translated)); return translated;
  }
  root.ROOTS_DINING_CARD = { generate, translate, restrictions, constants: { VERSION, CACHE_PREFIX } };
})(typeof window !== "undefined" ? window : globalThis);
