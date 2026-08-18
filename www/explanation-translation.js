(function (root) {
  "use strict";
  const ALLOWED = new Set(["en", "es", "fr", "de", "hi", "gu", "zh", "ja", "ko", "ar", "he", "it", "pt"]);
  const languageName = (code) => ({ en: "English", es: "Spanish", fr: "French", de: "German", hi: "Hindi", gu: "Gujarati", zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic", he: "Hebrew", it: "Italian", pt: "Portuguese" }[code]);
  async function translate(explanation, language, options) {
    const code = String(language || "en").toLowerCase();
    if (!ALLOWED.has(code)) throw new TypeError("Unsupported explanation language.");
    if (code === "en") return { ...explanation, language: "en", translated: false };
    const context = options?.context;
    const cached = context && root.ROOTS_EXPLANATION_CACHE?.get(context, `translation:${explanation.mode}`, code, 1);
    if (cached) return cached;
    if (root.ROOTS_CONNECTIVITY?.get?.().offline === true || !root.BIJ_OCR?.translateStructured) throw new Error("Connect to translate this explanation.");
    const output = await root.BIJ_OCR.translateStructured(explanation, languageName(code), { signal: options?.signal, format: "explanation" });
    const result = validate(explanation, output, code);
    if (!result) throw new Error("The translation could not be validated.");
    if (context) root.ROOTS_EXPLANATION_CACHE?.set(context, `translation:${explanation.mode}`, code, result, { promptVersion: 1 });
    return result;
  }
  function validate(source, output, language) {
    if (!output || typeof output !== "object" || output.verdict !== source.verdict || output.schemaVersion !== source.schemaVersion) return null;
    if (source.importantWarnings?.length && output.importantWarnings?.length < source.importantWarnings.length) return null;
    return { ...output, language, translated: true, machineTranslated: true, sourceExplanation: source };
  }
  root.ROOTS_EXPLANATION_TRANSLATION = { translate, validate, constants: { ALLOWED: [...ALLOWED] } };
})(typeof window !== "undefined" ? window : globalThis);
