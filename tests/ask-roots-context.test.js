"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.ROOTS_EFFECTIVE_RULES = { expand: () => ({ version: 1, rules: [{ id: "allergy:peanut" }] }) };
global.ROOTS_PROFILE = { getActiveProfile: () => ({ id: "p1", name: "Aayush", allergies: ["peanut"] }) };
global.ROOTS_SCAN_PIPELINE = { getCurrent: () => ({
  product: { productName: "Snack", barcode: "1" }, evaluation: { verdict: "CAUTION" },
  decision: { status: "VERIFY", reason: "Natural flavor source is unknown.", unresolved: [{ id: "natural-flavor", displayName: "Natural flavor" }] },
  evidence: { claims: [{ id: "claim-1", predicate: "ingredient_text", object: "natural flavor", source: { type: "physical_label", tier: "A" }, direction: "direct", level: "confirmed" }] },
  resolution: { questions: [{ id: "q1", question: "What is the source of the natural flavor?", reason: "Source affects compatibility." }] }
}) };
require(path.join(__dirname, "..", "www", "ask-roots-context.js"));

test("Ask context contains only structured profile, decision, evidence, and unresolved state", () => {
  const context = global.ROOTS_ASK_CONTEXT.build();
  assert.equal(context.decision.status, "VERIFY");
  assert.deepEqual(context.allowedEvidenceIds, ["claim-1"]);
  assert.equal(context.profile.effectiveRules.rules[0].id, "allergy:peanut");
});
test("Ask rejects invented citations and safety guarantees", () => {
  const context = global.ROOTS_ASK_CONTEXT.build();
  assert.equal(global.ROOTS_ASK_CONTEXT.validateResponse({ answer: "Fine", usedEvidenceIds: ["invented"] }, context), null);
  assert.equal(global.ROOTS_ASK_CONTEXT.validateResponse({ answer: "This is guaranteed safe.", usedEvidenceIds: [] }, context), null);
});
test("Ask accepts grounded explanations without changing the decision", () => {
  const context = global.ROOTS_ASK_CONTEXT.build();
  const answer = global.ROOTS_ASK_CONTEXT.validateResponse({ answer: "The physical label lists natural flavor, whose source remains unresolved.", usedEvidenceIds: ["claim-1"], unknownsAcknowledged: true }, context);
  assert.equal(answer.usedEvidenceIds[0], "claim-1");
});
