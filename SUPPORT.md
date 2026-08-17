# Roots Support

## Public contact placeholders

- Support email: `SUPPORT_EMAIL_TBD`
- Support website: `https://YOUR_DOMAIN.example/support`
- Privacy policy: `https://YOUR_DOMAIN.example/privacy`
- Privacy choices: `https://YOUR_DOMAIN.example/privacy-choices`
- Terms of service: `https://YOUR_DOMAIN.example/terms`
- System status: `https://YOUR_DOMAIN.example/status`

All placeholders are release blockers. Do not publish them as literal contact information.

## Information to request in a support ticket

- Roots version and build number
- Device model and operating-system version
- Feature involved
- Approximate time of the problem
- Reproduction steps
- Whether the device was online
- Sanitized screenshot, if useful

Ask users not to send:

- API keys or passwords
- Full dietary or medical history
- Exact location
- Unredacted restaurant receipts
- Images containing unrelated personal information

## Troubleshooting

### App will not start

Close and reopen Roots, confirm adequate device storage, then restart the device. If the problem remains, include the version/build and operating-system version in the support request.

### Camera is unavailable

Confirm camera permission in system settings, close other camera apps, and reopen Roots. Image selection remains an alternative when offered.

### Location is unavailable

Use manual location entry. Roots does not require background location.

### Scanning or AI is unavailable

Confirm internet access and retry. New OCR, translations, restaurant searches, and AI tools require network service. Saved local information remains available where supported.

### A result appears incorrect

Review the extracted ingredient text and evidence. Correct OCR text if necessary, retain the original packaging, and report the issue without including unrelated personal information. For severe allergies or medical needs, do not rely on the app while the result is disputed.

### Offline information looks out of date

Reconnect and refresh the relevant product, menu, or travel pack. Cached data may be stale and should show its source/freshness where available.

## Support response policy

- Never promise that a food is safe.
- Never override deterministic evidence through support.
- Treat reports containing dietary profiles, allergies, images, or location as sensitive.
- Remove sensitive attachments as soon as the support purpose is complete.
- Escalate suspected credential exposure or malicious content through the incident process in `SECURITY.md`.

