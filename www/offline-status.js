(function (root) {
  "use strict";
  const parse = (key, fallback) => { try { const value = JSON.parse(root.localStorage?.getItem(key) || "null"); return value ?? fallback; } catch (_) { return fallback; } };
  const bytes = () => {
    try { let total = 0; for (let index = 0; index < root.localStorage.length; index += 1) { const key = root.localStorage.key(index); total += new Blob([key, root.localStorage.getItem(key) || ""]).size; } return total; }
    catch (_) { return 0; }
  };
  const count = (value) => Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0;
  async function snapshot() {
    let travelPacks = [];
    try {
      if (!root.ROOTS_TRAVEL_PACKS && root.ROOTS_FEATURES) await root.ROOTS_FEATURES.loadGroup("travel");
      travelPacks = await root.ROOTS_TRAVEL_PACKS?.getInstalled?.() || [];
    } catch (_) { travelPacks = []; }
    const connection = root.ROOTS_CONNECTIVITY?.get?.() || { state: "UNKNOWN" };
    return {
      connection, knowledge: root.ROOTS_OFFLINE_KNOWLEDGE?.getStatus?.() || null,
      localOcr: root.BIJ_OCR?.localOcrAvailable?.() === true,
      cachedProducts: count(parse("bij-product-cache-v1", {})),
      cachedRestaurantSearches: count(parse("roots-restaurant-cache-v1", [])),
      savedMenus: count(parse("roots-restaurant-menus-v1", [])),
      savedProducts: count(parse("roots-saved-products-v1", [])),
      history: count(parse("bij-scan-history-v4", [])),
      travelPacks: travelPacks.map((pack) => ({ id: pack.id, region: pack.region, language: pack.language, version: pack.version, downloadedAt: pack.downloadedAt, sizeBytes: pack.sizeBytes })),
      pendingSync: root.ROOTS_SYNC_QUEUE?.getItems?.().filter((item) => item.syncStatus !== "SYNCED").length || 0,
      cacheBytes: bytes(),
    };
  }
  const formatBytes = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
  async function render() {
    const host = document.getElementById("offline-settings-summary"), state = document.getElementById("offline-connection-state");
    if (!host || !state) return;
    const data = await snapshot();
    state.textContent = data.connection.state === "ONLINE" ? "Online" : data.connection.state === "DEGRADED" ? "Limited connection" : "Offline mode";
    const travel = data.travelPacks.length ? data.travelPacks.map((pack) => `${pack.region} · ${pack.language}`).join(", ") : "None downloaded";
    host.innerHTML = [
      ["Offline core", "Downloaded"], ["Ingredient intelligence", `Version ${data.knowledge?.version || "bundled"}`],
      ["OCR", data.localOcr ? "Available on this device" : "Online OCR only on this device"], ["Dietary Passport", "Available"],
      ["Cached products", String(data.cachedProducts)], ["Cached restaurant searches", String(data.cachedRestaurantSearches)],
      ["Saved menus", String(data.savedMenus)], ["Travel packs", travel], ["Pending sync", String(data.pendingSync)], ["Local data size", formatBytes(data.cacheBytes)],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("");
  }
  function setStatus(message) { const output = document.getElementById("offline-settings-status"); if (output) output.textContent = message; }
  async function clearCaches() {
    if (!root.confirm?.("Clear cached product lookups and restaurant searches? Saved products, menus, history, and profiles will remain.")) return false;
    root.BIJ_FOODFACTS?.clearCache?.();
    root.localStorage?.removeItem("roots-restaurant-cache-v1"); root.localStorage?.removeItem("roots-menu-ocr-cache-v1");
    setStatus("Cached lookups cleared. Saved information was not deleted."); await render(); return true;
  }
  function init() {
    document.getElementById("update-offline-data")?.addEventListener("click", async () => { await render(); setStatus("Local offline data checked."); });
    document.getElementById("clear-offline-cache")?.addEventListener("click", clearCaches);
    root.ROOTS_CONNECTIVITY?.subscribe?.(() => render());
    document.getElementById("settings-btn")?.addEventListener("click", () => render());
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
  root.ROOTS_OFFLINE_STATUS = Object.freeze({ snapshot, render, clearCaches });
})(typeof window !== "undefined" ? window : globalThis);

