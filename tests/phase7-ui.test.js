const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Home uses one photographic hero and one compact shortcut tray", () => {
  const html = read("www/index.html");
  assert.match(html, /href="home\.css"/);
  assert.match(html, /class="home-restaurant-row home-hero(?:\s[^"]*)?"/);
  assert.match(html, /class="home-shortcuts"/);
  assert.doesNotMatch(html, /class="home-tool-card"/);
  assert.doesNotMatch(html, /class="home-tool-icon/);
});

test("Home has its own responsive presentation layer with no section dividers", () => {
  const css = read("www/home.css");
  assert.match(css, /#scanView\.home-view\.active[^}]*gap:\s*24px/s);
  assert.match(css, /\.home-restaurant-row\.home-hero[^}]*aspect-ratio:\s*\.94/s);
  assert.match(css, /\.home-hero-copy #home-restaurant-title[^}]*Georgia/s);
  assert.match(css, /\.home-shortcuts[^}]*grid-template-columns:\s*repeat\(5/s);
  assert.match(css, /\.home-continuation[^}]*min-height:\s*102px/s);
  assert.match(css, /@media \(max-width:\s*390px\)/);
  assert.doesNotMatch(css, /\.home-view[^}]*border-bottom/);
});

test("Home context stays deterministic and local", () => {
  const script = read("www/script.js");
  const context = script.slice(script.indexOf("function updateHomeHero"), script.indexOf("async function showView"));
  assert.match(context, /new Date\(\)\.getHours\(\)/);
  assert.doesNotMatch(context, /fetch|Gemini|XMLHttpRequest|ROOTS_NETWORK/);
});

test("Home meal periods use explicit local-time boundaries", () => {
  const script = read("www/script.js");
  const source = script.slice(script.indexOf("function homeMealPeriodForHour"), script.indexOf("function updateHomeHero"));
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}; this.periodForHour = homeMealPeriodForHour;`, context);
  assert.equal(context.periodForHour(0), "Dinner");
  assert.equal(context.periodForHour(4), "Dinner");
  assert.equal(context.periodForHour(5), "Breakfast");
  assert.equal(context.periodForHour(10), "Breakfast");
  assert.equal(context.periodForHour(11), "Lunch");
  assert.equal(context.periodForHour(16), "Lunch");
  assert.equal(context.periodForHour(17), "Dinner");
  assert.equal(context.periodForHour(23), "Dinner");
});

test("Home uses the three supplied local meal photographs", () => {
  const html = read("www/index.html");
  const script = read("www/script.js");
  const sw = read("www/sw.js");
  for (const asset of ["breakfast-parfait.png", "lunch-penne.png", "dinner-thali.png"]) {
    assert.equal(fs.existsSync(path.join(root, "www", "assets", "home", asset)), true);
    assert.match(script, new RegExp(`assets/home/${asset.replace(".", "\\.")}`));
    assert.match(sw, new RegExp(`assets/home/${asset.replace(".", "\\.")}`));
  }
  assert.match(html, /id="home-hero-image"[^>]+loading="eager"[^>]+fetchpriority="high"/);
  assert.doesNotMatch(html, /home-hero-art/);
});

test("Home matches the approved editorial dashboard composition", () => {
  const html = read("www/index.html");
  const css = read("www/home.css");
  const profile = read("www/profile-ui.js");
  const personalization = read("www/personalization-view.js");
  assert.match(html, /home-header-label">Info/);
  assert.match(html, /home-header-label">Settings/);
  assert.match(html, /class="home-now-badge"/);
  assert.match(profile, /class="profile-summary-mark"/);
  assert.match(profile, /class="profile-summary-edit">Manage/);
  assert.match(css, /\.home-shortcuts[^}]*grid-template-columns:\s*repeat\(5/);
  assert.match(css, /\.home-restaurant-row\.home-hero[^}]*aspect-ratio:\s*\.94/);
  assert.match(personalization, /Pick up where you left off/);
  assert.match(personalization, /home-continuation-subject/);
});

test("center Scan opens the real source chooser and exposes Barcode or Label modes", () => {
  const html = read("www/index.html");
  const script = read("www/script.js");
  assert.match(script, /getElementById\("scan-entry-btn"\)\?\.addEventListener\("click", \(\) => openScanEntry\(\)\)/);
  assert.match(html, /id="scan-barcode-btn"/);
  assert.match(html, /id="scan-label-btn"/);
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
