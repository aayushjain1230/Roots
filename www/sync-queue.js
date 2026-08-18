(function (root) {
  "use strict";
  const KEY = "roots-sync-queue-v1", VERSION = 1, MAX_ITEMS = 120, MAX_PAYLOAD_BYTES = 24000;
  const TYPES = new Set(["profile", "saved_item", "scan_history", "evidence_correction", "formulation_change", "community_correction", "cache_metadata"]);
  const processors = new Map();
  let processing = false;
  const now = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function read() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.schemaVersion === VERSION && TYPES.has(item.type)).slice(0, MAX_ITEMS) : [];
    } catch (_) { return []; }
  }
  function write(items) {
    try { root.localStorage?.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS))); return true; }
    catch (_) { return false; }
  }
  function safePayload(value) {
    const payload = clone(value || {});
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).length > MAX_PAYLOAD_BYTES) throw new TypeError("Sync item is too large.");
    return payload;
  }
  function enqueue(type, payload, options) {
    if (!TYPES.has(type)) throw new TypeError("Unsupported sync item type.");
    const createdAt = now();
    const item = {
      schemaVersion: VERSION, id: options?.id || `sync-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type, payload: safePayload(payload), createdAt, updatedAt: createdAt, attempts: 0,
      lastError: "", syncStatus: "PENDING", nextAttemptAt: createdAt,
      localVersion: Number(options?.localVersion || payload?.version || 1),
    };
    const items = read().filter((entry) => entry.id !== item.id);
    if (!write([item, ...items])) throw Object.assign(new Error("The sync item could not be saved on this device."), { code: "storage_full" });
    return clone(item);
  }
  const delayFor = (attempts) => Math.min(24 * 60 * 60 * 1000, 60 * 1000 * (2 ** Math.min(8, Math.max(0, attempts - 1))));
  async function process(options) {
    if (processing || root.ROOTS_CONNECTIVITY?.get?.().online !== true) return { processed: 0, failed: 0, pending: read().filter((item) => item.syncStatus !== "SYNCED").length };
    processing = true;
    let processed = 0, failed = 0;
    try {
      const items = read();
      for (const item of items) {
        if (!["PENDING", "FAILED"].includes(item.syncStatus) || Date.parse(item.nextAttemptAt || 0) > Date.now()) continue;
        const processor = processors.get(item.type);
        if (!processor) continue;
        item.syncStatus = "SYNCING"; item.updatedAt = now(); write(items);
        try {
          await processor(clone(item), options || {});
          item.syncStatus = "SYNCED"; item.lastError = ""; item.updatedAt = now(); processed += 1;
        } catch (error) {
          item.attempts += 1; item.syncStatus = "FAILED"; item.lastError = String(error?.code || error?.message || "sync_failed").slice(0, 160);
          item.updatedAt = now(); item.nextAttemptAt = new Date(Date.now() + delayFor(item.attempts)).toISOString(); failed += 1;
        }
        write(items);
      }
      write(items.filter((item) => item.syncStatus !== "SYNCED" || Date.now() - Date.parse(item.updatedAt) < 86400000));
      return { processed, failed, pending: read().filter((item) => item.syncStatus !== "SYNCED").length };
    } finally { processing = false; }
  }
  function registerProcessor(type, processor) {
    if (!TYPES.has(type) || typeof processor !== "function") throw new TypeError("A supported sync type and processor are required.");
    processors.set(type, processor); return () => processors.delete(type);
  }
  function resolveConflict(local, remote) {
    const localVersion = Number(local?.version || 0), remoteVersion = Number(remote?.version || 0);
    if (localVersion !== remoteVersion) return { status: "resolved", winner: localVersion > remoteVersion ? "local" : "remote", value: clone(localVersion > remoteVersion ? local : remote) };
    const localAt = Date.parse(local?.updatedAt || 0), remoteAt = Date.parse(remote?.updatedAt || 0);
    if (localAt !== remoteAt) return { status: "resolved", winner: localAt > remoteAt ? "local" : "remote", value: clone(localAt > remoteAt ? local : remote) };
    if (JSON.stringify(local) === JSON.stringify(remote)) return { status: "identical", winner: "either", value: clone(local) };
    return { status: "needs_review", winner: null, local: clone(local), remote: clone(remote) };
  }
  root.addEventListener?.("roots:connectionrestored", () => { process().catch(() => {}); });
  root.ROOTS_SYNC_QUEUE = Object.freeze({ enqueue, process, registerProcessor, resolveConflict, getItems: () => clone(read()), clearSynced: () => write(read().filter((item) => item.syncStatus !== "SYNCED")), constants: { KEY, VERSION, MAX_ITEMS, TYPES: [...TYPES] } });
})(typeof window !== "undefined" ? window : globalThis);

