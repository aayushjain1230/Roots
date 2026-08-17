# Roots — Apple App Privacy Draft

This is a conservative submission worksheet, not legal advice. The release owner must verify production provider contracts, retention, and the final binary before submitting App Store Connect answers. Apple requires disclosures to include relevant third-party partner practices.

## Recommended answers

### Tracking

- Data used to track the user: **No**
- Data linked across third-party apps or websites for advertising: **No**
- Advertising identifier: **Not used**

### Data potentially collected

| Apple data type | When transmitted | Purpose | Linked to identity | Tracking |
|---|---|---|---|---|
| Precise Location | User taps “Use My Location” for restaurant search | App Functionality | No account linkage; verify provider handling | No |
| Photos or Videos | User submits a label or menu image for OCR | App Functionality | No account linkage; verify provider handling | No |
| Other User Content | Ingredient text, questions, recipes, menu text, or translation content sent by an invoked network feature | App Functionality; Product Personalization where dietary context is supplied | No account linkage; may be associated with an opaque install/request identifier operationally | No |
| Health | Dietary restrictions or allergies included in an explicitly requested AI explanation or transformation | App Functionality; Product Personalization | No account linkage | No |
| Device ID / Other identifiers | Random install identifier used for abuse controls and request throttling | App Functionality; Fraud Prevention/Security | Linked to an app installation, not a named account | No |
| Diagnostics | Coarse request status, route, latency bucket, and opaque request ID if retained in production logs | App Functionality | Not intended to be linked | No |

## Important Apple “collection” decision

Apple defines collection around off-device access retained beyond what is needed to service a request. Roots application code says provider request bodies are transient and content is not logged. If production contracts and settings prove that a transmitted category is processed only in real time and not retained by Roots or its partners, the release owner may determine it is not “collected” under Apple’s definition. Do not remove a disclosure without documented provider-retention evidence.

## Data not collected for current functionality

- Contact information
- Contacts
- Payment or financial information
- Purchase history
- Browsing history
- Search history for advertising
- Fitness data
- Audio recordings
- Advertising data
- Sensitive government identifiers

## Data remaining on-device

- Dietary profile and profile name
- Scan history
- Saved products and reports
- Saved meals and restaurant notes
- Shopping data
- Favorites and local recommendation preferences
- Theme and onboarding state
- Travel destinations, cards, language packs, and recent phrases
- Cached barcode products and static offline assets

On-device storage is not encrypted by Roots independently of device/OS protections.

## Required URLs

- Privacy Policy URL: `https://YOUR_DOMAIN.example/privacy`
- User Privacy Choices URL: `https://YOUR_DOMAIN.example/privacy-choices`

These placeholders must be replaced with public HTTPS pages before submission.

## Submission verification

- Review Gemini/provider retention settings.
- Review restaurant, map, and geocoding provider terms.
- Confirm production logs contain no content, exact coordinates, profiles, images, or prompts.
- Confirm no analytics, ad, crash-reporting, or tracking SDK was added to the final binary.
- Recheck disclosures after every SDK or provider change.

## Official references

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- App Store Connect App Privacy reference: https://developer.apple.com/help/app-store-connect/reference/app-privacy/
