"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("onboarding and settings expose one customizable Jain selection", () => {
  const definitions = read("www/profile-definitions.js");
  const ui = read("www/profile-ui.js");
  assert.match(definitions, /\{\s*id:\s*"jain",\s*label:\s*"Jain"/);
  assert.doesNotMatch(definitions, /\{\s*id:\s*"strict_jain"/);
  assert.doesNotMatch(definitions, /\{\s*id:\s*"custom_jain"/);
  assert.match(ui, /data-jain-option/);
  assert.match(ui, /Jain practices vary\. Adjust these rules/);
  assert.doesNotMatch(ui, /data-custom-jain|Strict Jain|Custom Jain/);
});

test("new production rules and reports use canonical Jain wording", () => {
  const rules = read("www/dietary-rules.js");
  const report = read("www/report-view.js");
  assert.match(rules, /trigger\("jain","religious"/);
  assert.match(rules, /Your Jain settings exclude/);
  assert.doesNotMatch(rules, /trigger\("(?:strict_jain|custom_jain)"/);
  assert.match(report, /strict_jain", "custom_jain"/);
  assert.match(report, /return "Jain"/);
});

test("legacy Jain IDs are confined to migration and display compatibility", () => {
  const files = ["www/profile.js", "www/report-view.js"];
  const combined = files.map(read).join("\n");
  assert.match(combined, /strict_jain/);
  assert.match(combined, /custom_jain/);
  for (const file of ["www/profile-definitions.js", "www/profile-ui.js", "www/dietary-rules.js"]) {
    assert.doesNotMatch(read(file), /strict_jain|custom_jain|Strict Jain|Custom Jain/, file);
  }
});

test("smartphone animation is flat, front-facing, and has explicit states", () => {
  const animation = read("www/home-animation.js");
  const css = read("www/styles.css");
  for (const state of ["idle", "entering", "scan_one", "scan_one_flash", "scan_two", "scan_two_flash", "scan_three", "scan_three_flash", "complete", "exiting", "result", "reset"]) {
    assert.match(animation, new RegExp(`"${state}"`));
  }
  assert.match(animation, /class="phone-screen"/);
  assert.match(animation, /class="focus-frame"/);
  assert.doesNotMatch(css, /\.phone-group[^}]*perspective|\.phone-group[^}]*rotate[XYZ]/);
  assert.doesNotMatch(animation, /camera-group|camera-lens|flash-group/);
});

test("service worker serves the Phase 4A modules from the current shell cache", () => {
  const sw = read("www/sw.js");
  assert.match(sw, /roots-shell-v5c-1/);
  for (const asset of ["home-animation.js", "profile-definitions.js", "profile.js", "profile-ui.js", "dietary-rules.js", "report-view.js", "report-actions.js"]) {
    assert.match(sw, new RegExp(asset.replace(".", "\\.")));
  }
});
