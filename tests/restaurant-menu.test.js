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
}
global.localStorage = new MemoryStorage();
global.URL = global.URL || {};
global.URL.createObjectURL = () => `blob:test-${Math.random()}`;
global.URL.revokeObjectURL = () => {};
require(path.join(__dirname, "..", "www", "restaurant-menu-provider.js"));
require(path.join(__dirname, "..", "www", "restaurant-menu-parser.js"));
require(path.join(__dirname, "..", "www", "restaurant-menu-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-menu-ocr.js"));
require(path.join(__dirname, "..", "www", "restaurant-menu-import.js"));
const Provider = global.ROOTS_MENU_PROVIDER, Parser = global.ROOTS_MENU_PARSER;
const Storage = global.ROOTS_MENU_STORAGE, OCR = global.ROOTS_MENU_OCR, Importer = global.ROOTS_MENU_IMPORT;
const restaurant = { id: "r1", name: "Test Kitchen" };
const src = (type = "user_text", extra = {}) => Provider.normalizeSource({ restaurantId: "r1", type, title: "Dinner", menuType: "dinner", ...extra });
const file = (name = "menu.jpg", type = "image/jpeg", text = "image") => ({
  name, type, size: Buffer.byteLength(text), arrayBuffer: async () => Buffer.from(text),
  slice(start, end) { const data = Buffer.from(text).subarray(start, end); return { arrayBuffer: async () => data }; },
});
const reset = () => { global.localStorage = new MemoryStorage(); Provider.resetProvider(); OCR.resetProvider(); Importer.cleanup(); };

