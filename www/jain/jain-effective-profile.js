(function (root) {
  "use strict";
  const VERSION = 1;
  const cache = new Map();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function optionSettings(profile) { return profile?.religiousDiets?.find((item) => item.id === "jain")?.options || {}; }
  function enabledRule(rule, settings) { return settings[rule.optionKey] != null ? !!settings[rule.optionKey] : !!rule.enabledByDefault; }
  function getEffectiveProfile(args) {
    const profile = args?.profile || args || {};
    const date = args?.date || new Date();
    const settings = root.ROOTS_JAIN_PROFILE?.getSettings(profile) || { enabled: false };
    const jainOptions = optionSettings(profile);
    const dateKey = String(date).slice(0, 10);
    const key = JSON.stringify({ enabled: settings.enabled, t: settings.tradition, o: jainOptions, obs: settings.observances, date: dateKey });
    if (cache.has(key)) return cache.get(key);
    const active = root.ROOTS_JAIN_OBSERVANCES?.getActive(profile, date) || null;
    const baselineRules = root.ROOTS_JAIN_RULES.baselineRules.filter((rule) => rule.type === "baseline" && enabledRule(rule, jainOptions));
    const personalRules = root.ROOTS_JAIN_RULES.baselineRules.filter((rule) => rule.type !== "baseline" && enabledRule(rule, jainOptions));
    const traditionRules = [];
    const overrides = settings.observances?.[active?.observanceId]?.[String(active?.year)]?.overrides || {};
    const observanceRules = active?.enabled && active.observanceRulesetId ? (root.ROOTS_JAIN_RULES.observanceRules[active.observanceRulesetId] || []).filter((rule) => overrides[rule.optionKey] != null ? !!overrides[rule.optionKey] : rule.enabledByDefault !== false) : [];
    const temporaryRules = [];
    const effectiveRules = [...baselineRules, ...traditionRules, ...personalRules, ...observanceRules, ...temporaryRules];
    const fingerprint = effectiveRules.map((rule) => `${rule.id}:${rule.version}:${rule.effect}`).join("|");
    const result = Object.freeze({
      schemaVersion: 1, engineVersion: VERSION, jainEnabled: !!settings.enabled,
      tradition: settings.tradition, motherTongue: settings.motherTongue,
      baselineRules: clone(baselineRules), traditionRules, personalRules: clone(personalRules),
      observanceRules: clone(observanceRules), temporaryRules, effectiveRules: clone(effectiveRules),
      settings: clone(jainOptions), activeObservance: active?.enabled ? { id: active.observanceId, label: active.label, day: active.day, year: active.year, rulesetId: active.observanceRulesetId } : null,
      ruleVersionFingerprint: fingerprint || "jain-disabled",
    });
    cache.set(key, result);
    return result;
  }
  root.ROOTS_JAIN_EFFECTIVE_PROFILE = Object.freeze({ VERSION, getEffectiveProfile, clearCache: () => cache.clear() });
})(typeof window !== "undefined" ? window : globalThis);
