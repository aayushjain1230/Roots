"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Restaurants page uses local hero, ROOTS green tokens, and preserved functional hooks", () => {
  const html = read("www/index.html");
  const styles = read("www/styles.css");
  const ui = read("www/restaurant-ui.js");
  const heroPath = path.join(root, "www/assets/restaurants/restaurant-hero.jpg");

  assert.ok(fs.existsSync(heroPath));
  assert.match(html, /assets\/restaurants\/restaurant-hero\.jpg/);
  assert.match(html, /alt="Warm restaurant interior"/);
  assert.doesNotMatch(html, /pinterest/i);
  assert.doesNotMatch(styles, /#435F9E/i);
  assert.match(styles, /--brand-primary: #0F5138/);
  assert.match(styles, /--brand-deep: #0A3D2A/);
  assert.match(styles, /restaurant-hero \{[\s\S]*height:\s*clamp\(220px, 42vw, 340px\)/);
  assert.match(html, /class="roots-brand-wordmark">Roots<\/span><small>Restaurants<\/small>/);
  assert.match(styles, /\.roots-brand-wordmark[\s\S]*color:\s*var\(--roots-wordmark\)/);
  assert.match(styles, /\[data-theme="dark"\][^{}]*\.roots-brand-wordmark[\s\S]*color:\s*var\(--roots-wordmark-dark\)/);
  assert.match(styles, /\[data-theme="dark"\][\s\S]*--brand-soft: #293C32/);
  assert.match(html, /id="restaurant-use-location"/);
  assert.match(html, /class="location-button-icon"/);
  assert.match(html, /placeholder="City, address, or place"/);
  assert.match(html, /id="restaurant-map-toggle"/);
  assert.match(html, /class="restaurant-travel-card"/);
  assert.match(html, /class="scan-fab"/);
  assert.doesNotMatch(html + styles + ui, /restaurant-scan-orb|restaurant-scan-fab/);
});

test("Restaurants visual behavior keeps location stable and uses map toggle state", () => {
  const ui = read("www/restaurant-ui.js");
  const script = read("www/script.js");
  assert.match(ui, /restaurant-location-step"\)\.hidden = false/);
  assert.match(ui, /mapVisible = !mapVisible/);
  assert.match(ui, /restaurant-map-toggle/);
  assert.match(script, /data-open-travel-mode/);
});
