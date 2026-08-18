# Roots release freeze policy

The Phase 19 candidate is feature-frozen. No new feature, visual redesign, storage migration,
dietary rule, restaurant algorithm, prompt behavior, dependency upgrade, or provider integration may
enter the release branch without reopening release-candidate review.

## Allowed during freeze

- a reproducible severity-0/1 defect fix;
- production URL/origin/header configuration with no embedded secret;
- final public legal/support links;
- native signing, version/build metadata, entitlements, privacy manifests, and store assets;
- accessibility or store-review correction proven against the candidate;
- documentation that does not overstate readiness.

## Required after any source change

1. Run `node --test tests/*.test.js`.
2. Run `test_api.py` and `python -m unittest test_security.py` in the project environment.
3. Repeat startup, core navigation, scan recovery, Saved/offline, and console smoke checks.
4. Re-run secret/development-host scans on exact web and native artifacts.
5. Update the candidate report with the commit, artifacts, results, reviewer, and date.

The release owner—not the application—makes the final go/no-go decision after signing, provider,
legal, privacy, accessibility, and physical-device evidence is complete.
