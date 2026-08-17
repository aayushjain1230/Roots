# Roots — Google Play Data Safety Draft

This worksheet uses a conservative interpretation of Google Play’s requirement to declare data transmitted off-device, including data handled by SDKs and service providers. The release owner remains responsible for the final Play Console answers.

## Data collection and security

- Does the app collect or share required user-data types? **Yes**
- Is all transmitted user data encrypted in transit? **Must be Yes for release; production HTTPS verification is currently blocked**
- Is data shared for advertising or sold? **No**
- Can users request deletion of server-retained content? **Not applicable if production content is processed ephemerally and not retained; verify operations and provider contracts**
- Can users delete on-device data? **Granular local deletion exists; a single delete-all workflow is not documented**
- Account creation: **No account system**

## Data types to declare

| Play category | Data type | Collected | Shared | Required/optional | Purpose |
|---|---|---:|---:|---|---|
| Location | Precise location | Yes, when invoked | With configured restaurant/map provider acting as service provider | Optional | App functionality |
| Personal info | Other info / dietary profile context | Yes, only for invoked AI features that include profile context | With protected AI provider acting as service provider | Optional | App functionality; personalization |
| Health and fitness | Health info, including user-provided allergies or medical-style dietary restrictions | Yes when included in an invoked network request | With protected AI provider acting as service provider | Optional | App functionality; personalization |
| Photos and videos | Photos | Yes for label or menu OCR | With protected OCR provider acting as service provider | Optional | App functionality |
| App activity | Other user-generated content | Yes: questions, recipe text, menu/ingredient text, translations | With protected provider acting as service provider | Optional | App functionality |
| Device or other IDs | Other IDs | Yes: random install identifier for abuse controls | No sale/advertising sharing | Required for protected requests | Security, fraud prevention, app functionality |
| App info and performance | Diagnostics | Potentially: coarse status, error code, route, latency bucket, request ID | With hosting infrastructure/service provider | Required for network operations if retained | App functionality, security |

“Shared” in Play Console has specific exceptions for service-provider transfers. Confirm each production provider contract before selecting the final Shared value; the table describes the actual transfer even where Play may treat it as non-sharing.

## Ephemeral processing

OCR images, prompts, translations, and provider response bodies are intended to be processed transiently. Roots application code does not persist these request bodies on the backend. Google still requires off-device transmission to be declared in the form even when ephemeral-processing treatment applies.

## Data stored only on the device

- Profiles, allergies, and custom restrictions except minimal context included in an invoked network action
- History and Saved
- Meals, notes, questions, and restaurant memory
- Favorites and recommendation preferences
- Shopping data
- Theme and navigation state
- Travel destinations, cards, packs, and phrases
- Cached product and app-shell data

## Data never used for

- Advertising
- Cross-app tracking
- Data brokerage
- Credit scoring
- Eligibility decisions
- Unrelated marketing

## Required pre-submission checks

- Replace the local backend URL with the production HTTPS endpoint.
- Verify encryption in transit for every provider.
- Verify provider retention/deletion terms.
- Verify no analytics or advertising SDK exists in the release artifact.
- Publish the privacy policy at `https://YOUR_DOMAIN.example/privacy`.
- Reconcile the final permissions and SDK inventory against the uploaded AAB.

## Official reference

- Google Play Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469
