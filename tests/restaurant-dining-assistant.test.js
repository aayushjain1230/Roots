const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(ROOT, "www", name), "utf8");
function storage() {
  const values = new Map();
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), keys: () => [...values.keys()] };
}
function load(files, extra = {}) {
  const context = { console, Date, Math, JSON, Map, Set, localStorage: storage(), navigator: { onLine: true }, ...extra };
  context.globalThis = context; context.window = context;
  vm.createContext(context); files.forEach((file) => vm.runInContext(source(file), context, { filename: file })); return context;
}
const dish = {
  dishId: "ramen", dishName: "Vegetable Ramen", verdict: "NEEDS_CONFIRMATION", summary: "Broth and sauce need confirmation.",
  evidence: [
    { id: "broth", source: "menu_description", level: "needs_confirmation", effect: "uncertain", text: "Broth ingredients are unknown." },
    { id: "noodles", source: "restaurant_ingredient_list", level: "confirmed", effect: "safe", text: "Noodles are confirmed wheat noodles." },
  ],
  unknowns: [{ id: "broth", text: "Broth ingredients are unknown." }],
  suggestedModifications: [{ instruction: "Order without house sauce." }], profileConflicts: [], restaurantNotes: ["Shared kitchen"],
  ruleTrace: [{ ruleId: "unknown-propagation", evidenceId: "broth", effect: "needs_confirmation" }],
};
test("offline dish explanation is derived from deterministic evidence", () => {
  const ctx = load(["restaurant-dining-assistant.js"], { navigator: { onLine: false } });
  const result = ctx.ROOTS_DINING_ASSISTANT.fallback(ctx.ROOTS_DINING_ASSISTANT.normalize({ dish }), "standard");
  assert.match(result.answer, /Broth and sauce need confirmation/); assert.match(result.answer, /Broth ingredients are unknown/);
  assert.deepEqual(Array.from(result.evidenceIds), ["broth", "noodles"]);
});
test("Gemini explanation rejects citations outside supplied evidence", async () => {
  const ctx = load(["restaurant-dining-assistant.js"], { BIJ_OCR: { generateText: async () => JSON.stringify({ answer: "Invented claim", evidenceIds: ["invented"] }) } });
  const result = await ctx.ROOTS_DINING_ASSISTANT.explain({ dish }, "Why?");
  assert.doesNotMatch(result.answer, /Invented/); assert.equal(result.offline, true);
});
test("valid AI explanation is cached without persisting conversation", async () => {
  let calls = 0;
  const ctx = load(["restaurant-dining-assistant.js"], { BIJ_OCR: { generateText: async () => { calls++; return JSON.stringify({ answer: "The broth is not documented.", evidenceIds: ["broth"] }); } } });
  await ctx.ROOTS_DINING_ASSISTANT.explain({ dish }, "Why?");
  await ctx.ROOTS_DINING_ASSISTANT.explain({ dish }, "Why?");
  const session = ctx.ROOTS_DINING_ASSISTANT.session({ dish }); await session.ask("Explain that.");
  assert.equal(calls, 2); assert.equal(session.messages.length, 2);
  assert.ok(ctx.localStorage.keys().every((key) => !/conversation|session/i.test(key)));
});
test("suggested follow-ups originate from unknowns, modifications, or ranking limitations", () => {
  const ctx = load(["restaurant-dining-assistant.js"]);
  const items = ctx.ROOTS_DINING_ASSISTANT.followUps({ dish });
  assert.ok(items.some((item) => item.sourceId === "broth")); assert.ok(items.every((item) => item.sourceId));
});
test("staff responses remain structured evidence and require deterministic recheck", () => {
  const ctx = load(["restaurant-dining-assistant.js"]);
  const question = { id: "q1", question: "Is there a dedicated fryer?", sourceEvidenceIds: ["fryer"] };
  const result = ctx.ROOTS_DINING_ASSISTANT.serverResponse(question, "confirmed_yes", (evidence) => ({ verdict: evidence.response === "confirmed_yes" ? "SAFE" : "NEEDS_CONFIRMATION" }));
  assert.equal(result.evidence.source, "restaurant_staff_response"); assert.equal(result.recheckRequired, true); assert.equal(result.evaluation.verdict, "SAFE");
  assert.throws(() => ctx.ROOTS_DINING_ASSISTANT.serverResponse(question, "maybe"));
});
test("dining cards contain profile restrictions and deterministic server questions", () => {
  const ctx = load(["restaurant-dining-card.js"], { ROOTS_SERVER_QUESTIONS: { generate: () => ({ restaurant: { name: "Cafe" }, questions: [{ id: "q", question: "Does the sauce contain egg?", sourceEvidenceIds: ["egg"] }] }) } });
  const card = ctx.ROOTS_DINING_CARD.generate({ restaurant: { name: "Cafe" }, profile: { religiousDiets: ["strict_jain"], allergies: [{ id: "milk", label: "Milk" }] } });
  assert.ok(card.restrictions.includes("strict_jain")); assert.ok(card.restrictions.includes("Milk allergy"));
  assert.equal(card.questions[0].sourceEvidenceIds[0], "egg"); assert.equal(card.deterministic, true);
});
test("card translation rejects changed question structure", async () => {
  const ctx = load(["restaurant-dining-card.js"], { BIJ_OCR: { generateText: async () => JSON.stringify({ id: "wrong", questions: [] }) } });
  const card = ctx.ROOTS_DINING_CARD.generate({ profile: {} });
  await assert.rejects(() => ctx.ROOTS_DINING_CARD.translate(card, "Spanish"), /rejected/);
});
test("ingredient explorer exposes aliases, conflicts, and source uncertainty", () => {
  const ctx = load(["ingredient-knowledge.js", "restaurant-ingredient-explorer.js"]);
  const rennet = ctx.ROOTS_INGREDIENT_EXPLORER.get("rennet"), mirin = ctx.ROOTS_INGREDIENT_EXPLORER.get("mirin");
  assert.match(rennet.uncertainty, /source must be confirmed/i); assert.ok(mirin.conflicts.includes("Halal"));
  assert.match(mirin.explanation, /alcohol/i);
});
test("Dining Assistant UI includes decision tree, modes, card layouts, glossary, and accessibility", () => {
  const html = source("index.html"), view = source("restaurant-dining-assistant-view.js"), css = source("styles.css");
  assert.match(html, /dining-assistant-modal/); assert.match(view, /Decision Tree/); assert.match(view, /Explain Like I'm 12/);
  assert.match(view, /Technical Explanation/); assert.match(view, /Printable portrait/); assert.match(view, /Restaurant Glossary & Ingredient Explorer/);
  assert.match(view, /Restaurant Conversation/); assert.match(view, /data-server-response/);
  assert.match(view, /role="log"/); assert.match(view, /aria-live="polite"/); assert.match(css, /prefers-reduced-motion/);
});
test("restaurant and dish pages expose Ask ROOTS without changing verdict code", () => {
  assert.match(source("restaurant-detail-view.js"), /data-detail-action="ask-roots"/);
  assert.match(source("restaurant-order-builder.js"), /data-order-action="ask-roots"/);
  assert.doesNotMatch(source("restaurant-dining-assistant.js"), /verdict\s*=\s*["'](?:SAFE|AVOID|NEEDS_CONFIRMATION)/);
});
test("service worker caches assistant modules but not conversation or explanation records", () => {
  const sw = source("sw.js");
  ["restaurant-dining-assistant.js", "restaurant-dining-card.js", "restaurant-ingredient-explorer.js", "restaurant-dining-assistant-view.js"].forEach((file) => assert.match(sw, new RegExp(file.replaceAll(".", "\\."))));
  assert.match(sw, /roots-shell-v5c-1/); assert.doesNotMatch(sw, /roots-dining-explanation-cache-v1|roots-dining-card-translation-v1:/);
});
