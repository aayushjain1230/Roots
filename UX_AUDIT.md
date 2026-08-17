# ROOTS Phase 5C UX Audit

## Goals

Phase 5C makes existing ROOTS workflows understandable within seconds and reduces the effort to
resume common tasks. It changes layout, hierarchy, navigation, focus, copy, and recovery only.
Dietary rules, evidence, ranking, OCR, providers, storage records, and recommendation logic remain
unchanged.

## Audit findings and resolutions

| Finding | Resolution |
| --- | --- |
| Home personalization appeared before scanning | Moved beneath scan actions and Restaurant entry |
| Home began like a dashboard | Removed the greeting dashboard and made scanning the first task |
| Profile summary consumed excess vertical space | Reduced to profile name, three restrictions, and Edit |
| Tip looked like a major card | Converted to a quiet, borderless hint |
| Restaurant entry competed with scanning | Converted to a compact tertiary row |
| AI tools had equal visual weight | Ask ROOTS is primary; Recipe and Meals are collapsed quick tools |
| Saved was a long mixed feed | Added Products, Restaurants, Meals, and Activity category tabs |
| Onboarding lacked purpose/context | Added Welcome while retaining six total screens |
| Cross-contact and custom preferences were separate | Combined them into one preferences screen |
| Browser/native back lacked a shared top-level rule | Added logical overlay-first and Home fallback handling |
| Several empty Saved lists were blank or generic | Added a title, explanation, and relevant next action |
| Settings information and data controls were mixed | Grouped Profile, Appearance, Restaurant, Travel, Privacy/Data, and About |

## Home hierarchy

1. Compact app bar.
2. Current Profile summary.
3. Approved phone/package scan animation.
4. Quiet scanning tip.
5. Scan Barcode.
6. Scan Label.
7. Compact Restaurant Finder entry.
8. Optional personalized continuation content.

Personalization is hidden when no useful local data exists. When present, it is limited to compact
horizontal rows and appears after the core workflow. It performs no AI calls or restaurant refresh.
The container begins hidden to prevent initial layout shift.

## First run and onboarding

The six screens are Welcome, Religious Preferences, Lifestyle Preferences, Allergies, Preferences
and Cross-contact, and Review. Welcome explains products, restaurants, and dining cards. Set Up
Later stores an explicitly empty profile and warns that personalized results require setup. It does
not request camera or location access. Jain appears once and exposes the existing customizable
rules with variation-aware wording. Allergies and dislikes remain distinct.

Completing onboarding returns to Home, announces one success message, and focuses Scan Barcode.

## Navigation and back behavior

The permanent tabs remain Home, AI, Restaurants, and Saved. Main-tab selection updates
`aria-current` and browser history. Browser Back restores the prior primary tab. Native back first
closes the uppermost full-screen card or modal, then returns a non-Home tab to Home instead of
unexpectedly exiting. Existing feature controllers continue to restore focus to their invokers.

Camera, review, processing, report, and staff-facing Travel cards may hide app chrome while active;
their existing cleanup restores it on close. Late scan results remain governed by the existing
cancelled-session protections.

## Workflow standards

### Scanning

Barcode and Label remain one tap from Home. Label source offers Take Photo, Choose from Library,
and Cancel, with review-before-processing explained in plain language. Image Review keeps Use Photo
as primary; Rotate, Revert, Retake, and collapsed keyboard crop controls remain secondary.
Processing preserves stage text, cancellation, bounded timeout, retry, and current-image reuse.

### Product report

Order is product identity, question/verdict, main reasons, warnings, Avoid, Eat with Caution,
Preferences, Safe, original label, source details, alternatives, and actions. Technical evidence
remains behind expandable controls. Warnings and evidence are never removed.

### Restaurants

Location → meal → results → restaurant → dish/order → questions remains unchanged. Location,
radius, and meal state remain in the existing restaurant storage/controller. Match category remains
more prominent than rating. Advanced filters stay behind a disclosure after results.

### AI

Ask ROOTS is the primary workflow. Change a Recipe and Suggest Meals remain available as collapsed
quick tools. The page states that internet is required and that AI explains available evidence but
does not replace deterministic decisions.

### Travel Mode

