(function (root) {
  "use strict";

  const STORAGE_KEY = "roots-personalization-v1";
  const SCHEMA_VERSION = 1;
  const LIMITS = Object.freeze({ products: 200, restaurants: 100, dishes: 250, cuisines: 50, stores: 30, ingredients: 100 });
  const clean = (value, limit = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const initial = () => ({
    schemaVersion: SCHEMA_VERSION,
    favorites: { products: [], restaurants: [], dishes: [], cuisines: [], stores: [], ingredients: [] },
    preferences: { groceryStore: "", spiceLevel: "", mealSize: "" },
    updatedAt: now(),
  });

  function validRecord(item) {
    if (!item || typeof item !== "object") return null;
    const id = clean(item.id, 180);
    if (!id) return null;
    return {
      id,
      name: clean(item.name, 200),
      detail: clean(item.detail, 300),
      image: safeImageUrl(item.image),
      metadata: item.metadata && typeof item.metadata === "object" ? clone(item.metadata) : {},
      favoritedAt: Number.isFinite(Date.parse(item.favoritedAt)) ? new Date(item.favoritedAt).toISOString() : now(),
    };
  }

  function sanitize(value) {
    const output = initial();
    if (!value || value.schemaVersion !== SCHEMA_VERSION) return output;
    Object.keys(LIMITS).forEach((type) => {
      const source = Array.isArray(value.favorites?.[type]) ? value.favorites[type] : [];
      output.favorites[type] = source.map(validRecord).filter(Boolean).slice(0, LIMITS[type]);
    });
    output.preferences.groceryStore = clean(value.preferences?.groceryStore, 80);
    output.preferences.spiceLevel = ["mild", "medium", "hot"].includes(value.preferences?.spiceLevel) ? value.preferences.spiceLevel : "";
    output.preferences.mealSize = ["small", "regular", "large"].includes(value.preferences?.mealSize) ? value.preferences.mealSize : "";
    output.updatedAt = Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : now();
    return output;
  }

  function read() {
    try { return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch (_) { return initial(); }
  }
  function write(state) {
    const next = sanitize({ ...state, schemaVersion: SCHEMA_VERSION, updatedAt: now() });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      root.dispatchEvent?.(new CustomEvent("roots:personalizationchange", { detail: { state: clone(next) } }));
      return clone(next);
    } catch (_) { return null; }
  }
  function safeImageUrl(value) {
    const url = clean(value, 1200);
    return /^(?:https:\/\/|blob:|(?:\.?\/)?(?:icons|images|assets)\/)/i.test(url) ? url : "";
  }
  function list(type) {
    if (!Object.prototype.hasOwnProperty.call(LIMITS, type)) return [];
    return clone(read().favorites[type]);
  }
  function isFavorite(type, id) {
    const target = clean(id, 180);
    return !!target && list(type).some((item) => item.id === target);
  }
  function favorite(type, input) {
    if (!Object.prototype.hasOwnProperty.call(LIMITS, type)) throw new TypeError("Unknown favorite type.");
    const record = validRecord({ ...input, favoritedAt: input?.favoritedAt || now() });
    if (!record) throw new TypeError("A favorite needs a stable local identifier.");
    const state = read();
    state.favorites[type] = [record, ...state.favorites[type].filter((item) => item.id !== record.id)].slice(0, LIMITS[type]);
    return write(state) ? clone(record) : null;
  }
  function unfavorite(type, id) {
    if (!Object.prototype.hasOwnProperty.call(LIMITS, type)) return false;
    const state = read(), before = state.favorites[type].length;
    state.favorites[type] = state.favorites[type].filter((item) => item.id !== clean(id, 180));
    return before !== state.favorites[type].length && !!write(state);
  }
  function toggle(type, input) {
    return isFavorite(type, input?.id) ? (unfavorite(type, input.id), false) : (favorite(type, input), true);
  }
  function setPreference(name, value) {
    if (!["groceryStore", "spiceLevel", "mealSize"].includes(name)) throw new TypeError("Unknown preference.");
    const state = read();
    const cleaned = clean(value, 80);
    if (name === "spiceLevel" && cleaned && !["mild", "medium", "hot"].includes(cleaned)) throw new TypeError("Invalid spice preference.");
    if (name === "mealSize" && cleaned && !["small", "regular", "large"].includes(cleaned)) throw new TypeError("Invalid meal-size preference.");
    state.preferences[name] = cleaned;
    return write(state)?.preferences[name] ?? null;
  }
  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); root.dispatchEvent?.(new CustomEvent("roots:personalizationchange")); return true; }
    catch (_) { return false; }
  }

  root.ROOTS_PERSONALIZATION = {
    storageKey: STORAGE_KEY, schemaVersion: SCHEMA_VERSION, limits: LIMITS,
    getState: () => clone(read()), list, isFavorite, favorite, unfavorite, toggle, setPreference, clear, safeImageUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
