(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  function text(set, translated) {
    const translations = new Map((translated?.questions || []).map((item) => [item.id, item]));
    return [
      "ROOTS Restaurant Questions", set.restaurant?.name || "", set.dish?.name || "", "",
      ...set.questions.map((item) => `${item.category} · ${item.priority.toUpperCase()}\n${translations.get(item.id)?.question || item.question}\nReason: ${translations.get(item.id)?.reason || item.reason}`),
      "", "These questions were generated from unresolved ROOTS evidence. Please confirm current ingredients and preparation with restaurant staff.",
    ].filter((value) => value !== "").join("\n\n");
  }
  async function copy(value) {
    const output = clean(value); if (!output) throw new TypeError("Nothing to copy.");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) await navigator.clipboard.writeText(output);
    else root.prompt?.("Copy these questions:", output);
    return output;
  }
  async function share(set, translated) {
    const output = text(set, translated);
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "ROOTS Restaurant Questions", text: output }); }
      catch (error) { if (error?.name !== "AbortError") throw error; }
    } else await copy(output);
    return output;
  }
  function speechAvailable() { return !!root.speechSynthesis && typeof root.SpeechSynthesisUtterance === "function"; }
  function speak(value, language) {
    if (!speechAvailable()) throw new Error("Text-to-speech is unavailable on this device.");
    root.speechSynthesis.cancel();
    const utterance = new root.SpeechSynthesisUtterance(clean(value)); utterance.lang = language || "en-US"; utterance.rate = 0.92;
    root.speechSynthesis.speak(utterance); return utterance;
  }
  function stop() { root.speechSynthesis?.cancel?.(); }
  function print() { root.print?.(); }
  root.ROOTS_QUESTION_ACTIONS = { text, copy, share, speak, stop, print, speechAvailable };
})(typeof window !== "undefined" ? window : globalThis);
