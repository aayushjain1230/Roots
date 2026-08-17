(function (root) {
  "use strict";
  const LANGUAGES = Object.freeze({ es: "Spanish", fr: "French", hi: "Hindi", gu: "Gujarati", zh: "Chinese", ja: "Japanese", ar: "Arabic", he: "Hebrew", it: "Italian", de: "German", pt: "Portuguese", th: "Thai" });
  async function translate(set, language) {
    if (!LANGUAGES[language]) throw new TypeError("Unsupported language.");
    const cached = root.ROOTS_QUESTION_STORAGE.getTranslation(set, language); if (cached) return { ...cached, fromCache: true };
    if (typeof navigator !== "undefined" && navigator.onLine === false) { const error = new Error("Connect to translate new questions. Previously translated questions remain available offline."); error.code = "offline"; throw error; }
    if (!root.BIJ_OCR?.generateText) throw new Error("Translation is unavailable.");
    const payload = set.questions.map((item) => ({ id: item.id, question: item.question, reason: item.reason }));
    const prompt = `Translate the following already-determined restaurant questions into ${LANGUAGES[language]}. Do not add, remove, combine, answer, or change dietary meaning. Keep every id unchanged. Return only a JSON array with exactly ${payload.length} objects shaped {"id","question","reason"} in the same order.\n${JSON.stringify(payload)}`;
    const raw = await root.BIJ_OCR.generateText(prompt, { json: true, temperature: 0 });
    let parsed; try { parsed = JSON.parse(raw); } catch (_) { throw new Error("The translation response could not be validated."); }
    if (!Array.isArray(parsed) || parsed.length !== payload.length || parsed.some((item, index) => item.id !== payload[index].id || !item.question)) throw new Error("The translation changed the deterministic question structure and was rejected.");
    return { ...root.ROOTS_QUESTION_STORAGE.saveTranslation(set, language, parsed), fromCache: false };
  }
  root.ROOTS_QUESTION_TRANSLATION = { translate, languages: LANGUAGES };
})(typeof window !== "undefined" ? window : globalThis);
