# Phase 17 — Expert verification and trust governance

`www/trust-governance.js` defines a fail-closed expert-review contract. It does not claim that Roots
currently employs an expert, and it does not turn community agreement or AI output into verification.

An expert-reviewed state requires all of the following:

- stable review, subject, subject-version, rule-version, and claim identifiers;
- at least one specific evidence claim;
- an approved decision;
- a verified, non-revoked reviewer credential record;
- a review timestamp and a non-expired review;
- exact subject and version matches at display time.

If any condition fails, the state is `not_verified`. An expert review may approve the accuracy and
interpretation of a rule or explanation, but it cannot manufacture evidence and does not bypass the
deterministic engine. Product formulations, menus, preparation practices, and certifications remain
time-sensitive source evidence.

## Required operating process

1. Define reviewer specialties and conflict-of-interest disclosure.
2. Verify credentials against an authoritative registry and retain the reference securely.
3. Require cited claims, rationale, versions, review/expiry dates, and second review for high-risk rules.
4. Re-review after rule, source, profile-semantics, or material product changes.
5. Publish a correction channel, severity policy, response SLA, and revision history.
6. Never display “verified” from an unverified reviewer, expired review, mismatched version, AI answer,
   single community report, or uncited assertion.

No real reviewer identities or credentials are included because none were verifiable from this repository.
