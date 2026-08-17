const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  const listeners = {};
  return {
    hidden: false, disabled: false, textContent: "", dataset: {}, style: {}, attributes: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, fn) { listeners[type] = fn; },
    focus() { this.focused = true; },
    click() { listeners.click?.({ currentTarget: this }); },
  };
}

function harness({ online = true } = {}) {
  const ids = [
    "scan-processing-screen", "processing-state", "processing-title", "processing-detail",
    "processing-live", "processing-warning", "processing-failure", "processing-failure-title",
    "processing-failure-message", "processing-retry", "processing-scan-label",
    "processing-review-photo", "processing-cancel", "processing-failure-cancel",
    "scan-barcode-btn", "scan-label-btn",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const dock = element();
  const windowListeners = {};
  const document = {
    body: element(),
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => selector === ".bottom-dock" ? dock : null,
  };
  const context = {
    console, document, navigator: { onLine: online }, AbortController,
    setTimeout, clearTimeout, Date, structuredClone,
    addEventListener(type, fn) { windowListeners[type] = fn; },
    removeEventListener(type) { delete windowListeners[type]; },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("www/scan-processing.js", "utf8"), context);
  context.ROOTS_SCAN_PROCESSING.init();
  return { api: context.ROOTS_SCAN_PROCESSING, elements, dock, windowListeners, context };
}

test("one scan creates a stable session and rejects duplicate submission", () => {
  const { api } = harness();
  const first = api.startSession({ type: "barcode" });
  const duplicate = api.startSession({ type: "label" });
  assert.equal(first.accepted, true);
  assert.match(first.session.id, /^roots-scan-/);
  assert.equal(api.getActiveSession().id, first.session.id);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.error.code, "DUPLICATE_SUBMISSION");
});

test("stage transitions are explicit and announced politely", () => {
  const { api, elements } = harness();
  api.startSession({ type: "label" });
  assert.equal(api.updateStage("reading_label"), true);
  assert.equal(api.getActiveSession().stage, "reading_label");
  assert.equal(elements["processing-title"].textContent, "Reading the label");
  assert.equal(elements["processing-live"].textContent, "Reading the label");
  assert.equal(elements["processing-live"].attributes["aria-live"], undefined);
  assert.equal(api.updateStage("not_a_stage"), false);
});

test("success cleans the session and invokes report handoff exactly once", () => {
  const { api, elements, dock } = harness();
  let renders = 0;
  api.startSession({ type: "barcode", onComplete: () => { renders += 1; } });
  assert.equal(api.complete({ verdict: "SAFE" }), true);
  assert.equal(api.complete({ verdict: "SAFE" }), false);
  assert.equal(renders, 1);
  assert.equal(api.getActiveSession(), null);
  assert.equal(elements["scan-barcode-btn"].disabled, false);
  assert.equal(dock.hidden, false);
});

test("cancel aborts, restores controls, and ignores late completion", () => {
  const { api, elements, dock } = harness();
  let reports = 0;
  api.startSession({ type: "label", onComplete: () => { reports += 1; } });
  assert.equal(api.requestCancel(), true);
  assert.equal(api.complete({ verdict: "SAFE" }), false);
  assert.equal(reports, 0);
  assert.equal(api.getActiveSession(), null);
  assert.equal(elements["scan-label-btn"].disabled, false);
  assert.equal(dock.hidden, false);
});

test("failure exposes normalized safe text and hides raw provider messages", () => {
  const { api, elements } = harness();
  api.startSession({ type: "label" });
  const error = api.fail(new Error('<img src=x onerror=alert(1)>'), "OCR_PROVIDER_ERROR");
  assert.equal(error.code, "OCR_PROVIDER_ERROR");
  assert.equal(elements["processing-failure-title"].textContent, "Could not read the label");
  assert.doesNotMatch(elements["processing-failure-message"].textContent, /img|onerror|alert/);
  assert.equal(elements["processing-failure-title"].focused, true);
});

test("rate limiting is distinguished from an unreadable photo", () => {
  const { api, elements } = harness();
  api.startSession({ type: "label" });
  const error = api.fail({ code: "OCR_RATE_LIMITED" }, "OCR_PROVIDER_ERROR");
  assert.equal(error.code, "OCR_RATE_LIMITED");
  assert.equal(elements["processing-failure-title"].textContent, "Too many scan attempts");
  assert.match(elements["processing-failure-message"].textContent, /minute/i);
});

test("retry increments attempt, clears the error, and runs once", async () => {
  const { api } = harness();
  let attempts = 0;
  api.startSession({ type: "barcode" });
  api.setRetry(async () => { attempts += 1; });
  api.fail({ code: "BARCODE_LOOKUP_TIMEOUT" });
  await api.retry();
  assert.equal(attempts, 1);
  assert.equal(api.getActiveSession().attempt, 2);
  assert.equal(api.getActiveSession().error, null);
});

