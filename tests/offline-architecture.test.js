"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.join(__dirname, ".."), read = (file) => fs.readFileSync(path.join(ROOT, "www", file), "utf8");
function storage(initial = {}) { const data = new Map(Object.entries(initial)); return { get length() { return data.size; }, key: (index) => [...data.keys()][index] || null, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), dump: () => data }; }
class FakeCustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
function makeContext(extra = {}) {
  const listeners = new Map();
  const context = { console, Date, Math, JSON, Map, Set, Promise, TextEncoder, Uint8Array, Blob, localStorage: storage(), navigator: { onLine: true }, CustomEvent: FakeCustomEvent, setTimeout, clearTimeout,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach((listener) => listener(event)); return true; }, ...extra };
  context.window = context; context.globalThis = context; vm.createContext(context); return context;
}
function load(files, extra) { const context = makeContext(extra); files.forEach((file) => vm.runInContext(read(file), context, { filename: file })); return context; }

test("connectivity tracks state, last online time, and restoration events", () => {
  const context = load(["connectivity.js"]), events = [];
  context.addEventListener("roots:connectionlost", () => events.push("lost")); context.addEventListener("roots:connectionrestored", () => events.push("restored"));
  context.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  assert.equal(context.ROOTS_CONNECTIVITY.get().offline, true); assert.ok(context.ROOTS_CONNECTIVITY.get().lastKnownOnlineAt);
  context.ROOTS_CONNECTIVITY.setForTesting("ONLINE");
  assert.deepEqual(events, ["lost", "restored"]); assert.ok(context.localStorage.getItem("roots-connectivity-meta-v1"));
});

test("durable sync queue retries independently and resolves conflicts deterministically", async () => {
  const context = load(["connectivity.js", "sync-queue.js"]), calls = [];
  context.ROOTS_SYNC_QUEUE.enqueue("profile", { id: "p1", version: 2 }, { id: "profile-1" });
  context.ROOTS_SYNC_QUEUE.enqueue("saved_item", { id: "s1" }, { id: "saved-1" });
  context.ROOTS_SYNC_QUEUE.registerProcessor("profile", async () => { calls.push("profile"); throw Object.assign(new Error("temporary"), { code: "upstream" }); });
  context.ROOTS_SYNC_QUEUE.registerProcessor("saved_item", async () => { calls.push("saved"); });
  const result = await context.ROOTS_SYNC_QUEUE.process();
  assert.deepEqual(new Set(calls), new Set(["profile", "saved"])); assert.equal(result.failed, 1); assert.equal(result.processed, 1);
  const items = context.ROOTS_SYNC_QUEUE.getItems(); assert.equal(items.find((item) => item.id === "profile-1").syncStatus, "FAILED");
  assert.equal(context.ROOTS_SYNC_QUEUE.resolveConflict({ version: 3, updatedAt: "2026-01-01" }, { version: 2, updatedAt: "2027-01-01" }).winner, "local");
  assert.equal(context.ROOTS_SYNC_QUEUE.resolveConflict({ version: 1, updatedAt: "2026-01-01", name: "A" }, { version: 1, updatedAt: "2026-01-01", name: "B" }).status, "needs_review");
});

test("knowledge pack install is validated, atomic, versioned, and reversible", () => {
  const context = load(["offline-knowledge.js"], { ROOTS_INGREDIENT_KNOWLEDGE: { version: 4, records: [{ id: "garlic" }] }, ROOTS_INGREDIENT_PARSER: { clearNormalizationCache() {} } });
  const first = { schemaVersion: 1, version: "2026.08.1", source: "roots_official", updatedAt: "2026-08-09T00:00:00Z", records: [{ id: "groundnut", label: "Groundnut", aliases: ["earth nut"], categories: ["peanut"], allergens: ["peanut"], ocrVariants: { "ground nul": "groundnut" } }] };
  context.ROOTS_OFFLINE_KNOWLEDGE.install(first); assert.equal(context.ROOTS_OFFLINE_KNOWLEDGE.getStatus().version, "2026.08.1"); assert.equal(context.ROOTS_OFFLINE_KNOWLEDGE.findAlias("earth nut").id, "groundnut");
  assert.throws(() => context.ROOTS_OFFLINE_KNOWLEDGE.install({ ...first, source: "unknown" }), /metadata/);
  context.ROOTS_OFFLINE_KNOWLEDGE.install({ ...first, version: "2026.09.1", records: [] }); assert.equal(context.ROOTS_OFFLINE_KNOWLEDGE.rollback(), true); assert.equal(context.ROOTS_OFFLINE_KNOWLEDGE.getStatus().version, "2026.08.1");
});

