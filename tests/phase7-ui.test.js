const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Home uses one hero and text-only shortcuts instead of feature cards", () => {
  const html = read("www/index.html");
  assert.match(html, /href="home\.css"/);
  assert.match(html, /class="home-restaurant-row home-hero(?:\s[^"]*)?"/);
  assert.match(html, /class="home-shortcuts"/);
  assert.doesNotMatch(html, /class="home-tool-card"/);
  assert.doesNotMatch(html, /class="home-tool-icon/);
});

test("Home has its own responsive presentation layer with no section dividers", () => {
  const css = read("www/home.css");
  assert.match(css, /#scanView\.home-view\.active[^}]*gap:\s*36px/s);
  assert.match(css, /\.home-restaurant-row\.home-hero[^}]*min-height:\s*170px/s);
  assert.match(css, /\.home-hero-copy #home-restaurant-title[^}]*30px/s);
  assert.match(css, /\.home-continuation[^}]*min-height:\s*72px/s);
  assert.match(css, /@media \(max-width:\s*390px\)/);
  assert.doesNotMatch(css, /\.home-view[^}]*border-bottom/);
});

test("Home context stays deterministic and local", () => {
  const script = read("www/script.js");
  const context = script.slice(script.indexOf("function updateHomeHero"), script.indexOf("async function showView"));
  assert.match(context, /new Date\(\)\.getHours\(\)/);
  assert.doesNotMatch(context, /fetch|Gemini|XMLHttpRequest|ROOTS_NETWORK/);
});

test("center Scan opens camera directly and exposes Barcode or Label modes", () => {
  const html = read("www/index.html");
  const script = read("www/script.js");
  assert.match(script, /getElementById\("scan-entry-btn"\)\?\.addEventListener\("click", startLabelCamera\)/);
  assert.match(html, /class="capture-mode-switch"/);
  assert.match(html, />Barcode<\/button>/);
  assert.match(html, />Label<\/button>/);
});

test("Phase 7 visual rules preserve evidence-first report and reduced motion", () => {
  const css = read("www/design-system.css");
  assert.match(css, /\.final-verdict \.verdict-symbol[^}]*width:\s*100px/);
  assert.match(css, /\.report-section[^}]*border-radius:\s*0/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^{]*\{[^}]*\.camera-grid::before/s);
  assert.doesNotMatch(css, /confidence-(?:circle|gauge)|conic-gradient/);
});
