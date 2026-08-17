(function (root) {
  "use strict";
  const KEY = "roots-explanation-cache-v1", VERSION = 1, LIMIT = 40, TTL = 14 * 24 * 60 * 60 * 1000;
  const hash = (value) => {
    let result = 2166136261;
    for (const char of JSON.stringify(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
  };
  const read = () => { try { const records = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(records) ? records : []; } catch (_) { return []; } };
  const write = (records) => { try { localStorage.setItem(KEY, JSON.stringify(records.slice(0, LIMIT))); } catch (_) { /* offline cache is optional */ } };
  function fingerprint(context, mode, language, promptVersion) {
    return hash({
      subject: context.subject, verdict: context.verdict,
      restrictions: context.reasons.map((item) => [item.restrictionId, item.id, item.evidenceLevel, item.evidenceType, item.userSettings]),
      evidence: context.evidence, mode, language, promptVersion,
      engine: context.engine,
    });
  }
  function get(context, mode, language = "en", promptVersion = 1) {
    const key = fingerprint(context, mode, language, promptVersion), now = Date.now();
    const records = read().filter((item) => Date.parse(item.expiresAt) > now);
    if (records.length !== read().length) write(records);
    const record = records.find((item) => item.contextFingerprint === key);
    return record ? { ...record.output, cached: true, cacheCreatedAt: record.createdAt } : null;
  }
  function set(context, mode, language, output, options) {
    const promptVersion = options?.promptVersion || 1;
    const contextFingerprint = fingerprint(context, mode, language, promptVersion);
    const now = Date.now();
    const record = {
      schemaVersion: VERSION, id: `explanation-${contextFingerprint}`,
      contextFingerprint, mode, language, modelId: options?.modelId || "approved-backend-model",
      promptVersion, engineVersions: context.engine, output,
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString(),
    };
    write([record, ...read().filter((item) => item.contextFingerprint !== contextFingerprint && Date.parse(item.expiresAt) > now)]);
    return output;
  }
  function clear(options) {
    if (!options || (!options.mode && !options.language)) { try { localStorage.removeItem(KEY); } catch (_) {} return 0; }
    const kept = read().filter((item) => options.mode && item.mode !== options.mode || options.language && item.language !== options.language);
    write(kept); return kept.length;
  }
  root.ROOTS_EXPLANATION_CACHE = { get, set, clear, fingerprint, constants: { KEY, VERSION, LIMIT, TTL } };
})(typeof window !== "undefined" ? window : globalThis);