test("offline menu photos use local OCR and retain uncertainty", async () => {
  const context = load(["connectivity.js", "restaurant-menu-ocr.js"], {
    BIJ_OCR: { localOcrAvailable: () => true, extractLocal: async () => ({ detectedLanguage: "en", originalText: "Vegetable Curry\nBroth and spices", extractionWarnings: [{ code: "local_ocr_unverified" }] }) },
    ROOTS_PERFORMANCE: { startTask: () => "task", endTask() {} }, FormData: class FormData {}, btoa: () => "",
  });
  context.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  const [page] = await context.ROOTS_MENU_OCR.processPages([{ id: "p1", order: 0, contentHash: "hash", file: {} }]);
  assert.equal(page.extractionProvider, "local_device_ocr"); assert.match(page.originalText, /Vegetable Curry/); assert.ok(page.warnings.includes("local_ocr_unverified")); assert.equal(page.textBlocks[0].confidenceCategory, "uncertain");
});

test("cached barcode metadata remains usable but explicitly requests current-label verification", async () => {
  const cached = { "123": { found: true, code: "123", name: "Cached", rawIngredientText: "sugar", ingredients: ["sugar"], verifiedAt: "2025-01-01T00:00:00.000Z" } };
  const context = load(["connectivity.js", "foodfacts.js"], { localStorage: storage({ "bij-product-cache-v1": JSON.stringify(cached) }), fetch: async () => { throw new Error("network used"); } });
  context.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  const result = await context.BIJ_FOODFACTS.lookup("123"); assert.equal(result.fromCache, true); assert.equal(result.offline, true); assert.equal(result.cacheFreshness, "stale"); assert.equal(result.needsLabelVerification, true);
  await assert.rejects(() => context.BIJ_FOODFACTS.lookup("999"), (error) => error.code === "BARCODE_OFFLINE_MISS" && error.alternativeActions.includes("scan_label"));
});

test("formulation comparison preserves a local event and queues only real changes", () => {
  const context = load(["connectivity.js", "sync-queue.js", "formulation-tracker.js"]);
  context.ROOTS_FORMULATION_TRACKER.begin({ code: "123", name: "Snack", rawIngredientText: "sugar, salt", verifiedAt: "2026-01-01" });
  const event = context.ROOTS_FORMULATION_TRACKER.compare("sugar, salt, peanut");
  assert.equal(event.changed, true); assert.equal(event.source, "physical_label"); assert.equal(context.ROOTS_FORMULATION_TRACKER.getEvents().length, 1);
  assert.equal(context.ROOTS_SYNC_QUEUE.getItems()[0].type, "formulation_change");
});

test("offline profile questions cover configured Jain rules and Big 9 allergies", () => {
  const context = load(["restaurant-question-engine.js"]);
  const profile = { religiousDiets: [{ id: "jain", enabled: true, options: { avoidOnionGarlic: true, avoidAllRootVegetables: true, avoidEggs: true, avoidMeatFishSeafood: true } }], allergies: ["peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"].map((id) => ({ id, label: id })) };
  const set = context.ROOTS_SERVER_QUESTIONS.generateProfileQuestions(profile), text = set.questions.map((item) => item.question).join(" ");
  assert.equal(set.offlineReady, true); ["onion", "root vegetables", "peanuts", "tree nuts", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"].forEach((term) => assert.match(text, new RegExp(term, "i")));
  assert.ok(set.questions.every((item) => item.sourceEvidenceIds[0].startsWith("profile-rule-")));
});

test("offline infrastructure is loaded, cached, and exposed without fake live claims", () => {
  const html = read("index.html"), sw = read("sw.js"), report = read("report-view.js"), restaurants = read("restaurant-ui.js");
  ["sync-queue.js", "offline-knowledge.js", "formulation-tracker.js", "online-enrichment.js", "offline-status.js"].forEach((file) => { assert.match(html, new RegExp(file.replace(".", "\\."))); assert.match(sw, new RegExp(file.replace(".", "\\."))); });
  assert.match(html, /id="offline-settings-summary"/); assert.match(report, /Online verification unavailable|Online manufacturer and certification verification was unavailable/);
  assert.match(restaurants, /Live hours and distance are unavailable offline/); assert.match(sw, /roots-shell-release-v17/);
});

test("accuracy corpus catches Jain roots, aliases, Big 9, and bounded OCR corruptions", () => {
  const files = ["dietary-feature-availability.js", "restriction-definitions.js", "restriction-taxonomy.js", "profile-definitions.js", "profile.js", "ingredient-knowledge.js", "offline-knowledge.js", "ingredient-parser.js", "dietary-rules.js"];
  const context = load(files), profile = context.ROOTS_PROFILE.createDefaultProfile({ onboardingComplete: true });
  context.ROOTS_PROFILE.setDietSelection(profile, "religious", "jain", true);
  profile.allergies = ["peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"].map((id) => ({ id, label: id, type: "built_in" }));
  ["onion", "garlic powder", "dehydrated garlic", "potato", "carrot", "radish", "beetroot", "groundnut", "arachis", "peanul", "alrnond", "gariic", "whey", "albumen", "semolina", "soya", "anchovy", "shrimp", "tahini"].forEach((ingredient) => {
    const parsed = context.ROOTS_DIETARY_ENGINE.parseIngredientText(ingredient), result = context.ROOTS_DIETARY_ENGINE.evaluateParsedProduct(parsed, profile);
    assert.equal(result.verdict, "AVOID", ingredient);
  });
});
