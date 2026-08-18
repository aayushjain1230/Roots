"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require(path.join(__dirname, "..", "www", "evidence-model.js"));
const E = global.ROOTS_EVIDENCE;

test("physical labels receive Tier A direct provenance", () => {
  const item = E.claim({ subject: "0123", predicate: "ingredient_text", object: "rice, salt", source: { type: "physical_label", provider: "user_scan" }, productScope: { barcode: "0123" } });
  assert.equal(item.source.tier, "A");
  assert.equal(item.direction, "direct");
  assert.equal(item.level, "confirmed");
});

test("conflicting formulations remain traceable and prefer stronger evidence", () => {
  const stored = E.claim({ subject: "0123", predicate: "ingredient_text", object: "rice", source: { type: "trusted_dataset", provider: "off" }, productScope: { barcode: "0123" } });
  const label = E.claim({ subject: "0123", predicate: "ingredient_text", object: "rice, peanut", source: { type: "physical_label", provider: "user_scan" }, productScope: { barcode: "0123" } });
  const bundle = E.bundle({ productScope: { barcode: "0123" }, claims: [stored, label] });
  assert.equal(bundle.conflicts.length, 1);
  assert.equal(bundle.conflicts[0].preferredClaimId, label.id);
});

test("freshness never invents an observation date", () => {
  const item = E.claim({ subject: "x", predicate: "contains", object: "milk", source: { type: "inference" }, observedAt: "invalid" });
  assert.equal(E.freshness({ ...item, observedAt: "", source: { ...item.source, observedAt: "", retrievedAt: "" } }).state, "unknown");
});
