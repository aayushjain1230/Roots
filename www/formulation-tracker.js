(function (root) {
  "use strict";
  const PENDING_KEY = "roots-pending-formulation-check-v1", EVENTS_KEY = "roots-formulation-events-v1", LIMIT = 40;
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function fingerprint(value) { let hash = 2166136261; for (const char of normalize(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(36); }
  function begin(product) {
    if (!product?.code) return false;
    const record = { barcode: String(product.code), productName: String(product.name || "").slice(0, 200), cachedFingerprint: fingerprint(product.rawIngredientText), cachedVerifiedAt: product.verifiedAt || "", createdAt: new Date().toISOString() };
    try { root.localStorage?.setItem(PENDING_KEY, JSON.stringify(record)); return true; } catch (_) { return false; }
  }
  function pending() { try { return JSON.parse(root.localStorage?.getItem(PENDING_KEY) || "null"); } catch (_) { return null; } }
  function compare(labelText) {
    const check = pending(); if (!check || !normalize(labelText)) return null;
    const labelFingerprint = fingerprint(labelText), changed = labelFingerprint !== check.cachedFingerprint;
    const event = { schemaVersion: 1, id: `formulation-${check.barcode}-${Date.now().toString(36)}`, barcode: check.barcode, productName: check.productName, cachedFingerprint: check.cachedFingerprint, labelFingerprint, cachedVerifiedAt: check.cachedVerifiedAt, observedAt: new Date().toISOString(), changed, networkState: root.ROOTS_CONNECTIVITY?.get?.().state || "UNKNOWN", source: "physical_label" };
    try {
      const items = JSON.parse(root.localStorage?.getItem(EVENTS_KEY) || "[]");
      root.localStorage?.setItem(EVENTS_KEY, JSON.stringify([event, ...(Array.isArray(items) ? items : [])].slice(0, LIMIT)));
      root.localStorage?.removeItem(PENDING_KEY);
    } catch (_) { /* scan result remains valid even if event persistence fails */ }
    if (changed) root.ROOTS_SYNC_QUEUE?.enqueue?.("formulation_change", { eventId: event.id, barcode: event.barcode, observedAt: event.observedAt }, { id: `sync-${event.id}` });
    return event;
  }
  root.ROOTS_FORMULATION_TRACKER = Object.freeze({ begin, compare, getPending: pending, getEvents: () => { try { return JSON.parse(root.localStorage?.getItem(EVENTS_KEY) || "[]"); } catch (_) { return []; } }, constants: { PENDING_KEY, EVENTS_KEY, LIMIT } });
})(typeof window !== "undefined" ? window : globalThis);
