const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("www/index.html");
const css = read("www/design-system.css");
const script = read("www/script.js");
const profile = read("www/profile-ui.js");
const personal = read("www/personalization-view.js");
const report = read("www/report-view.js");
const savedNavigation = read("www/saved-navigation.js");

test("Home is a dashboard with scanning isolated to the dock sheet", () => {
  const home = html.slice(html.indexOf('<section id="scanView"'), html.indexOf('<section id="assistantView"'));
  const order = ["home-header", "active-profile-summary", "home-restaurant-row", "home-quick-tools", "personalized-home"];
  let previous = -1;
  order.forEach((id) => {
    const index = home.indexOf(id);
    assert.ok(index > previous, `${id} is out of order`);
    previous = index;
  });
  assert.doesNotMatch(home, /Scanning tip|id="scan-barcode-btn"|id="scan-label-btn"/);
  assert.match(html, /id="scanEntryModal"/);
  assert.match(html, /Scan Barcode[\s\S]*Scan Ingredient Label[\s\S]*Choose Photo/);
  assert.match(home, /id="personalized-home"[^>]*hidden/);
  assert.match(home, /class="home-brand-copy"[\s\S]*Can I eat this\?/);
  assert.doesNotMatch(home, /data-brand-tagline/);
  assert.doesNotMatch(home, /home-for-you|Pick up where you left off|Saved Roots data/);
});

test("Home profile and scan actions remain compact and reachable on small screens", () => {
  assert.match(profile, /slice\(0,\s*3\)/);
  assert.match(profile, /Scanning for/);
  assert.match(profile, /profile-summary-restrictions/);
  assert.match(profile, /profile-summary-item/);
  assert.match(profile, /aria-label=".*more dietary rules"/);
  assert.match(profile, /profile-summary-edit/);
  assert.match(css, /\.scan-fab[\s\S]*width:\s*68px/);
  assert.match(css, /\.scan-entry-option[\s\S]*min-height:\s*60px/);
});

test("approved scan animation behavior remains unchanged", () => {
  const animation = read("www/home-animation.js");
  assert.match(animation, /scan_one_flash/);
  assert.match(animation, /scan_two_flash/);
  assert.match(animation, /scan_three_flash/);
  assert.match(animation, /\["result",\s*850\]/);
  assert.match(animation, /prefers-reduced-motion/);
});

test("onboarding is six concise screens with welcome, accurate Jain copy, and setup later", () => {
  assert.match(profile, /const renderers = \[welcomeStep, religiousStep, lifestyleStep, allergiesStep, preferencesStep, reviewStep\]/);
  assert.match(profile, /Jain practices vary\. Adjust these rules to match what you follow\./);
  assert.doesNotMatch(profile, /Strict Jain|Lenient Jain|Custom Jain/);
  assert.match(profile, /Set Up Later/);
  assert.match(profile, /limited\.onboardingComplete = true/);
  assert.match(profile, /scan-barcode-btn/);
  assert.doesNotMatch(profile, /getUserMedia|geolocation|requestPermission/);
});

test("allergies and dislikes remain separate in onboarding and summary", () => {
  assert.match(profile, /function allergiesStep/);
  assert.match(profile, /These are preferences, not allergies/);
  assert.match(profile, /label: "Allergies"/);
  assert.match(profile, /label: "Dislikes"/);
});

