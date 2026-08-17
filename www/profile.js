(function (root) {
  "use strict";

  const D = root.ROOTS_PROFILE_DEFINITIONS;
  if (!D) throw new Error("ROOTS profile definitions must load before profile.js");

  const STORAGE_KEY = "roots-profile-v1";
  const MIGRATION_KEY = "roots-profile-migration-v1";
  const JAIN_MIGRATION_KEY = "roots-jain-unification-migration-v1";
  const JAIN_BACKUP_KEY = "roots-jain-unification-backup-v1";
  const LEGACY_BACKUP_KEY = "roots-legacy-profile-backup-v1";
  const CORRUPT_BACKUP_KEY = "roots-profile-invalid-backup-v1";
  const LEGACY_KEY = "bij-profile-v4";
  const RESTRICTION_MIGRATION_KEY = "roots-restriction-migration-v1";
  const RESTRICTION_BACKUP_KEY = "roots-restriction-backup-v1";

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const safeStorage = () => {
    try { return root.localStorage || null; } catch (_) { return null; }
  };

  function normalizeCustomTerm(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[\s,;:!?."'()[\]{}]+|[\s,;:!?."'()[\]{}]+$/g, "")
      .replace(/\.+$/g, "")
      .trim();
  }

  function generateStableLocalId(prefix, value) {
    const input = `${prefix}:${normalizeCustomTerm(value)}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(36)}`;
  }

  function dietEntry(definition, enabled) {
    return { id: definition.id, enabled: !!enabled, options: clone(definition.options || {}) };
  }

  function createDefaultProfile(options) {
    const opts = options || {};
    const timestamp = opts.timestamp || now();
    return {
      schemaVersion: D.schemaVersion,
      id: "default",
      name: "My Profile",
      createdAt: timestamp,
      updatedAt: timestamp,
      onboardingComplete: !!opts.onboardingComplete,
      religiousDiets: D.religiousDiets.map((item) => dietEntry(item, false)),
      lifestyleDiets: D.lifestyleDiets.map((item) => dietEntry(item, false)),
      allergies: [],
      crossContact: { preset: "standard", ...clone(D.crossContactPresets.standard) },
      dislikes: [],
      customRules: [],
      restrictions: [],
      restrictionSchemaVersion: 1,
      region: "US",
      appLanguage: "en",
      translationLanguage: "en",
    };
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeDietArray(value, definitions) {
    const source = Array.isArray(value) ? value : [];
    const map = new Map(source.filter(Boolean).map((item) => [item.id, item]));
    return definitions.map((definition) => {
      const current = map.get(definition.id) || {};
      return {
        id: definition.id,
        enabled: !!current.enabled,
        options: { ...clone(definition.options || {}), ...(current.options && typeof current.options === "object" ? current.options : {}) },
      };
    });
  }

  function normalizedReligiousSource(input) {
    const source = Array.isArray(input?.religiousDiets) ? clone(input.religiousDiets) : [];
    const current = source.find((item) => item?.id === "jain");
    const strict = source.find((item) => item?.id === "strict_jain");
    const custom = source.find((item) => item?.id === "custom_jain");
    if (current) return source.filter((item) => !["strict_jain", "custom_jain"].includes(item?.id));
    if (!strict && !custom) return source;
    const useCustom = !!custom?.enabled || !strict?.enabled;
    const customOptions = useCustom && custom?.options && typeof custom.options === "object" ? custom.options : {};
    const options = { ...clone(D.jainDefaults), ...customOptions };
    source.push({ id: "jain", enabled: !!(strict?.enabled || custom?.enabled), options });
    return source.filter((item) => !["strict_jain", "custom_jain"].includes(item?.id));
  }

  function normalizeAllergy(item) {
    if (!item || typeof item !== "object") return null;
    const builtIn = D.allergies.find((definition) => definition.id === item.id);
    if (builtIn) return { id: builtIn.id, label: builtIn.label, normalizedTerm: builtIn.id, type: "built_in", severity: "standard", customAliases: Array.isArray(item.customAliases) ? item.customAliases : [] };
    const term = normalizeCustomTerm(item.normalizedTerm || item.label);
    if (!term) return null;
    return {
      id: item.id || generateStableLocalId("allergy", term),
      label: String(item.label || term).trim(),
      normalizedTerm: term,
      type: "custom",
      severity: "standard",
      customAliases: [],
    };
  }

  function normalizeTermItem(item, prefix, withSeverity) {
    if (!item || typeof item !== "object") return null;
    const term = normalizeCustomTerm(item.normalizedTerm || item.label);
    if (!term) return null;
    const result = { id: item.id || generateStableLocalId(prefix, term), label: String(item.label || term).trim(), normalizedTerm: term };
    if (withSeverity) {
      result.severity = D.severityOptions.includes(item.severity) ? item.severity : "caution";
      result.aliases = Array.isArray(item.aliases) ? item.aliases.map(normalizeCustomTerm).filter(Boolean) : [];
    }
    return result;
  }

  function normalizeRestrictions(value) {
    const taxonomy = root.ROOTS_RESTRICTIONS;
    if (!taxonomy) return [];
    return uniqueBy((Array.isArray(value) ? value : []).map((item) => {
      if (!item || typeof item !== "object" || !taxonomy.getRestriction(item.id)) return null;
      return {
        id: item.id,
        enabled: item.enabled !== false,
        settings: item.settings && typeof item.settings === "object" && !Array.isArray(item.settings) ? clone(item.settings) : {},
      };
    }).filter(Boolean), (item) => item.id);
  }

  function normalizeCrossContact(value) {
    const source = value && typeof value === "object" ? value : {};
    const requestedPreset = ["standard", "strict", "custom"].includes(source.preset) ? source.preset : "standard";
    const keys = ["contains", "mayContain", "sharedEquipment", "sharedFacility"];
    if (requestedPreset === "custom" && keys.some((key) => !D.crossContactValues.includes(source[key]))) {
      return { preset: "standard", ...clone(D.crossContactPresets.standard) };
    }
    const base = requestedPreset === "strict" ? D.crossContactPresets.strict : D.crossContactPresets.standard;
    const resolved = { preset: requestedPreset };
    keys.forEach((key) => {
      resolved[key] = D.crossContactValues.includes(source[key]) ? source[key] : base[key];
    });
    if (requestedPreset !== "custom") {
      const preset = D.crossContactPresets[requestedPreset];
      Object.assign(resolved, preset);
    }
    return resolved;
  }

  function validateProfile(input) {
    if (!input || typeof input !== "object" || (input.schemaVersion != null && ![1, D.schemaVersion].includes(input.schemaVersion))) {
      return { valid: false, repairable: false, profile: null, errors: ["Unsupported or missing profile schema."] };
    }
    const timestamp = now();
    const profile = {
      ...createDefaultProfile({ timestamp }),
      ...clone(input),
      schemaVersion: D.schemaVersion,
      id: typeof input.id === "string" && input.id ? input.id : "default",
      name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "My Profile",
      createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : timestamp,
      updatedAt: typeof input.updatedAt === "string" && input.updatedAt ? input.updatedAt : timestamp,
      onboardingComplete: !!input.onboardingComplete,
      religiousDiets: normalizeDietArray(normalizedReligiousSource(input), D.religiousDiets),
      lifestyleDiets: normalizeDietArray(input.lifestyleDiets, D.lifestyleDiets),
      allergies: uniqueBy((Array.isArray(input.allergies) ? input.allergies : []).map(normalizeAllergy).filter(Boolean), (item) => item.type === "built_in" ? item.id : item.normalizedTerm),
      dislikes: uniqueBy((Array.isArray(input.dislikes) ? input.dislikes : []).map((item) => normalizeTermItem(item, "dislike", false)).filter(Boolean), (item) => item.normalizedTerm),
      customRules: uniqueBy((Array.isArray(input.customRules) ? input.customRules : []).map((item) => normalizeTermItem(item, "rule", true)).filter(Boolean), (item) => item.normalizedTerm),
      restrictions: normalizeRestrictions(input.restrictions),
      restrictionSchemaVersion: 1,
      crossContact: normalizeCrossContact(input.crossContact),
      region: typeof input.region === "string" && input.region ? input.region : "US",
      appLanguage: typeof input.appLanguage === "string" && input.appLanguage ? input.appLanguage : "en",
      translationLanguage: typeof input.translationLanguage === "string" && input.translationLanguage ? input.translationLanguage : "en",
    };
    return { valid: true, repairable: true, profile, errors: [] };
  }

  function saveActiveProfile(profile) {
    const checked = validateProfile(profile);
    if (!checked.valid) throw new Error("Profile is not valid.");
    checked.profile.updatedAt = now();
    const storage = safeStorage();
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(checked.profile));
    return clone(checked.profile);
  }

  function loadStoredProfile() {
    const storage = safeStorage();
    if (!storage) return null;
    let raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const marker = JSON.parse(storage.getItem(JAIN_MIGRATION_KEY) || "null");
      const backup = storage.getItem(JAIN_BACKUP_KEY);
      if (backup && marker && Number(marker.policyVersion || 0) < 3) {
        const repaired = validateProfile(JSON.parse(backup));
        if (repaired.valid) {
          raw = JSON.stringify(repaired.profile);
          storage.setItem(STORAGE_KEY, raw);
          storage.setItem(JAIN_MIGRATION_KEY, JSON.stringify({ schemaVersion: D.schemaVersion, migratedAt: now(), code: "jain_profile_unified", policyVersion: 3 }));
        }
      }
      const checked = validateProfile(JSON.parse(raw));
      if (!checked.valid) {
        storage.setItem(CORRUPT_BACKUP_KEY, raw);
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== D.schemaVersion || /"(strict_jain|custom_jain)"/.test(raw)) {
        if (!storage.getItem(JAIN_BACKUP_KEY)) storage.setItem(JAIN_BACKUP_KEY, raw);
        storage.setItem(STORAGE_KEY, JSON.stringify(checked.profile));
        storage.setItem(JAIN_MIGRATION_KEY, JSON.stringify({ schemaVersion: D.schemaVersion, migratedAt: now(), code: "jain_profile_unified", policyVersion: 3 }));
      }
      if (!storage.getItem(RESTRICTION_MIGRATION_KEY)) {
        if (!storage.getItem(RESTRICTION_BACKUP_KEY)) storage.setItem(RESTRICTION_BACKUP_KEY, raw);
        storage.setItem(STORAGE_KEY, JSON.stringify(checked.profile));
        storage.setItem(RESTRICTION_MIGRATION_KEY, JSON.stringify({ schemaVersion: 1, migratedAt: now(), code: "phase_6a_restriction_layer", reviewRequired: true }));
      }
      return checked.profile;
    } catch (_) {
      try { storage.setItem(CORRUPT_BACKUP_KEY, raw); } catch (_) {}
      return null;
    }
  }

  function builtInFromLegacy(value) {
    const term = normalizeCustomTerm(value);
    return D.allergies.find((item) => item.legacyAliases.includes(term));
  }

  function migrateLegacyProfile() {
    const storage = safeStorage();
    if (!storage || storage.getItem(MIGRATION_KEY)) return loadStoredProfile();
    const legacyRaw = storage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    try {
      const legacy = JSON.parse(legacyRaw);
      if (!legacy || typeof legacy !== "object") return null;
      const profile = createDefaultProfile({ onboardingComplete: true });
      profile.religiousDiets.find((item) => item.id === "jain").enabled = true;
      if (legacy.vegan) profile.lifestyleDiets.find((item) => item.id === "vegan").enabled = true;
      const allergies = [];
      (Array.isArray(legacy.checks) ? legacy.checks : []).forEach((value) => {
        const definition = builtInFromLegacy(value);
        if (definition) allergies.push(normalizeAllergy({ id: definition.id }));
        else {
          const term = normalizeCustomTerm(value);
          if (term) allergies.push(normalizeAllergy({ label: String(value), normalizedTerm: term, type: "custom" }));
        }
      });
      (Array.isArray(legacy.extra) ? legacy.extra : []).forEach((value) => {
        const term = normalizeCustomTerm(value);
        if (term) allergies.push(normalizeAllergy({ label: String(value), normalizedTerm: term, type: "custom" }));
      });
      profile.allergies = uniqueBy(allergies.filter(Boolean), (item) => item.type === "built_in" ? item.id : item.normalizedTerm);
      const checked = validateProfile(profile);
      if (!checked.valid) return null;
      storage.setItem(LEGACY_BACKUP_KEY, legacyRaw);
      storage.setItem(STORAGE_KEY, JSON.stringify(checked.profile));
      storage.setItem(MIGRATION_KEY, JSON.stringify({ schemaVersion: D.schemaVersion, migratedAt: now() }));
      storage.setItem(JAIN_MIGRATION_KEY, JSON.stringify({ schemaVersion: D.schemaVersion, migratedAt: now(), code: "legacy_profile_to_jain", policyVersion: 3 }));
      return clone(checked.profile);
    } catch (_) { return null; }
  }

  function getActiveProfile() {
    return loadStoredProfile() || migrateLegacyProfile();
  }

  function setDietSelection(profile, category, id, enabled) {
    const key = category === "religious" ? "religiousDiets" : "lifestyleDiets";
    const list = profile[key];
    if (id === "none") {
      list.forEach((item) => { item.enabled = false; });
      return profile;
    }
    const item = list.find((entry) => entry.id === id);
    if (item) item.enabled = !!enabled;
    return profile;
  }

  function applyCrossContactPreset(profile, preset) {
    if (preset === "custom") profile.crossContact = { ...profile.crossContact, preset: "custom" };
    else profile.crossContact = { preset, ...clone(D.crossContactPresets[preset] || D.crossContactPresets.standard) };
    return profile;
  }

  function setCrossContactValue(profile, key, value) {
    if (["contains", "mayContain", "sharedEquipment", "sharedFacility"].includes(key) && D.crossContactValues.includes(value)) {
      profile.crossContact[key] = value;
      profile.crossContact.preset = "custom";
    }
    return profile;
  }

  function setRestriction(profile, id, enabled, settings) {
    const definition = root.ROOTS_RESTRICTIONS?.getRestriction(id);
    if (!definition) return profile;
    if (!Array.isArray(profile.restrictions)) profile.restrictions = [];
    const index = profile.restrictions.findIndex((item) => item.id === id);
    if (!enabled) {
      if (index >= 0) profile.restrictions.splice(index, 1);
      return profile;
    }
    const previous = index >= 0 ? profile.restrictions[index].settings || {} : {};
    const next = { id, enabled: true, settings: { ...definition.defaultSettings, ...previous, ...(settings || {}) } };
    if (index >= 0) profile.restrictions[index] = next;
    else profile.restrictions.push(next);
    return profile;
  }

  const labelsFor = (entries, definitions) => entries.filter((item) => item.enabled).map((item) => definitions.find((definition) => definition.id === item.id)?.label || item.id);
  function profileParts(profile) {
    const expanded = (profile.restrictions || []).filter((item) => item.enabled !== false).map((item) => root.ROOTS_RESTRICTIONS?.getRestriction(item.id)).filter(Boolean);
    return {
      religious: labelsFor(profile.religiousDiets, D.religiousDiets),
      lifestyle: labelsFor(profile.lifestyleDiets, D.lifestyleDiets),
      allergies: profile.allergies.map((item) => item.label),
      dislikes: profile.dislikes.map((item) => item.label),
      rules: profile.customRules.map((item) => `${item.severity === "preference" ? "Prefer to avoid" : item.severity === "avoid" ? "Avoid" : "Caution"} ${item.label}`),
      restrictions: expanded.map((item) => item.label),
    };
  }

  function describeProfile(profile) {
    const parts = profileParts(profile);
    const chunks = [];
    if (parts.religious.length) chunks.push(`Religious: ${parts.religious.join(", ")}`);
    if (parts.lifestyle.length) chunks.push(`Lifestyle: ${parts.lifestyle.join(", ")}`);
    if (parts.allergies.length) chunks.push(`Allergies: ${parts.allergies.join(", ")}`);
    chunks.push(`Cross-contact: ${profile.crossContact.preset}`);
    if (parts.rules.length) chunks.push(`Custom restrictions: ${parts.rules.join(", ")}`);
    if (parts.restrictions.length) chunks.push(`Expanded restrictions: ${parts.restrictions.join(", ")}`);
    if (parts.dislikes.length) chunks.push(`Dislikes: ${parts.dislikes.join(", ")}`);
    return chunks.join(" · ");
  }

  function getCompactProfileSummary(profile) {
    const parts = profileParts(profile);
    const primary = [...parts.religious, ...parts.lifestyle].slice(0, 2);
    if (parts.allergies.length) primary.push(`${parts.allergies[0]} allergy`);
    return primary.length ? primary.join(" · ") : "No dietary preferences selected";
  }

  function getProfileForAI(profile) {
    const parts = profileParts(profile);
    const lines = ["The user's ROOTS profile includes:"];
    if (parts.religious.length) lines.push("\nReligious diets:", ...parts.religious.map((item) => `- ${item}`));
    const jain = profile.religiousDiets.find((item) => item.id === "jain" && item.enabled);
    if (jain) {
      const labels = {
        avoidMeatFishSeafood: "Avoid meat, fish, and seafood",
        avoidEggs: "Avoid eggs",
        avoidOnionGarlic: "Avoid onion and garlic",
        avoidAllRootVegetables: "Avoid root vegetables",
        avoidHoney: "Avoid honey",
        avoidAnimalDerivedAdditives: "Avoid animal-derived additives",
        avoidFermentedIngredients: "Avoid fermented ingredients",
        avoidMushrooms: "Avoid mushrooms",
        avoidArtificialAdditives: "Avoid artificial additives",
      };
      lines.push("\nJain settings:");
      Object.entries(labels).forEach(([key, label]) => lines.push(`- ${jain.options[key] ? label : label.replace(/^Avoid /, "Allows ")}`));
      lines.push("- Respect these selected settings without generalizing them to all Jain practice.");
    }
    if (parts.lifestyle.length) lines.push("\nLifestyle:", ...parts.lifestyle.map((item) => `- ${item}`));
    if (parts.allergies.length) lines.push("\nAllergies:", ...parts.allergies.map((item) => `- ${item}`));
    lines.push("\nCross-contact:", `- Treat “contains” as ${profile.crossContact.contains}`, `- Treat “may contain” as ${profile.crossContact.mayContain}`, `- Treat shared equipment as ${profile.crossContact.sharedEquipment}`, `- Treat shared facility as ${profile.crossContact.sharedFacility}`);
    if (parts.rules.length) lines.push("\nCustom restrictions:", ...parts.rules.map((item) => `- ${item}`));
    if (parts.restrictions.length) lines.push("\nAdditional configured restrictions:", ...parts.restrictions.map((item) => `- ${item}`));
    if (parts.dislikes.length) lines.push("\nDislikes:", ...parts.dislikes.map((item) => `- ${item}`));
    lines.push("\nThis is profile context only. Never override deterministic scan classifications.");
    return lines.join("\n");
  }

  root.ROOTS_PROFILE = {
    keys: { profile: STORAGE_KEY, migration: MIGRATION_KEY, legacyBackup: LEGACY_BACKUP_KEY, legacy: LEGACY_KEY, jainMigration: JAIN_MIGRATION_KEY, jainBackup: JAIN_BACKUP_KEY, restrictionMigration: RESTRICTION_MIGRATION_KEY, restrictionBackup: RESTRICTION_BACKUP_KEY },
    createDefaultProfile, validateProfile, saveActiveProfile, getActiveProfile, migrateLegacyProfile,
    normalizeCustomTerm, generateStableLocalId, setDietSelection, applyCrossContactPreset,
    setCrossContactValue, setRestriction, describeProfile, getCompactProfileSummary, getProfileForAI,
    definitions: D, clone,
  };
})(typeof window !== "undefined" ? window : globalThis);
