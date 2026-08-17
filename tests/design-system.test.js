const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const css = read("www/design-system.css");
const ui = read("www/ui-system.js");
const html = read("www/index.html");
const sw = read("www/sw.js");

test("Phase 5B design and motion tokens are centralized", () => {
  [
    "--text-hero", "--text-page-title", "--text-section-title", "--text-card-title",
    "--space-1", "--space-9", "--radius-xs", "--radius-xl",
    "--shadow-small", "--shadow-modal", "--motion-tap", "--motion-expand",
    "--motion-page", "--motion-flash", "--ease-standard", "--ease-spring"
  ].forEach((token) => assert.ok(css.includes(token), `Missing ${token}`));
});

test("reusable buttons, cards, forms, sheets, skeletons, and toasts have contracts", () => {
  [".btn-primary", ".btn-secondary", ".btn-danger", ".btn-success", ".btn-outline",
    ".icon-btn", ".floating-btn", ".skeleton", ".roots-toast", ".modal-content",
    "input:not", ".restaurant-card", ".saved-product-card"
  ].forEach((selector) => assert.ok(css.includes(selector), `Missing ${selector}`));
});

test("motion timings follow the documented system and reduced motion is global", () => {
  assert.match(css, /--motion-instant:\s*90ms/);
  assert.match(css, /--motion-fast:\s*140ms/);
  assert.match(css, /--motion-medium:\s*220ms/);
  assert.match(css, /--motion-page:\s*280ms/);
  assert.match(css, /--motion-tap:\s*var\(--motion-instant\)/);
  assert.match(css, /--ease-interaction:\s*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/);
  assert.match(css, /--motion-flash:\s*100ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-duration:\s*\.01ms\s*!important/);
});

test("UI controller exposes safe toast, haptic, loading, and enhancement APIs", () => {
  assert.match(ui, /ROOTS_UI\s*=\s*Object\.freeze/);
  assert.match(ui, /text\.textContent\s*=\s*safeMessage/);
  assert.doesNotMatch(ui, /innerHTML\s*=/);
  assert.match(ui, /aria-busy/);
  assert.match(ui, /Capacitor\?\.Plugins\?\.Haptics/);
  assert.doesNotMatch(ui, /navigator\?\.vibrate/);
});

test("haptics are limited to meaningful actions and fail without blocking behavior", () => {
  assert.match(ui, /meaningfulHaptic/);
  assert.match(ui, /favorite\|save\|copied\|download\|complete\|finish\|built/);
  assert.match(ui, /enhancement-only/);
});

test("design assets load in the correct order and are cached offline", () => {
  const baseIndex = html.indexOf('href="styles.css"');
  const designIndex = html.indexOf('href="design-system.css"');
  const themeIndex = html.indexOf('src="theme.js"');
  const uiIndex = html.indexOf('src="ui-system.js"');
  assert.ok(baseIndex >= 0 && designIndex > baseIndex);
  assert.ok(themeIndex >= 0 && uiIndex > themeIndex);
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /"\.\/design-system\.css"/);
  assert.match(sw, /"\.\/ui-system\.js"/);
});

test("responsive, contrast, keyboard, and touch-target safeguards exist", () => {
  assert.match(css, /max-width:\s*360px/);
  assert.match(css, /max-width:\s*430px/);
  assert.match(css, /min-width:\s*768px/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(ui, /inputModality/);
});

test("theme roles avoid separate hardcoded component palettes", () => {
  const hexColors = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hexColors, ["#231A08", "#fff"]);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /--color-success:\s*var\(--safe\)/);
});
