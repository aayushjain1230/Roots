"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require(path.join(__dirname, "..", "www", "trust-governance.js"));
const G = global.ROOTS_TRUST_GOVERNANCE;

function valid(overrides = {}) {
  return {
    reviewId: "review-1", subjectType: "rule_set", subjectId: "jain", subjectVersion: "3",
    claimIds: ["claim-1"], reviewer: { id: "expert-1", displayName: "Reviewer", role: "Dietitian", credentialState: "verified", credentialReference: "registry-record" },
    decision: "approved", rationale: "Reviewed against cited source material.", reviewedAt: "2026-08-01T00:00:00Z",
    expiresAt: "2027-08-01T00:00:00Z", ruleVersion: "roots-rules-v3", ...overrides,
  };
}
test("verified reviews require credentials, approval, claims, freshness, and exact versions", () => {
  const out = G.assess(valid(), { now: Date.parse("2026-08-09"), subjectId: "jain", subjectVersion: "3", ruleVersion: "roots-rules-v3" });
  assert.equal(out.status, "expert_reviewed");
  assert.equal(G.displayLabel(out), "Expert reviewed");
});
test("unverified credentials can never produce expert-reviewed status", () => {
  const out = G.assess(valid({ reviewer: { credentialState: "unverified" } }), { now: Date.parse("2026-08-09") });
  assert.equal(out.status, "not_verified");
  assert.ok(out.reasons.includes("reviewer_not_verified"));
});
test("expired and mismatched reviews fail closed", () => {
  const out = G.assess(valid({ expiresAt: "2026-08-02T00:00:00Z" }), { now: Date.parse("2026-08-09"), subjectVersion: "4" });
  assert.ok(out.reasons.includes("review_expired"));
  assert.ok(out.reasons.includes("version_mismatch"));
});
test("review text is bounded and unknown decisions are not approved", () => {
  const review = G.normalizeReview(valid({ decision: "maybe", rationale: "x".repeat(3000), claimIds: Array(300).fill("claim") }));
  assert.equal(review.decision, "changes_requested");
  assert.ok(review.rationale.length <= 2000);
  assert.ok(review.claimIds.length <= 250);
});
