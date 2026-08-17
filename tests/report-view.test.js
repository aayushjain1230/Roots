const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function loadModules() {
  const events = [];
  const context = {
    console, setTimeout, clearTimeout,
    localStorage: storage(),
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
      body: { appendChild() {} },
      execCommand: () => true,
      getElementById: () => null,
    },
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent: (event) => events.push(event.type),
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["report-actions.js", "report-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "www", file), "utf8"), context);
  }
  return { context, events };
}

function scan(verdict = "CAUTION") {
  const item = (name, status, category, evidenceLevel = "confirmed") => ({
    displayName: name, rawName: name, normalizedName: name.toLowerCase(),
    matchedIngredientId: name.toLowerCase().replaceAll(" ", "_"),
    status, evidenceLevel, reasons: [{ id: `${name}-reason`, label: `${name} conflicts`, category }],
    triggeredRules: [`rule_${name}`], matchedAliases: [],
  });
  const avoid = item("Peanut", "AVOID", "allergy");
  const caution = item("Natural Flavors", "CAUTION", "religious", "needs_confirmation");
  return {
    state: "complete",
    product: {
      productName: "Test Bar", brand: "ROOTS Test", barcode: "123",
      image: "https://example.com/product.png", ingredientText: { original: "Peanut, natural flavors" },
      rawText: { original: "Peanut, natural flavors" }, sourceType: "barcode",
    },
    profile: { id: "p1", name: "My Vegan Profile", religiousRules: [], allergies: ["peanut"] },
    evaluation: {
      verdict, evaluatedAt: "2026-07-28T00:00:00.000Z",
      engineVersion: "1", ingredientKnowledgeVersion: "1",
      summaryReasons: [caution.reasons[0], avoid.reasons[0]],
      avoidItems: verdict === "AVOID" ? [avoid] : [],
      cautionItems: verdict === "CAUTION" ? [caution] : [],
      preferenceItems: [], safeItems: verdict === "SAFE" ? [item("Water", "SAFE", "lifestyle")] : [],
    },
    warnings: [],
  };
}

test("verdict language is exact for Safe", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT.renderVerdict("SAFE").heading, "Yes, this matches your profile");
});
test("verdict language is exact for Caution", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT.renderVerdict("CAUTION").heading, "Eat with caution");
});
test("verdict language is exact for Avoid", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT.renderVerdict("AVOID").heading, "No, avoid this product");
});
test("allergy reasons are prioritized", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT.helpers.mainReasons(scan("AVOID"))[0].category, "allergy");
});
test("main reasons are capped at five", () => {
  const { context } = loadModules();
  const value = scan();
  value.evaluation.summaryReasons = Array.from({ length: 8 }, (_, i) => ({ label: `Reason ${i}`, category: "other" }));
  assert.equal(context.ROOTS_REPORT.helpers.mainReasons(value).length, 5);
});
test("reason HTML is escaped", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT.helpers.esc("<img onerror=x>"), "&lt;img onerror=x&gt;");
});
test("evidence labels contain no percentages", () => {
  const { context } = loadModules();
  for (const level of ["confirmed", "likely", "needs_confirmation"]) {
    assert.doesNotMatch(context.ROOTS_REPORT.helpers.evidence({ evidenceLevel: level })[0], /%/);
  }
});
test("unknown ingredients receive cautious explanatory text", () => {
  const { context } = loadModules();
  assert.match(context.ROOTS_REPORT.helpers.description({}, null), /could not confidently identify/i);
});
test("unsafe image URLs are rejected", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT_ACTIONS.safeImageUrl("javascript:alert(1)"), "");
  assert.equal(context.ROOTS_REPORT_ACTIONS.safeImageUrl("data:text/html,x"), "");
});
test("HTTPS image URLs are accepted", () => {
  const { context } = loadModules();
  assert.equal(context.ROOTS_REPORT_ACTIONS.safeImageUrl("https://example.com/a.png"), "https://example.com/a.png");
});
test("saved records preserve Avoid without changing verdict", () => {
  const { context } = loadModules();
  const value = scan("AVOID");
  const saved = context.ROOTS_REPORT_ACTIONS.saveProduct(value);
  assert.equal(saved.verdict, "AVOID");
  assert.equal(saved.report.evaluation.verdict, "AVOID");
});
test("saved products deduplicate by barcode", () => {
  const { context } = loadModules();
  const value = scan("AVOID");
  context.ROOTS_REPORT_ACTIONS.saveProduct(value);
  context.ROOTS_REPORT_ACTIONS.saveProduct(value);
  assert.equal(context.ROOTS_REPORT_ACTIONS.getSavedProducts().length, 1);
});
test("saved product can be removed", () => {
  const { context } = loadModules();
  const value = scan("AVOID");
  context.ROOTS_REPORT_ACTIONS.saveProduct(value);
  assert.equal(context.ROOTS_REPORT_ACTIONS.removeSavedProduct("123"), true);
  assert.equal(context.ROOTS_REPORT_ACTIONS.getSavedProducts().length, 0);
});
test("share payload omits raw label and internal rule IDs", () => {
  const { context } = loadModules();
  const text = context.ROOTS_REPORT_ACTIONS.shareText(scan("AVOID"));
  assert.doesNotMatch(text, /Peanut, natural flavors/);
  assert.doesNotMatch(text, /rule_Peanut/);
});
test("AI context preserves deterministic authority", () => {
  const { context } = loadModules();
  const text = context.ROOTS_REPORT_ACTIONS.askRootsContext(scan("AVOID"));
  assert.match(text, /deterministic ROOTS verdict is authoritative/i);
  assert.match(text, /Do not override/i);
});
test("issue reports are stored locally with bounded notes", () => {
  const { context } = loadModules();
  const issue = context.ROOTS_REPORT_ACTIONS.reportIssue(scan(), "translation_issue", "x".repeat(700));
  assert.equal(issue.note.length, 500);
});
test("service worker caches both report modules", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  assert.match(source, /report-actions\.js/);
  assert.match(source, /report-view\.js/);
  assert.match(source, /roots-shell-v5c-1/);
});
test("index loads report actions before the report renderer and app script", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  assert.ok(source.indexOf("report-actions.js") < source.indexOf("report-view.js"));
  assert.ok(source.indexOf("report-view.js") < source.indexOf("script.js"));
});
test("report source contains accessible dialog and expandable controls", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "report-view.js"), "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /aria-live="polite"/);
});
test("report avoids numeric confidence labels", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "www", "report-view.js"), "utf8");
  assert.doesNotMatch(source, /confidence\s*[:=]\s*["'`]?\d/i);
});
