# Roots Public Launch Checklist

Status: **BLOCKED — not ready for public store submission**

The user states Phase 5E-C is complete, but the checked repository does not contain Phase 5E-B release outputs and its own release-candidate report remains “NOT READY.” Check a box only with an artifact, command result, or recorded manual verification.

## Release identity and configuration

- [ ] Public display name is “Roots” in web, Android, iOS, manifests, launch screens, and store records.
- [ ] No public-facing “ROOTS,” “But Is It Jain,” “ButIsItJain,” or “BIJ” branding remains.
- [ ] Final Android application ID is approved and stable.
- [ ] Final iOS bundle identifier is approved and stable.
- [ ] Marketing version is reconciled: requested release notes say 1.0.0 while `package.json` says 2.0.0.
- [ ] Android version code is set and verified.
- [ ] iOS build number is set and verified.
- [ ] Production HTTPS backend URL replaces `http://127.0.0.1:8000`.
- [ ] Production CSP and allowed origins contain no development hosts.
- [ ] Release feature flags and logging are verified.

## Security and privacy

- [x] No provider API key is intentionally stored in frontend configuration.
- [ ] Final web/native artifacts pass a secret and development-URL scan.
- [ ] Provider keys are stored in the production secret manager with quotas and alerts.
- [ ] Production provider retention settings and contracts are reviewed.
- [ ] Public privacy policy is published at a real HTTPS URL.
- [ ] Privacy choices/deletion information is published.
- [ ] Apple App Privacy answers are reviewed against the final binary and providers.
- [ ] Google Play Data Safety answers are reviewed against the final AAB and providers.
- [ ] Production TLS, rate limiting, and sanitized logging are verified.

## Native builds

- [ ] Android project exists and Capacitor sync succeeds.
- [ ] Signed release AAB exists with checksum.
- [ ] Release APK or Play-delivered internal build passes physical-device QA.
- [ ] iOS project exists and Capacitor sync succeeds.
- [ ] Signed Xcode archive validates.
- [ ] TestFlight build passes physical-device QA.
- [ ] Camera, location, photo picker, TTS, safe areas, rotation, and native back behavior pass.
- [ ] VoiceOver and TalkBack testing passes.

## Presentation

- [ ] Final Roots icon is integrated at every required Android and iOS size.
- [ ] Android adaptive/monochrome icon masks pass.
- [ ] iOS 1024px icon passes alpha and asset-catalog validation.
- [ ] Light and dark launch screens pass.
- [ ] Splash transition is fast and network-independent.
- [x] Store copy drafts use “Roots.”
- [x] Keyword strategy is prepared.
- [ ] Nine final marketing screenshots are captured from a production-equivalent build with approved realistic fixtures.
- [ ] Screenshot sizes, ordering, captions, and localization pass App Store/Play validation.

## Product QA

- [x] Automated JavaScript regression suite passed in the preceding UI phase (373/373).
- [ ] Authoritative release CI passes against the exact source commit.
- [ ] Production backend success paths pass with restricted credentials.
- [ ] Offline, slow-network, timeout, and recovery tests pass in native builds.
- [ ] Accessibility, text scaling, contrast, and reduced motion pass on physical devices.
- [ ] No console errors, broken links, placeholder UI, or development banners remain.
- [ ] No open SEV-0 or SEV-1; every remaining issue is accepted and documented.

## Documentation and support

- [x] App Store copy drafted.
- [x] Play Store copy drafted.
- [x] Keywords drafted.
- [x] Privacy-label worksheet drafted.
- [x] Data Safety worksheet drafted.
- [x] FAQ and troubleshooting drafted.
- [x] Release notes drafted.
- [ ] Support email is real, monitored, and tested.
- [ ] Support, privacy, terms, privacy-choices, and status URLs are live HTTPS pages.
- [ ] Store reviewer notes and test instructions are finalized.
- [ ] Legal review completed where required.

## Submission

- [ ] App Store Connect record created with final bundle ID.
- [ ] Play Console record created with final application ID.
- [ ] Age rating/content declarations completed.
- [ ] Export compliance completed.
- [ ] Pricing and availability approved.
- [ ] Internal beta sign-off recorded.
- [ ] Release owner gives explicit go/no-go approval.

