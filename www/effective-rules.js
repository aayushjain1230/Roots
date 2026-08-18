(function (root) {
  "use strict";

  const VERSION = 1;
  const TYPE_ORDER = ["allergy", "medical", "religious", "lifestyle", "custom"];

  function enabledEntries(value) {
    if (Array.isArray(value)) return value
      .filter((entry) => typeof entry !== "object" || entry?.enabled !== false)
      .map((entry) => typeof entry === "object" ? entry?.id : entry)
      .filter(Boolean)
      .map(String);
    if (!value || typeof value !== "object") return [];
    return Object.keys(value).filter((key) => value[key] === true || value[key]?.enabled === true);
  }

  function addRule(target, seen, rule) {
    if (!rule?.id || seen.has(rule.id)) return;
    seen.add(rule.id);
    target.push(Object.freeze({ enabled: true, ...rule }));
  }

  function expand(profile) {
    const original = profile && typeof profile === "object" ? profile : {};
    const source = root.ROOTS_DIETARY_FEATURES?.projectProfile?.(original) || original;
    const rules = [];
    const seen = new Set();

    enabledEntries(source.allergies).forEach((id) => addRule(rules, seen, {
      id: `allergy:${id}`, type: "allergy", preset: id,
      severity: source.allergySeverity?.[id] || "avoid",
      crossContact: source.crossContact?.[id] || source.crossContactPreference || "ask",
      source: "profile"
    }));
    enabledEntries(source.medicalDiets || source.medicalRestrictions).forEach((id) => addRule(rules, seen, {
      id: `medical:${id}`, type: "medical", preset: id, severity: "avoid", source: "profile"
    }));
    enabledEntries(source.religiousDiets).forEach((id) => addRule(rules, seen, {
      id: `religious:${id}`, type: "religious", preset: id, settings: source.dietSettings?.[id] || {}, source: "profile"
    }));
    enabledEntries(source.lifestyleDiets).forEach((id) => addRule(rules, seen, {
      id: `lifestyle:${id}`, type: "lifestyle", preset: id, settings: source.dietSettings?.[id] || {}, source: "profile"
    }));

    const restrictions = root.ROOTS_RESTRICTIONS?.normalizeProfileRestrictions?.(source) || [];
    restrictions.forEach((entry) => {
      const type = entry.category === "allergy" ? "allergy" : entry.category === "religious" ? "religious" : entry.category === "medical" ? "medical" : "lifestyle";
      addRule(rules, seen, { id: `${type}:${entry.id}`, type, preset: entry.id, severity: entry.severity || "avoid", source: "profile_restriction" });
    });

    (Array.isArray(source.customRules) ? source.customRules : []).forEach((entry, index) => {
      const label = String(entry?.label || entry?.ingredient || "").trim();
      if (!label) return;
      addRule(rules, seen, { id: `custom:${entry.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`, type: "custom", label, severity: entry.severity || "avoid", source: "profile" });
    });

    rules.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.id.localeCompare(b.id));
    const fingerprint = rules.map((rule) => `${rule.id}:${rule.severity || "default"}:${JSON.stringify(rule.settings || {})}`).join("|");
    return Object.freeze({ version: VERSION, profileId: source.id || null, profileUpdatedAt: source.updatedAt || null, rules: Object.freeze(rules), fingerprint });
  }

  root.ROOTS_EFFECTIVE_RULES = Object.freeze({ VERSION, expand });
})(typeof window !== "undefined" ? window : globalThis);
