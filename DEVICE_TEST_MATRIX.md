# ROOTS Phase 5E-A Device and Environment Matrix

No cell is inferred. “Passed” means executed in this phase; contract-only automated checks are
identified separately.

## Platform matrix

| Platform | Online | Slow | Offline | Fresh | Existing | Migrated | Result |
|---|---|---|---|---|---|---|---|
| Chromium desktop | Passed | Simulated tests passed | Passed | Automated only | Passed | Automated only | Partial pass |
| Chromium mobile emulation | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
| Android emulator | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
| Android physical | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
| iOS simulator | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
| iOS physical | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |

## Theme and accessibility matrix

| Environment | Light | Dark | System | Reduced motion | Large text | Screen reader | Keyboard |
|---|---|---|---|---|---|---|---|
| Chromium desktop | Passed | Passed | Passed | Contract passed | Contract passed | Semantic snapshot passed | Partial pass |
| Android/TalkBack | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | N/A |
| iOS/VoiceOver | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested | N/A |

## Responsive matrix

| Width/orientation | Static responsive contract | Interactive visual inspection |
|---|---|---|
| 320 portrait | Passed | Not tested |
| 360 portrait | Passed | Not tested |
| 375 portrait | Passed | Not tested |
| 390 portrait | Passed | Not tested |
| 414 portrait | Passed | Not tested |
| 430 portrait | Passed | Not tested |
| 768 portrait/landscape | Passed | Not tested |
| 1024 portrait/landscape | Passed | Not tested |

Static contract means CSS breakpoint, overflow, viewport scaling, touch-target, and layout rules
passed automated tests. It is not represented as a physical or emulated-device pass.

## Physical-device prerequisites

Before release-build preparation is approved:

1. Generate Android and iOS projects from the release-candidate commit.
2. Run Capacitor sync on both projects.
3. Build and install on an Android emulator, small physical Android, modern physical Android,
   recent iOS simulator, and physical iPhone.
4. Complete camera, barcode, HEIC/HEIF, background/resume, native back/navigation, TTS,
   VoiceOver/TalkBack, rotation, safe-area, slow-network, and offline-update checks.
5. Record OS/device/build identifiers and privacy-safe evidence.

