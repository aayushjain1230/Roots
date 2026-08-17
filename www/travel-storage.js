(function (root) {
  "use strict";
  const DB_NAME = "roots-travel-v1", DB_VERSION = 1;
  const STORES = Object.freeze(["destinations", "packs", "cards", "phrases"]);
  const memory = new Map(STORES.map((name) => [name, new Map()]));
  function database() {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => STORES.forEach((name) => { if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" }); });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Travel storage is unavailable."));
    });
  }
  async function operation(store, mode, action) {
    if (!STORES.includes(store)) throw new TypeError("Unknown travel storage collection.");
    const db = await database();
    if (!db) return action(memory.get(store), true);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, mode), objectStore = transaction.objectStore(store);
      const request = action(objectStore, false);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Travel storage operation failed."));
      transaction.oncomplete = () => db.close();
    });
  }
  const put = (store, value) => operation(store, "readwrite", (target, isMemory) => {
    const record = JSON.parse(JSON.stringify(value)); if (isMemory) { target.set(record.id, record); return record; } return target.put(record);
  });
  const get = (store, id) => operation(store, "readonly", (target, isMemory) => isMemory ? target.get(id) || null : target.get(id));
  const remove = (store, id) => operation(store, "readwrite", (target, isMemory) => { if (isMemory) return target.delete(id); return target.delete(id); });
  const all = (store) => operation(store, "readonly", (target, isMemory) => isMemory ? [...target.values()] : target.getAll());
  async function clear(store) {
    if (store) return operation(store, "readwrite", (target, isMemory) => { if (isMemory) return target.clear(); return target.clear(); });
    await Promise.all(STORES.map(clear));
  }
  root.ROOTS_TRAVEL_STORAGE = { put, get, remove, all, clear, constants: { DB_NAME, DB_VERSION, STORES } };
})(typeof window !== "undefined" ? window : globalThis);
