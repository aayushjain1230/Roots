"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "www", "evidence-model.js"));
require(path.join(__dirname, "..", "www", "effective-rules.js"));
require(path.join(__dirname, "..", "www", "decision-engine.js"));
require(path.join(__dirname, "..", "www", "resolution-engine.js"));

test("combined profiles expand to distinct effective rules", () => {
  const result = global.ROOTS_EFFECTIVE_RULES.expand({
    id: "aayush",
    religiousDiets: [{ id: "jain", enabled: true }],
    allergies: ["peanut", "tree_nut"]
  });
  assert.deepEqual(result.rules.map((rule) => rule.id), ["allergy:peanut", "allergy:tree_nut", "religious:jain"]);
  assert.ok(result.fingerprint.includes("allergy:peanut"));
});

test("missing or unresolved evidence can never produce MATCH", () => {
  const empty = global.ROOTS_DECISION_ENGINE.decide({ evaluation: null, product: {} });
  assert.equal(empty.status, "VERIFY");
  const unresolved = global.ROOTS_DECISION_ENGINE.decide({
    product: { ingredients: [{ name: "spices" }] },
    evaluation: { verdict: "CAUTION", unresolvedItems: [{ displayName: "spices" }] }
  });
  assert.equal(unresolved.status, "VERIFY");
});

test("known conflicts map deterministically to CONFLICT", () => {
  const result = global.ROOTS_DECISION_ENGINE.decide({
    product: { ingredients: [{ name: "peanut" }] },
    evaluation: { verdict: "AVOID", unresolvedItems: [], summaryReasons: [{ message: "Contains peanut." }] }
  });
  assert.equal(result.status, "CONFLICT");
});

test("resolution generates questions only from unresolved evidence", () => {
  const result = global.ROOTS_RESOLUTION_ENGINE.resolve({
    decision: { status: "VERIFY", unresolved: [{ id: "broth", displayName: "broth", reason: "Source is unknown." }], evidenceConflicts: [] }
  });
  assert.equal(result.status, "STILL_NEEDS_VERIFICATION");
  assert.equal(result.questions.length, 1);
  assert.match(result.questions[0].question, /broth/i);
});