The existing Destination → Language → Profile → Card → Offline flow remains. Translation is
staff-facing, speech never autoplays, and Speak/Stop/Slow/Copy/Share remain available. Travel Mode
is reachable from Restaurants, Dining Assistant, Saved, and Settings—not a fifth tab.

### Saved

- Products: Favorite Products, Saved Products, Shopping List.
- Restaurants: Saved Restaurants, Saved Questions, Travel Cards.
- Meals: Saved Meals.
- Activity: Scan History and Restaurant Order History.

Only one panel is exposed at a time. Search/filter controls stay mounted, so state survives category
changes. Arrow keys, Home, and End operate the segmented category control.

### Settings

Settings groups Profile, Appearance, Restaurant Data, Travel, Privacy and Data, and About. Each
destructive group explains its scope. Existing destructive actions retain specific confirmations;
ordinary navigation, filtering, opening, and retrying do not add confirmations.

## Loading, empty, error, and confirmation standards

- Loading: name the operation, keep safe cancellation where supported, and never leave a blank
  container.
- Empty: title, one-sentence explanation, and one relevant action when an action exists.
- Error: say what happened in user language and provide a real recovery path.
- Confirmation: only deletion, profile reset, or loss of meaningful edits; name the exact data.
- Copy: use Safe, Eat with Caution, Avoid, Best Choice, Can Be Modified, Needs Confirmation,
  Current Profile, Scan Label, Scan Barcode, Travel Mode, and Saved Meal consistently.

## Responsive and accessibility rules

Home’s animation is capped by viewport height so actions remain reachable at 320–430px. The Saved
category control scrolls horizontally without page overflow. All categories use real tab/tabpanel
semantics, roving tabindex, and arrow-key navigation. Statuses preserve text, focus returns after
dialogs, targets remain approximately 48px, reduced motion remains global, and long names wrap.

## Lightweight usability plan

Use synthetic or non-sensitive profiles only.

1. New user: explain ROOTS, complete or defer profile, start Barcode, interpret a report.
2. Label user: choose source, crop, process, inspect Caution, edit ingredients.
3. Restaurant user: choose location, search pizza, explain match, open restaurant, build order,
   prepare questions.
4. Travel user: choose destination/language, prepare card, install pack, Speak and Stop.
5. Returning user: Saved → Meals, reopen meal, recheck, Order Again, copy order.

Observe missed primary actions, repeated taps, mistaken safety assumptions, lost context, unclear
Back behavior, unexplained waiting, and terminology changes. Record no dietary profile, allergy,
location, image, restaurant note, or conversation content.

## Usability findings from implementation walkthrough

- The original Home greeting and Smart Search made the scan task appear secondary.
- Restaurant Finder’s prior full card visually competed with Scan Label.
- Saved required extensive vertical scanning and repeated heading interpretation.
- AI’s three equal cards obscured the evidence-grounded Ask workflow.
- The profile wizard asked the right questions but did not explain ROOTS before asking them.
- Settings grouped useful information and destructive data controls too closely.

The Phase 5C hierarchy directly addresses these findings. Physical-device moderated testing remains
required before public release.

## Known limitations

- The local browser harness cannot emulate every native Android Back edge case.
- VoiceOver, TalkBack, software keyboard occlusion, and 200% Dynamic Type require physical-device QA.
- Restaurant discovery still requires a configured provider; no fake results are used.
- AI/OCR workflows still require internet and the temporary direct-client configuration.
- Native projects are not generated in this repository snapshot, so Capacitor sync cannot run.

## Phase 5D handoff—do not address in Phase 5C

- Production backend deployment, shared rate limiting, and provider budget monitoring.
- Content Security Policy is absent.
- Dynamic HTML sinks require a dedicated full taint review.
- External request, redirect, and image URL validation need security testing.
- Dietary profiles, history, locations, notes, and travel data need a secure-storage/privacy review.
- Provider and AI endpoints need server-side authentication, rate limiting, and abuse controls.
- Debug/log redaction and retention policy need review.
- Dependency audit currently reports transitive advisories.
- A published Privacy Policy and deletion/export disclosures are incomplete.
- Penetration testing and production security headers remain outstanding.

These are recorded for Phase 5D only; Phase 5C does not implement security architecture.
