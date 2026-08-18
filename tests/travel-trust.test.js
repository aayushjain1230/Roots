"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (name) => fs.readFileSync(path.join(__dirname, "..", "www", name), "utf8");

test("travel packs snapshot effective rules instead of only diet labels", () => {
  assert.match(source("travel-language-packs.js"), /effectiveRules:root\.ROOTS_EFFECTIVE_RULES/);
  assert.match(source("travel-language-packs.js"), /Language pack rules are malformed/);
});
test("travel cards retain deterministic question evidence linkage", () => {
  const code = source("travel-mode.js");
  assert.match(code, /sourceEvidenceIds/);
  assert.match(code, /generatedFromDeterministicQuestions:true/);
});
