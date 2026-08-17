const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const design = read("www/design-system.css");
const home = read("www/home.css");
const html = read("www/index.html");
const ui = read("www/ui-system.js");

test("hover movement is limited to hover-capable fine pointers", () => {
  assert.match(design, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(home, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});

test("Home controls expose tactile interaction states", () => {
  assert.match(home, /home-restaurant-row\.home-hero:hover/);
  assert.match(home, /translateX\(2px\)/);
  assert.match(home, /home-shortcuts button:hover/);
  assert.match(home, /home-continuation:hover/);
  assert.match(home, /#settings-btn:hover svg\s*\{\s*transform:\s*rotate\(12deg\)/);
  assert.match(home, /#info-btn:hover svg\s*\{\s*transform:\s*scale\(1\.05\)/);
});

test("navigation uses subtle active, focus, hover, and press feedback", () => {
  assert.match(design, /\.dock-btn:focus-visible::after/);
  assert.match(design, /\.dock-btn:hover:not\(\.active\)/);
  assert.match(design, /\.scan-fab:hover/);
  assert.match(design, /\.scan-fab:active:not\(:disabled\)/);
  assert.match(html, /class="dock-btn active"[^>]+aria-current="page"/);
  assert.match(html, /id="scan-entry-btn"[^>]+data-haptic="medium"/);
});

test("haptics remain native-only and async buttons preserve dimensions", () => {
  assert.match(ui, /Capacitor\?\.isNativePlatform/);
  assert.doesNotMatch(ui, /navigator\?\.vibrate/);
  assert.match(ui, /getBoundingClientRect\(\)\.width/);
  assert.match(ui, /global-loading-status/);
  assert.match(ui, /aria-live/);
});

test("reduced motion removes movement while retaining state feedback", () => {
  assert.match(design, /prefers-reduced-motion:\s*reduce/);
  assert.match(design, /transition-duration:\s*\.01ms\s*!important/);
  assert.match(design, /transform:\s*none\s*!important/);
});