test("official sources are ranked ahead of third-party and user sources", () => {
  const ranked = Provider.rankSources([src("user_text"), src("provider_structured"), src("official_pdf"), src("official_webpage"), src("official_structured")]);
  assert.deepEqual(ranked.map((item) => item.type), ["official_structured", "official_webpage", "provider_structured", "official_pdf", "user_text"]);
});
test("source metadata and menu type are preserved", () => {
  const value = src("official_pdf", { url: "https://example.com/menu.pdf", official: true, sourceUpdatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(value.url, "https://example.com/menu.pdf");
  assert.equal(value.menuType, "dinner");
  assert.equal(value.official, true);
});
test("unsafe source URL is rejected", () => {
  assert.equal(Provider.normalizeSource({ restaurantId: "r1", type: "official_webpage", url: "javascript:alert(1)" }), null);
  assert.equal(Provider.safeUrl("http://example.com"), "");
});
test("blocked remote fetch reports the backend proxy state", async () => {
  await assert.rejects(Provider.fetchSource(src("official_webpage", { url: "https://example.com/menu" })), (error) => error.code === "requires_backend_proxy" && error.recoverable);
});
test("provider is substitutable and discovers normalized sources", async () => {
  reset();
  class Fake extends Provider.MenuProvider { async findMenuSources() { return [src("official_pdf"), src("official_structured")]; } }
  Provider.setProvider(new Fake());
  assert.equal((await Provider.findSources(restaurant))[0].type, "official_structured");
});
test("simple menu sections, descriptions, and prices parse deterministically", () => {
  const menu = Parser.parse({ restaurantId: "r1", restaurantName: "Test", source: src(), originalText: "APPETIZERS\nHummus $8.00\nChickpeas, tahini, lemon\nMAINS\nRice Bowl 14.50" });
  assert.equal(menu.sections.length, 2);
  assert.equal(menu.sections[0].items[0].descriptionOriginal, "Chickpeas, tahini, lemon");
  assert.equal(menu.sections[1].items[0].price.amount, 14.5);
});
test("missing price remains unknown rather than invented", () => {
  const dish = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nSeasonal Curry" }).sections[0].items[0];
  assert.equal(dish.price.unknown, true);
  assert.ok(dish.extraction.warnings.some((warning) => warning.code === "price_missing"));
});
test("modifiers and build-your-own options remain attached", () => {
  const menu = Parser.parse({ restaurantId: "r1", source: src(), originalText: "BUILD YOUR OWN\nPizza $12\nChoice of red or white sauce\nAdd mushrooms $2" });
  assert.equal(menu.sections[0].items[0].modifiers.length, 2);
  assert.match(menu.sections[0].items[0].modifiers[1].textOriginal, /Add mushrooms/);
});
test("allergen notes, dietary legends, and footnotes remain source evidence", () => {
  const menu = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nV = Vegan legend\nSoup $7\nContains milk\n* Consuming raw foods may increase risk" });
  assert.ok(menu.allergenNotes.includes("Contains milk"));
  assert.ok(menu.footnotes.length);
  assert.equal("compatibility" in menu.sections[0].items[0], false);
});
test("exact overlap merges but different prices remain with a warning", () => {
  const exact = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nSoup $7\nSoup $7" });
  assert.equal(exact.sections[0].items.length, 1);
  const different = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nSoup $7\nSoup $8" });
  assert.equal(different.sections[0].items.length, 2);
  assert.ok(different.warnings.some((warning) => warning.code === "ambiguous_duplicate"));
});
test("same dish on different menu types remains separate in storage", () => {
  reset();
  const lunch = Parser.parse({ restaurantId: "r1", menuType: "lunch", source: src("user_text", { menuType: "lunch" }), originalText: "MAINS\nSoup $7" });
  const dinner = Parser.parse({ restaurantId: "r1", menuType: "dinner", source: src("user_text", { menuType: "dinner" }), originalText: "MAINS\nSoup $9" });
  Storage.save(lunch); Storage.save(dinner);
  assert.deepEqual(new Set(Storage.getByRestaurant("r1").map((menu) => menu.menuType)), new Set(["lunch", "dinner"]));
});
test("schema is versioned, ordered, source-aware, and translation-aware", () => {
  const menu = Parser.parse({ restaurantId: "r1", source: src(), detectedLanguage: "es", translatedText: "MAINS\nSoup $7", originalText: "PLATOS\nSopa $7" });
  assert.equal(menu.schemaVersion, 1);
  assert.equal(menu.sections[0].order, 0);
  assert.equal(menu.language.original, "es");
  assert.equal(menu.source.type, "user_text");
});
test("text import preserves line breaks and rejects empty or oversized text", () => {
  reset(); Importer.begin(restaurant, "user_text");
  const menu = Importer.importText("MAINS\nSoup $7");
  assert.equal(menu.sections[0].items[0].nameOriginal, "Soup");
  Importer.begin(restaurant, "user_text");
  assert.throws(() => Importer.importText(""), (error) => error.code === "empty_text");
  assert.throws(() => Importer.importText("x".repeat(Importer.LIMITS.textChars + 1)), (error) => error.code === "text_too_large");
});
test("single and multi-image capture preserves order, rotation, delete, and reorder", () => {
  reset(); Importer.begin(restaurant, "user_image");
  const one = Importer.addPage(file("one.jpg"), { rotation: 90, crop: { x: 0.1 } });
  const two = Importer.addPage(file("two.jpg", "image/jpeg", "image2"));
  assert.equal(Importer.getSession().pages[0].rotation, 90);
  Importer.reorderPages([two.id, one.id]);
  assert.equal(Importer.getSession().pages[0].id, two.id);
  Importer.removePage(two.id);
  assert.equal(Importer.getSession().pages.length, 1);
});
test("OCR does not begin before Finish and runs sequentially in page order", async () => {
  reset(); let active = 0, max = 0, calls = 0;
  OCR.setProvider({ async extractPage(page) { calls += 1; active += 1; max = Math.max(max, active); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return { originalText: page.file.name, translatedText: "", detectedLanguage: "en", warnings: [], textBlocks: [] }; } });
  Importer.begin(restaurant, "user_image"); Importer.addPage(file("one.jpg")); Importer.addPage(file("two.jpg", "image/jpeg", "two"));
  assert.equal(calls, 0);
  const menu = await Importer.finish();
  assert.equal(calls, 2); assert.equal(max, 1);
  assert.match(menu.sections[0].items[0].nameOriginal, /one\.jpg/);
});
test("content hashing prevents duplicate OCR work", async () => {
  reset(); let calls = 0;
  OCR.setProvider({ async extractPage() { calls += 1; return { originalText: "MAINS\nSoup $7", translatedText: "", detectedLanguage: "en", warnings: [], textBlocks: [] }; } });
  const page = { id: "p1", order: 0, file: file() };
  await OCR.processPages([page]); await OCR.processPages([{ ...page, id: "p2" }]);
  assert.equal(calls, 1);
});
test("OCR preserves original, translation, warnings, and mixed-language state", () => {
  const value = OCR.normalize({ originalText: "Tacos con café", translatedText: "Tacos with coffee", warnings: ["possible_ocr_error"], textBlocks: [{ text: "Tacos" }] }, { id: "p", order: 0 }, "hash");
  assert.equal(value.originalText, "Tacos con café");
  assert.equal(value.translatedText, "Tacos with coffee");
  assert.ok(value.warnings.includes("possible_ocr_error"));
  assert.equal(OCR.detectLanguage("Tacos con café").mixed, true);
});
test("manual entry requires a name and creates user-entered evidence", () => {
  reset(); Importer.begin(restaurant, "manual_entry");
  assert.throws(() => Importer.importManual({}), (error) => error.code === "dish_name_required");
  const menu = Importer.importManual({ name: "Soup", description: "Tomato", price: "$8" });
  assert.equal(menu.sections[0].items[0].extraction.evidenceLevel, "user_entered");
});
test("PDF validation supports embedded text and honestly rejects image-only PDFs", async () => {
  reset(); Importer.begin(restaurant, "user_pdf");
  const pdf = file("menu.pdf", "application/pdf", "%PDF-menu");
  const menu = await Importer.importPdf(pdf, { embeddedText: "MAINS\nSoup $7" });
  assert.equal(menu.source.type, "user_pdf");
  Importer.begin(restaurant, "user_pdf");
  await assert.rejects(Importer.importPdf(pdf), (error) => error.code === "pdf_processing_unavailable" && error.recoverable);
});
test("malformed, oversized, and wrong-type PDFs fail safely", async () => {
  reset(); Importer.begin(restaurant, "user_pdf");
  await assert.rejects(Importer.importPdf(file("bad.pdf", "application/pdf", "wrong")), (error) => error.code === "malformed_pdf");
  const huge = file("huge.pdf", "application/pdf", "%PDF-"); huge.size = Importer.LIMITS.pdfBytes + 1;
  await assert.rejects(Importer.importPdf(huge), (error) => error.code === "pdf_too_large");
  await assert.rejects(Importer.importPdf(file("x.txt", "text/plain")), (error) => error.code === "invalid_pdf_type");
});
test("menus save, load, delete, and retain user edits", () => {
  reset();
  const menu = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nSoup $7" });
  menu.sections[0].items[0].nameOriginal = "Tomato Soup"; menu.sections[0].items[0].userEdited = true;
  Storage.save(menu);
  assert.equal(Storage.get(menu.id).sections[0].items[0].nameOriginal, "Tomato Soup");
  assert.equal(Storage.remove(menu.id), true); assert.equal(Storage.get(menu.id), null);
});
test("freshness distinguishes current and stale while stale menus stay viewable", () => {
  reset();
  const menu = Parser.parse({ restaurantId: "r1", source: src("official_webpage", { official: true, retrievedAt: "2025-01-01T00:00:00Z", url: "https://example.com/menu" }), originalText: "MAINS\nSoup $7" });
  Storage.save(menu);
  assert.equal(Storage.getFreshness(menu, Date.parse("2025-01-20T00:00:00Z")).state, "stale");
  assert.ok(Storage.get(menu.id));
});
test("LRU cache evicts unsaved menus and protects reviewed data", () => {
  reset();
  let protectedId;
  for (let index = 0; index < Storage.limit + 4; index += 1) {
    const menu = Parser.parse({ restaurantId: `r${index}`, source: Provider.normalizeSource({ restaurantId: `r${index}`, type: "user_text" }), originalText: `MAINS\nDish ${index} $7` });
    if (index === 0) { menu.reviewedByUser = true; protectedId = menu.id; }
    Storage.save(menu);
  }
  assert.ok(Storage.get(protectedId));
  assert.ok(JSON.parse(global.localStorage.getItem(Storage.key)).length <= Storage.limit);
});
test("review UI exposes labeled import, page controls, and no dietary evaluation", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const review = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-menu-review.js"), "utf8");
  assert.match(html, /Take Menu Photos/); assert.match(review, /aria-label="Move page/);
  assert.match(html, /id="menu-import-status"[^>]*aria-live="polite"/);
  assert.match(review, /ROOTS_IMAGE_REVIEW\.open/);
  assert.match(review, /event\.key === "Tab"/);
  assert.doesNotMatch(review, /best choice|can be modified|compatibility score|dish verdict/i);
});
test("external text is escaped before review markup", () => {
  const review = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-menu-review.js"), "utf8");
  assert.match(review, /replace\(\/\[&<>"'\]\/g/);
  assert.doesNotMatch(review, /insertAdjacentHTML|outerHTML\s*=/);
});
test("service worker caches every Phase 4C module and no user content", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  for (const name of ["provider", "parser", "storage", "ocr", "import", "review"]) assert.match(sw, new RegExp(`restaurant-menu-${name}\\.js`));
  assert.doesNotMatch(sw, /roots-restaurant-menus-v1|roots-menu-ocr-cache-v1/);
});
test("Phase 4C schema contains no evaluation or compatibility fields", () => {
  const menu = Parser.parse({ restaurantId: "r1", source: src(), originalText: "MAINS\nVegan Soup $7" });
  const serialized = JSON.stringify(menu);
  assert.doesNotMatch(serialized, /compatibility|bestChoice|canBeModified|dishVerdict|avoidReason/);
  assert.match(serialized, /dietaryLabels/);
});
