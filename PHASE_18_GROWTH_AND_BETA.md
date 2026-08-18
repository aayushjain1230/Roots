# Phase 18 — Ethical growth, onboarding, beta, and launch infrastructure

Roots growth must measure whether users reach a trustworthy answer, not maximize time in app.

## Implemented foundation

- `www/launch-growth.js` records only allowlisted local milestones: profile created, first scan,
  first save, first restaurant search, and an invite-share count.
- Milestones contain timestamps and counts only. They contain no food, profile, allergy, question,
  location, restaurant, device identifier, referral token, or contact.
- Invite payloads require an HTTPS public URL. Until one is configured, sharing returns an honest
  `public_url_not_configured` state. There are no fake credits or referral rewards.
- Native share is preferred; clipboard is a fallback. Both no-op safely when unavailable.
- Existing product metrics remain opt-in, local, bounded, clearable, and restricted to allowlisted
  operational events.

## Launch funnel

The appropriate activation path is profile created → first evidence-backed scan → result understood
→ useful item saved. VERIFY-to-RESOLVED remains the primary trust metric. Restaurant and AI engagement
are secondary and must not reward unsafe certainty or extra screen time.

## Before enabling public invitations

Configure a real HTTPS app page, publish privacy/support documentation, validate deep links, define
abuse controls, and test share behavior on iOS/Android/web. Do not upload contacts, generate persistent
tracking identifiers, or infer medical conditions. A future referral backend requires separate consent,
retention, deletion, fraud, and threat-model review.
