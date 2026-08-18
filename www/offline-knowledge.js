(function (root) {
  "use strict";
  const KEY = "roots-offline-knowledge-pack-v1", BACKUP_KEY = "roots-offline-knowledge-pack-backup-v1", SCHEMA_VERSION = 1, MAX_RECORDS = 1200;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value, limit = 120) => String(value ?? "").normalize("NFKC").trim().slice(0, limit);
  const normalize = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
  function bundledManifest() {
    const knowledge = root.ROOTS_INGREDIENT_KNOWLEDGE;
    return { schemaVersion: SCHEMA_VERSION, version: String(knowledge?.version || "unknown"), source: "bundled_roots", installedAt: "", updatedAt: "", records: [] };
  }
  function validate(pack) {
    if (!pack || pack.schemaVersion !== SCHEMA_VERSION || !/^[a-z0-9._-]{1,40}$/i.test(String(pack.version || "")) || pack.source !== "roots_official") return { valid: false, error: "Knowledge package metadata is invalid." };
    if (!Array.isArray(pack.records) || pack.records.length > MAX_RECORDS) return { valid: false, error: "Knowledge package records are invalid." };
    const ids = new Set();
    for (const item of pack.records) {
      if (!/^[a-z0-9_]{1,80}$/.test(String(item?.id || "")) || ids.has(item.id) || !clean(item.label)) return { valid: false, error: "Knowledge package contains an invalid ingredient." };
      ids.add(item.id);
      if (!Array.isArray(item.aliases) || item.aliases.length > 80 || item.aliases.some((alias) => !clean(alias))) return { valid: false, error: "Knowledge package aliases are invalid." };
    }
    return { valid: true };
  }
  function stored() { try { return JSON.parse(root.localStorage?.getItem(KEY) || "null"); } catch (_) { return null; } }
  function activePack() { const candidate = stored(); return validate(candidate).valid ? candidate : bundledManifest(); }
  function install(pack) {
    const checked = validate(pack); if (!checked.valid) throw new TypeError(checked.error);
    const current = stored();
    const next = { ...clone(pack), installedAt: new Date().toISOString(), updatedAt: clean(pack.updatedAt, 60) || new Date().toISOString() };
    try {
      if (current && validate(current).valid) root.localStorage?.setItem(BACKUP_KEY, JSON.stringify(current));
      root.localStorage?.setItem(KEY, JSON.stringify(next));
      if (!validate(stored()).valid) throw new Error("Knowledge package verification failed after storage.");
      root.ROOTS_INGREDIENT_PARSER?.clearNormalizationCache?.();
      return clone(next);
    } catch (error) {
      if (current) root.localStorage?.setItem(KEY, JSON.stringify(current)); else root.localStorage?.removeItem(KEY);
      throw error;
    }
  }
  function rollback() {
    try {
      const backup = JSON.parse(root.localStorage?.getItem(BACKUP_KEY) || "null");
      if (!validate(backup).valid) return false;
      root.localStorage.setItem(KEY, JSON.stringify(backup)); root.ROOTS_INGREDIENT_PARSER?.clearNormalizationCache?.(); return true;
    } catch (_) { return false; }
  }
  function records() { return activePack().records || []; }
  function findAlias(value) {
    const key = normalize(value); if (!key) return null;
    const item = records().find((record) => normalize(record.label) === key || record.aliases.some((alias) => normalize(alias) === key));
    return item ? clone(item) : null;
  }
  function correction(value) {
    const key = normalize(value); if (!key) return null;
    const item = records().find((record) => record.ocrVariants && Object.prototype.hasOwnProperty.call(record.ocrVariants, key));
    return item ? clean(item.ocrVariants[key]) : null;
  }
  function status() {
    const pack = activePack();
    return { schemaVersion: SCHEMA_VERSION, version: pack.version, source: pack.source, installedAt: pack.installedAt || null, updatedAt: pack.updatedAt || null, recordCount: (root.ROOTS_INGREDIENT_KNOWLEDGE?.records?.length || 0) + records().length, rollbackAvailable: !!root.localStorage?.getItem(BACKUP_KEY) };
  }
  root.ROOTS_OFFLINE_KNOWLEDGE = Object.freeze({ getStatus: status, getRecords: () => clone(records()), findAlias, getOcrCorrection: correction, validate, install, rollback, constants: { KEY, BACKUP_KEY, SCHEMA_VERSION, MAX_RECORDS } });
})(typeof window !== "undefined" ? window : globalThis);

