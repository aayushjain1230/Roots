# ROOTS launch focus and offline architecture

## Launch availability

`www/dietary-feature-availability.js` is the single rollout policy. Jain, the Big 9 allergens,
and custom ingredient avoids are active. Other implemented modes remain in the taxonomy and
profile schema for migration and later rollout, but are neither selectable nor evaluated for the
launch experience. Projection creates a copy; it never rewrites a stored profile.

## Connectivity

`www/connectivity.js` owns the `ONLINE`, `OFFLINE`, and `DEGRADED` states. Feature modules consume
its snapshot instead of reading the browser connectivity hint independently. A successful request
restores `ONLINE`; a failed request becomes `DEGRADED` unless the platform has confirmed offline.

## Offline capability boundary

- The app shell, profile, deterministic rules, ingredient knowledge, history, Saved data, and
  previously cached barcode products work locally.
- Label OCR works offline only when `TextDetector` exists or a Capacitor/native adapter exposes
  `ROOTS_LOCAL_OCR_PROVIDER.extractText`. Its raw result is review-required evidence.
- An uncached barcode cannot resolve offline. ROOTS offers ingredient-label scanning instead.
- Restaurant discovery, new translations, and AI require network service. Existing saved/cached
  restaurant and travel records remain available and retain source/freshness metadata.

## Trust and speed

Local ingredient parsing and dietary evaluation remain deterministic. Offline reports explicitly
say that manufacturer and certification verification was unavailable. Performance tasks cover
camera readiness, barcode detection, OCR, parsing, dietary evaluation, first useful result, and
online enrichment. Telemetry remains local/disabled unless the existing consent mechanism enables it.

## Known platform limitation

Browser `TextDetector` support is not universal. A production iOS/Android release needs a vetted
Capacitor OCR adapter implementing the documented local provider contract before offline OCR can be
promised on every supported device.