test("old attempt cannot complete after retry succeeds", async () => {
  const { api } = harness();
  let renders = 0;
  api.startSession({ type: "barcode", onComplete: () => { renders += 1; } });
  api.setRetry(async () => api.complete({ verdict: "CAUTION" }));
  api.fail({ code: "BARCODE_LOOKUP_TIMEOUT" });
  await api.retry();
  assert.equal(renders, 1);
  assert.equal(api.complete({ verdict: "SAFE" }), false);
});

test("timeout produces stable error and clears its timer", async () => {
  const { api } = harness();
  api.startSession({ type: "label" });
  await assert.rejects(
    api.withTimeout(new Promise(() => {}), 5, "OCR_TIMEOUT"),
    (error) => error.code === "OCR_TIMEOUT" && error.title === "This is taking longer than expected"
  );
  api.fail({ code: "OCR_TIMEOUT" });
  assert.equal(api.getActiveSession().error.code, "OCR_TIMEOUT");
});

test("an unreliable offline flag does not block retry after a network failure", () => {
  const { api, elements } = harness({ online: false });
  api.startSession({ type: "label" });
  api.fail({ code: "OCR_NETWORK" });
  assert.equal(elements["processing-retry"].disabled, false);
});

test("warnings use structured severity and user-readable text", () => {
  const { api, elements } = harness();
  api.startSession({ type: "label" });
  const warning = api.addWarning("image_too_dark");
  assert.equal(warning.severity, "caution");
  assert.match(elements["processing-warning"].textContent, /Dark image/);
  assert.equal(elements["processing-warning"].dataset.severity, "caution");
});

test("error taxonomy covers required processing categories", () => {
  const { api } = harness();
  const codes = api.constants.ERRORS;
  [
    "BARCODE_NOT_FOUND_IN_IMAGE", "PRODUCT_NOT_FOUND", "PRODUCT_MISSING_INGREDIENTS",
    "OCR_TIMEOUT", "OCR_EMPTY_RESULT", "TRANSLATION_FAILED", "PARSER_EMPTY",
    "ENGINE_TIMEOUT", "SESSION_CANCELED", "DUPLICATE_SUBMISSION", "UNKNOWN_ERROR",
  ].forEach((code) => assert.ok(codes[code], code));
});

test("barcode and label integrations use real stages and save only on completion", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /stage: "reading_barcode"/);
  assert.match(script, /updateStage\("finding_product"\)/);
  assert.match(script, /updateStage\("reading_ingredients"\)/);
  assert.match(script, /stage: "preparing_image"/);
  assert.match(script, /updateStage\("reading_label"\)/);
  assert.match(script, /updateStage\("detecting_language"\)/);
  assert.match(script, /updateStage\("parsing"\)/);
  assert.match(script, /updateStage\("checking_profile"\)/);
  assert.match(script, /updateStage\("saving_result"\)/);
  assert.match(script, /onComplete:\s*\(scan\)\s*=>\s*\{[\s\S]*ROOTS_IMAGE_REVIEW\?\.dispose[\s\S]*displayResult\(scan,\s*\{\s*save:\s*scan\.state === "EVALUATED"\s*\}\)/);
});

test("insufficient evidence cannot complete as Safe or create normal history", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /scan\.state !== "EVALUATED"\) throw \{ code: "PARSER_EMPTY"/);
  assert.doesNotMatch(script, /PARSER_EMPTY[\s\S]{0,120}complete\(\{[^}]*SAFE/);
});

test("network calls accept AbortSignal and provider details stay internal", () => {
  const off = fs.readFileSync("www/foodfacts.js", "utf8");
  const ocr = fs.readFileSync("www/ocr.js", "utf8");
  assert.match(off, /fetchProduct\(variant, options\.signal\)/);
  assert.match(off, /signal \}/);
  assert.match(ocr, /signal: options\.signal/);
  assert.match(fs.readFileSync("www/scan-processing.js", "utf8"), /const spec = ERRORS\[code\] \|\| ERRORS\.UNKNOWN_ERROR/);
});

test("processing markup and reduced motion meet accessibility contract", () => {
  const html = fs.readFileSync("www/index.html", "utf8");
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.match(html, /id="processing-live"[^>]*aria-live="polite"/);
  assert.match(html, /id="processing-cancel"[^>]*aria-label="Cancel scan"/);
  assert.match(html, /id="processing-failure-title"[^>]*tabindex="-1"/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.processing-animation \.phone-group[\s\S]*animation:\s*none\s*!important/s);
  assert.match(css, /processing-warning\[data-severity="blocking"\]/);
});

test("service worker caches the controller and all listed assets exist", () => {
  const sw = fs.readFileSync("www/sw.js", "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /\.\/scan-processing\.js/);
  const assets = [...sw.matchAll(/"\.\/([^"?]+)"/g)].map((match) => match[1]);
  assets.forEach((asset) => assert.equal(fs.existsSync(`www/${asset}`), true, asset));
});
