(function (root) {
  "use strict";
  const SET_INDEX = "roots-saved-question-set-index-v1", SET_PREFIX = "roots-saved-question-set-v1:", TRANSLATION_PREFIX = "roots-question-translation-v1:", LIMIT = 50;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value, limit = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const ids = () => { try { const value = JSON.parse(localStorage.getItem(SET_INDEX)); return Array.isArray(value) ? value.slice(0, LIMIT) : []; } catch (_) { return []; } };
  function validate(set) {
    if (!set?.id || set.schemaVersion !== 1 || !Array.isArray(set.questions) || set.questions.some((item) => !item.id || !item.question || !item.sourceEvidenceIds?.length)) throw new TypeError("Invalid deterministic question set.");
    return set;
  }
  function save(set, name) {
    const record = clone(validate(set)); record.name = clean(name || `${record.dish.name || "Restaurant"} Questions`, 120);
    if (!record.name) throw new TypeError("Question set name is required.");
    record.savedAt = new Date().toISOString();
    localStorage.setItem(SET_PREFIX + record.id, JSON.stringify(record));
    localStorage.setItem(SET_INDEX, JSON.stringify([record.id, ...ids().filter((item) => item !== record.id)].slice(0, LIMIT)));
    return clone(record);
  }
  function get(id) { try { const value = JSON.parse(localStorage.getItem(SET_PREFIX + id)); return value ? clone(validate(value)) : null; } catch (_) { return null; } }
  const list = () => ids().map(get).filter(Boolean);
  function remove(id) { localStorage.removeItem(SET_PREFIX + id); localStorage.setItem(SET_INDEX, JSON.stringify(ids().filter((item) => item !== id))); return true; }
  function translationKey(set, language) { return `${TRANSLATION_PREFIX}${set.id}:${clean(language, 20).toLowerCase()}`; }
  function saveTranslation(set, language, translated) {
    if (!Array.isArray(translated) || translated.length !== set.questions.length) throw new TypeError("Translation does not match the deterministic question set.");
    const record = { schemaVersion: 1, setId: set.id, language: clean(language, 20), questions: translated.map((item, index) => ({ id: set.questions[index].id, question: clean(item.question || item, 500), reason: clean(item.reason || set.questions[index].reason, 500) })), translatedAt: new Date().toISOString() };
    if (record.questions.some((item) => !item.question)) throw new TypeError("Translation is incomplete.");
    localStorage.setItem(translationKey(set, language), JSON.stringify(record)); return clone(record);
  }
  function getTranslation(set, language) { try { const value = JSON.parse(localStorage.getItem(translationKey(set, language))); return value?.schemaVersion === 1 ? clone(value) : null; } catch (_) { return null; } }
  root.ROOTS_QUESTION_STORAGE = { limit: LIMIT, keys: { SET_INDEX, SET_PREFIX, TRANSLATION_PREFIX }, save, get, list, remove, saveTranslation, getTranslation, validate };
})(typeof window !== "undefined" ? window : globalThis);