test("four-tab navigation records state and intercepts logical native back", () => {
  assert.equal((html.match(/class="dock-btn/g) || []).length, 4);
  assert.match(script, /aria-current/);
  assert.match(script, /history\.pushState/);
  assert.match(script, /popstate/);
  assert.match(script, /handleLogicalBack/);
  assert.match(script, /addEventListener\("backbutton"/);
  assert.match(script, /travel-card-back/);
});

test("label source, review, processing, and report preserve the required hierarchy", () => {
  assert.match(html, /Take a clear photo or choose one from your library\. You can review it before ROOTS reads anything\./);
  assert.match(html, /id="label-take-photo"[\s\S]*id="label-choose-library"/);
  assert.match(html, /id="review-rotate"[\s\S]*id="review-revert"[\s\S]*id="review-use" class="primary-btn"/);
  const render = report.slice(report.indexOf("rootEl.innerHTML"));
  ["productHtml(scan)", "Can you eat this?", "final-verdict", "reasonChipsHtml(scan)", "warningHtml(scan)", "${avoid}${caution}${preference}${safe}", "originalHtml(scan)", "sourceHtml(scan)", "actionsHtml(scan)"]
    .reduce((last, term) => {
      const index = render.indexOf(term);
      assert.ok(index > last, `${term} is out of order`);
      return index;
    }, -1);
  assert.doesNotMatch(report, /\b\d{1,3}%\b/);
});

test("AI tools have exclusive standalone page containers", () => {
  const ai = html.slice(html.indexOf('<section id="assistantView"'), html.indexOf('<section id="restaurantsView"'));
  ["askRootsView", "recipeView", "mealsView", "travelView"].forEach((id) => {
    assert.match(ai, new RegExp(`id="${id}"[^>]*class="view`));
  });
  assert.match(ai, /id="askRootsView"[\s\S]*id="chatLog"[\s\S]*id="chatInput"/);
  assert.match(ai, /id="recipeView"[\s\S]*id="recipeInput"[\s\S]*id="recipeBtn"/);
  assert.match(ai, /id="mealsView"[\s\S]*id="mealInput"[\s\S]*id="mealBtn"/);
  assert.match(ai, /id="travelView"[\s\S]*data-open-travel-mode/);
  assert.equal((ai.match(/data-tool-back/g) || []).length, 4);
  assert.doesNotMatch(ai, /active-profile-summary|home-restaurant-row|home-quick-tools|personalized-home/);
});

test("view switching hides inactive pages from keyboard and accessibility APIs", () => {
  assert.match(script, /view\.hidden = !active/);
  assert.match(script, /setAttribute\("aria-hidden", String\(!active\)\)/);
  assert.match(script, /setAttribute\("inert", ""\)/);
  assert.match(script, /removeAttribute\("inert"\)/);
  assert.match(script, /homeScrollPosition = window\.scrollY/);
  assert.match(script, /restoreHomeScroll/);
  assert.match(script, /history\.scrollRestoration = "manual"/);
  assert.match(script, /querySelector\("h2\[tabindex='-1'\]"\)\?\.focus/);
  assert.match(script, /TOOL_VIEW_IDS/);
  assert.match(script, /full-page-modal-open/);
  assert.match(profile, /document\.querySelector\("\.app-main"\)\?\.setAttribute\("inert", ""\)/);
  assert.match(css, /\.full-page-modal-open \.app-main[\s\S]*visibility:\s*hidden/);
});

test("Home visuals use neutral profile text and restrained tool cards", () => {
  assert.match(css, /\.home-view > \.active-profile-summary[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/);
  assert.match(css, /\.profile-summary-item\.is-allergy::after[\s\S]*background:\s*var\(--avoid\)/);
  assert.doesNotMatch(css, /\.profile-summary-chip\.chip-(?:allergy|religious|medical|lifestyle)/);
  assert.match(css, /\.home-tool-card[\s\S]*border:\s*1px solid var\(--border\)[\s\S]*background:\s*var\(--surface\)[\s\S]*box-shadow:\s*none/);
  assert.match(css, /\.home-tool-icon[\s\S]*width:\s*24px[\s\S]*color:\s*var\(--brand-primary\)/);
  assert.doesNotMatch(css, /\.tool-icon-(?:meals|travel)\s*\{[^}]*background:/);
  assert.doesNotMatch(html, /M12 3 14 8l5 2|airplane|plane-icon/i);
});

test("Saved uses three intentional categories and renders one panel at a time", () => {
  assert.equal((html.match(/data-saved-category=/g) || []).length, 3);
  assert.equal((html.match(/data-saved-panel=/g) || []).length, 3);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(savedNavigation, /panel\.hidden = panel\.dataset\.savedPanel !== current/);
  assert.match(savedNavigation, /ArrowRight/);
  assert.match(savedNavigation, /ArrowLeft/);
  assert.match(savedNavigation, /sessionStorage/);
  assert.match(html, /data-saved-category="travel"/);
  assert.doesNotMatch(html, /<h3>Shopping list<\/h3>|data-saved-category="activity"|data-saved-category="meals"/);
});

test("major Saved empty states stay simple and action oriented", () => {
  assert.match(html, /No saved products yet[\s\S]*Scan something to keep it here[\s\S]*Scan a Product/);
  assert.match(personal, /No saved restaurants yet[\s\S]*Favorite a restaurant to keep it here[\s\S]*Find Restaurants/);
  assert.match(html, /Prepared travel cards will appear here/);
  assert.match(script, /No matching products[\s\S]*Clear the search or change the filter/);
});

test("Settings have distinct profile, appearance, restaurant, travel, privacy, and about groups", () => {
  const settings = html.slice(html.indexOf('<div id="profileModal"'), html.indexOf('<div id="infoModal"'));
  ["Dietary Profile", "Appearance", "Restaurant data", "Travel", "Privacy and data", "About"].forEach((heading) => assert.ok(settings.includes(heading)));
  assert.match(settings, /Privacy Policy/);
  assert.match(settings, /Delete Saved Meals/);
  assert.match(profile, /Reset your dietary profile\?/);
});

test("service worker includes Phase 5C navigation without caching private data", () => {
  const sw = read("www/sw.js");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /"\.\/saved-navigation\.js"/);
  assert.doesNotMatch(sw, /roots-saved-meal-v2:|bij-history-v2|roots-profile-v2:/);
});

test("Saved navigation public contract is immutable and bounded", () => {
  const listeners = {};
  const nodes = [];
  const tabs = {
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const document = {
    readyState: "complete",
    querySelector(selector) {
      if (selector === ".saved-category-tabs") return tabs;
      return nodes.find((node) => selector.includes(node.category)) || null;
    },
    querySelectorAll() { return []; },
    getElementById() { return { addEventListener() {} }; },
    addEventListener() {},
    dispatchEvent() {}
  };
  const storage = new Map();
  const context = {
    window: null, document,
    sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  context.window = context;
  vm.runInNewContext(savedNavigation, context);
  assert.deepEqual(Array.from(context.ROOTS_SAVED_NAVIGATION.categories), ["products", "restaurants", "travel"]);
  assert.equal(context.ROOTS_SAVED_NAVIGATION.getCurrent(), "products");
  assert.ok(Object.isFrozen(context.ROOTS_SAVED_NAVIGATION));
});
