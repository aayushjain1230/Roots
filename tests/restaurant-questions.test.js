"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
global.localStorage = new MemoryStorage();
require(path.join(__dirname, "..", "www", "restaurant-question-engine.js"));
require(path.join(__dirname, "..", "www", "restaurant-question-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-question-translation.js"));
require(path.join(__dirname, "..", "www", "restaurant-question-actions.js"));
const Engine = global.ROOTS_SERVER_QUESTIONS, Storage = global.ROOTS_QUESTION_STORAGE, Translation = global.ROOTS_QUESTION_TRANSLATION, Actions = global.ROOTS_QUESTION_ACTIONS;
const context = (profile = { id: "jain" }) => ({
  restaurant: { id: "rest-1", name: "Test Kitchen" }, dish: { id: "dish-1", name: "Vegetable Soup" }, profile,
  menu: { id: "menu-1", lastNormalizedAt: "2026-07-01T00:00:00Z" },
  meal: {
    id: "meal-1", selectedOptionIds: ["no-garlic"],
    main: { dishId: "dish-1", name: "Vegetable Soup", options: [{ id: "no-garlic", label: "No garlic", type: "resolution" }], evidence: { unknowns: [] } },
    analysis: {
      unknowns: [{ id: "unknown-broth", text: "Unknown broth ingredients" }],
      warnings: [{ id: "shared-fryer", text: "Possible shared fryer" }],
      evidence: [{ id: "prep-method", source: "preparation_uncertainty", text: "Preparation method is not documented" }],
    },
  },
});

test("questions originate only from evidence and preserve source IDs", () => {
  const set = Engine.generate(context());
  assert.ok(set.questions.length >= 3); assert.equal(set.deterministic, true);
  assert.ok(set.questions.every((item) => item.sourceEvidenceIds.length === 1));
  assert.ok(set.questions.some((item) => item.sourceEvidenceIds[0] === "unknown-broth"));
});
test("unknown broth, shared fryer, and selected change map to deterministic categories", () => {
  const set = Engine.generate(context());
  assert.ok(set.questions.some((item) => item.category === "Ingredients" && /broth/i.test(item.question)));
  assert.ok(set.questions.some((item) => item.category === "Cross Contact" && /dedicated fryer/i.test(item.question)));
  assert.ok(set.questions.some((item) => item.category === "Modifications" && /No garlic/i.test(item.question)));
});
test("priorities are ordered high before medium and low", () => {
  const set = Engine.generate(context()), order = set.questions.map((item) => Engine.constants.PRIORITIES[item.priority]);
  assert.deepEqual(order, order.slice().sort((a, b) => b - a));
});
test("safe evidence with no unresolved concern creates no question", () => {
  const set = Engine.generate({ restaurant: { id: "r", name: "R" }, dish: { id: "d", name: "D" }, analysis: { evidence: [{ id: "safe", source: "menu", text: "Confirmed vegetables" }] } });
  assert.equal(set.questions.length, 0);
});
test("multiple profiles cannot change questions without different evidence", () => {
  const jain = Engine.generate(context({ id: "jain" })).questions.map((item) => item.question);
  const vegan = Engine.generate(context({ id: "vegan" })).questions.map((item) => item.question);
  assert.deepEqual(jain, vegan);
});
test("question grouping uses required semantic sections", () => {
  const groups = Engine.group(Engine.generate(context()));
  assert.ok(groups.every((item) => Engine.constants.CATEGORIES.includes(item.category)));
  assert.ok(groups.some((item) => item.category === "Ingredients"));
});
test("saved sets validate evidence linkage and remain local", () => {
  localStorage.clear(); const set = Engine.generate(context()), saved = Storage.save(set, "My Jain Questions");
  assert.equal(Storage.get(saved.id).name, "My Jain Questions"); assert.equal(Storage.list().length, 1);
  assert.throws(() => Storage.save({ ...set, questions: [{ id: "x", question: "Invented?" }] }, "Bad"), /Invalid/);
});
test("translation sends only determined questions and preserves ids and count", async () => {
  localStorage.clear(); const set = Engine.generate(context()); let prompt = "";
  global.BIJ_OCR = { async generateText(value) { prompt = value; return JSON.stringify(set.questions.map((item) => ({ id: item.id, question: `ES: ${item.question}`, reason: `ES: ${item.reason}` }))); } };
  const result = await Translation.translate(set, "es");
  assert.equal(result.questions.length, set.questions.length); assert.deepEqual(result.questions.map((item) => item.id), set.questions.map((item) => item.id));
  assert.match(prompt, /Do not add, remove, combine, answer, or change dietary meaning/);
});
test("translation rejects added, removed, reordered, or renamed questions", async () => {
  localStorage.clear(); const set = Engine.generate(context());
  global.BIJ_OCR = { async generateText() { return JSON.stringify([{ id: "invented", question: "Invented concern", reason: "Bad" }]); } };
  await assert.rejects(() => Translation.translate(set, "fr"), /rejected|validated/);
});
test("cached translations remain available without a new Gemini call", async () => {
  localStorage.clear(); const set = Engine.generate(context()), translated = set.questions.map((item) => ({ id: item.id, question: `ES ${item.question}`, reason: item.reason }));
  Storage.saveTranslation(set, "es", translated); let calls = 0; global.BIJ_OCR = { async generateText() { calls += 1; } };
  const result = await Translation.translate(set, "es"); assert.equal(result.fromCache, true); assert.equal(calls, 0);
});
test("copy text contains questions but no internal evidence IDs", () => {
  const set = Engine.generate(context()), output = Actions.text(set);
  assert.match(output, /ROOTS Restaurant Questions/); assert.doesNotMatch(output, /unknown-broth|shared-fryer|question-/);
});
test("speech uses device synthesis and can be stopped", () => {
  let spoken = "", cancelled = 0;
  global.SpeechSynthesisUtterance = function (text) { this.text = text; };
  global.speechSynthesis = { speak: (utterance) => { spoken = utterance.text; }, cancel: () => { cancelled += 1; } };
  Actions.speak("Is this a dedicated fryer?", "en-US"); Actions.stop();
  assert.equal(spoken, "Is this a dedicated fryer?"); assert.ok(cancelled >= 2);
});
test("communication UI is escaped, labeled, printable, and keyboard accessible", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-communication-view.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "www", "styles.css"), "utf8");
  assert.match(html, /restaurant-communication-modal/); assert.match(ui, /aria-label=/); assert.match(ui, /esc\(shown\.question\)/);
  assert.match(ui, /event\.key === "Escape"/); assert.match(css, /@media print/); assert.match(css, /min-height: 48px/);
});
test("service worker caches Phase 4G-A code but not question records or translations", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  for (const file of ["restaurant-question-engine.js", "restaurant-question-storage.js", "restaurant-question-translation.js", "restaurant-question-actions.js", "restaurant-communication-view.js"]) assert.match(sw, new RegExp(file.replace(".", "\\.")));
  assert.match(sw, /roots-shell-v5c-1/); assert.doesNotMatch(sw, /roots-saved-question-set-v1:|roots-question-translation-v1:/);
});
test("deterministic engine contains no AI or network decision path", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-question-engine.js"), "utf8");
  assert.doesNotMatch(source, /Gemini|generateText|fetch\s*\(|generativelanguage/i);
});
