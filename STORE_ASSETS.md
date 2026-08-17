# Roots Store Assets

Status: Copy and capture plan complete; final production screenshot set blocked by missing release build/data fixtures.

## Branding rules

- Public name: **Roots**
- Use only the finalized leaf/stem/root mark.
- Never use “ROOTS,” “But Is It Jain,” “BIJ,” old checkmark artwork, or old scanner artwork.
- Use the current navy/coral palette, Sora display typography, and Plus Jakarta Sans body typography.
- Do not place compatibility claims over a screenshot unless the underlying visible evidence supports them.

## Screenshot set and captions

| Order | Screen | Caption | Required visible proof |
|---:|---|---|---|
| 1 | Home | Food decisions, made clearer. | Roots title, profile summary, scan actions |
| 2 | Scan Product | Scan a barcode or ingredient label. | Real camera/source workflow; no mock scan result |
| 3 | Ingredient Report | Understand every ingredient. | Deterministic verdict, reasons, evidence, unknowns |
| 4 | Restaurant Finder | Find restaurants that fit your profile. | Realistic location and provider-backed results |
| 5 | Restaurant Dish Analysis | See what needs confirmation. | Dish verdict, evidence, modification, Why panel |
| 6 | AI Assistant | Ask questions with evidence in view. | Honest deterministic-boundary message |
| 7 | Meal Builder | Build an order that fits. | Menu-supported options and live meal verdict |
| 8 | Travel Mode | Travel with confidence. | Dining card, language, and communication controls |
| 9 | Saved | Keep useful choices close. | Real saved product/meal/history fixtures |

## Capture requirements

- Capture from the final signed or production-equivalent build.
- Use a dedicated demo profile and non-personal fixture data.
- Use no real user name, exact location, allergy history, or restaurant notes.
- Ensure demo restaurant/product data comes from a real provider or approved deterministic fixtures clearly isolated from production.
- Use one appearance consistently per set; prepare a second appearance only if it adds value.
- Remove status-bar personal information and notifications.
- Do not show API errors, empty placeholders, setup banners, debug controls, or browser chrome.
- Verify captions and screenshots remain readable at store thumbnail size.

## Recommended source sizes

Create source captures at the largest accepted portrait phone size, then export store-specific variants without stretching. Validate current Apple and Google requirements in their consoles immediately before upload because accepted device classes can change.

## Files captured during this documentation phase

- `store-assets/roots-home.png` — current rendered Home, suitable only as a review proof.
- `store-assets/roots-scan-product.png` — current label-scan source chooser, suitable only as a review proof.
- `store-assets/roots-ai.png` — current AI landing state, suitable only as a review proof.
- `store-assets/roots-restaurants.png` — current restaurant entry state, suitable only as a review proof.
- `store-assets/roots-saved.png` — current Saved screen, suitable only as a review proof.

The Ingredient Report, Dish Analysis, Meal Builder, and Travel Mode captures require approved
realistic fixtures, production provider data, or a working production-equivalent entry state. They
must not be fabricated. Current captures also expose legacy all-caps branding in some body copy, so
they are review proofs rather than upload-ready marketing assets. Therefore the nine-image final
store set is a launch blocker.

## Caption overlay template

- Keep the screenshot unaltered inside a device-safe frame.
- Place one caption above it, maximum two short lines.
- Use the Roots display typeface at moderate weight.
- Use an off-white or near-black background with strong contrast.
- Keep the brand mark small; the product screen is the focus.
- Do not add ratings, percentages, “AI-powered” claims, medical claims, or safety guarantees.
