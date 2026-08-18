(function (root) {
  "use strict";
  const VERSION = 1;
  const DECISIONS = new Set(["approved", "changes_requested", "rejected"]);
  const CREDENTIAL_STATES = new Set(["verified", "unverified", "expired", "revoked"]);
  const clean = (value, limit = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const iso = (value) => {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  };
  function normalizeReview(input) {
    const reviewer = input?.reviewer || {};
    const review = {
      schemaVersion: VERSION,
      reviewId: clean(input?.reviewId, 100),
      subjectType: clean(input?.subjectType, 60),
      subjectId: clean(input?.subjectId, 180),
      subjectVersion: clean(input?.subjectVersion, 100),
      claimIds: [...new Set((Array.isArray(input?.claimIds) ? input.claimIds : []).map((item) => clean(item, 140)).filter(Boolean))].slice(0, 250),
      reviewer: {
        id: clean(reviewer.id, 100),
        displayName: clean(reviewer.displayName, 120),
        role: clean(reviewer.role, 120),
        credentialState: CREDENTIAL_STATES.has(reviewer.credentialState) ? reviewer.credentialState : "unverified",
        credentialReference: clean(reviewer.credentialReference, 240),
      },
      decision: DECISIONS.has(input?.decision) ? input.decision : "changes_requested",
      rationale: clean(input?.rationale, 2000),
      reviewedAt: iso(input?.reviewedAt),
      expiresAt: iso(input?.expiresAt),
      ruleVersion: clean(input?.ruleVersion, 100),
    };
    return Object.freeze(review);
  }
  function assess(reviewInput, context) {
    const review = normalizeReview(reviewInput);
    const now = Number(context?.now) || Date.now();
    const reasons = [];
    if (!review.reviewId || !review.subjectId || !review.subjectVersion) reasons.push("review_identity_missing");
    if (!review.claimIds.length) reasons.push("claims_missing");
    if (review.reviewer.credentialState !== "verified") reasons.push("reviewer_not_verified");
    if (review.decision !== "approved") reasons.push("not_approved");
    if (!review.reviewedAt) reasons.push("review_date_missing");
    if (review.expiresAt && Date.parse(review.expiresAt) <= now) reasons.push("review_expired");
    if (context?.subjectId && review.subjectId !== context.subjectId) reasons.push("subject_mismatch");
    if (context?.subjectVersion && review.subjectVersion !== context.subjectVersion) reasons.push("version_mismatch");
    if (context?.ruleVersion && review.ruleVersion !== context.ruleVersion) reasons.push("rule_version_mismatch");
    return Object.freeze({ status: reasons.length ? "not_verified" : "expert_reviewed", reasons, review });
  }
  function displayLabel(assessment) {
    return assessment?.status === "expert_reviewed" ? "Expert reviewed" : "Not expert reviewed";
  }
  root.ROOTS_TRUST_GOVERNANCE = Object.freeze({ VERSION, normalizeReview, assess, displayLabel });
})(typeof window !== "undefined" ? window : globalThis);
