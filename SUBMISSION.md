# ROOTS internal beta and store-submission checklist

## Product identity

- App name: ROOTS
- Category: Food & Drink
- Bundle ID: `app.ahimsabytes.butisitjain` (retained deliberately for existing store identity)
- No login, payments, advertising, tracking, or analytics

## Privacy disclosure

Profiles, history, Saved products, shopping data, theme, and chat history remain on the device.
Ingredient-label photos and AI text requests are sent to Google Gemini when the user invokes those
features. Barcodes are sent to Open Food Facts for product lookup. ROOTS does not operate a cloud
account database and does not sell data.

Store privacy answers should disclose:

- User Content / Photos or Videos: app functionality, not linked, not tracking.
- User Content / Other User Content: app functionality, not linked, not tracking.
- No advertising identifier or cross-app tracking.

Before public submission, the product owner must supply and verify a public privacy-policy URL,
support URL, support email, current screenshots, and the final store description. These values
cannot be safely invented in source control.

## Review notes

No account is required. Barcode scanning uses Open Food Facts. Ingredient-label scanning sends the
selected photo to Gemini, then the local deterministic ROOTS engine evaluates the extracted text
against the profile. AI explanations do not override deterministic reports.

The reviewer should test:

1. Complete local dietary onboarding.
2. Open all four navigation destinations.
3. Scan a known barcode and an ingredient label.
4. Review Safe/Caution/Avoid reports and source details.
5. Save and reopen a report.
6. Switch System/Light/Dark appearance.
7. Relaunch offline and open Home, profile, history, and a Saved report.

## Release gates

- Increase native marketing/build versions above the live build.
- Install dependencies and generate/sync native platforms.
- Configure signing teams and store capabilities.
- Use production ROOTS icon and splash assets.
- Keep the Gemini key backend-only and restrict it by supported API, quota, and budget alerts.
- Supply public privacy/support pages.
- Capture current iPhone, iPad where applicable, and Android screenshots.
- Complete real-device camera, photo-library, VoiceOver/TalkBack, low-connectivity, and resume tests.
- Archive and upload to TestFlight and Google Play Internal Testing before public review.
