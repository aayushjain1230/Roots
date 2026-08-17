(function (root) {
  "use strict";
  const SCHEMA_VERSION = 1, LIMIT = 1000, INDEX_KEY = "roots-order-history-index-v1", PREFIX = "roots-order-history-v1:";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value, limit = 1000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const id = () => `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const validId = (value) => /^[a-z0-9][a-z0-9._:-]{2,179}$/i.test(String(value || ""));
  const readIndex = () => { try { const value = JSON.parse(localStorage.getItem(INDEX_KEY)); return Array.isArray(value) ? value.slice(0, LIMIT) : []; } catch (_) { return []; } };
  const writeIndex = (ids) => localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)].slice(0, LIMIT)));
  function get(recordId) { try { const value = JSON.parse(localStorage.getItem(PREFIX + recordId)); return value?.schemaVersion === 1 ? clone(value) : null; } catch (_) { return null; } }
  function list(filters) { return readIndex().map(get).filter(Boolean).filter((item) => !filters?.restaurantId || item.restaurantId === filters.restaurantId); }
  function markOrdered(source, metadata) {
    const saved = typeof source === "string" ? root.ROOTS_SAVED_MEALS?.get(source) : null;
    const meal = saved || source;
    if (!meal?.meal || !meal?.evaluation) throw new TypeError("A reviewed meal is required.");
    const timestamp = Number.isFinite(Date.parse(metadata?.orderedAt)) ? new Date(metadata.orderedAt).toISOString() : new Date().toISOString();
    const record = {
      schemaVersion: SCHEMA_VERSION, id: id(), savedMealId: saved?.id || null,
      restaurantId: clean(meal.restaurant?.restaurantId || meal.restaurant?.id, 180),
      restaurantName: clean(meal.restaurant?.name, 200), mealName: clean(saved?.name || metadata?.mealName || meal.meal?.mainDishName, 120),
      orderedAt: timestamp, status: "ordered", mealSnapshot: clone(meal.meal),
      profileSnapshot: clone(meal.profile || meal.profileSnapshot || {}), evaluationSnapshot: clone(meal.evaluation || meal.analysis),
      userOutcome: {
        restaurantConfirmed: ["yes", "no", "not_asked"].includes(metadata?.restaurantConfirmed) ? metadata.restaurantConfirmed : "not_asked",
        mealReceivedAsRequested: ["yes", "no", "unsure"].includes(metadata?.mealReceivedAsRequested) ? metadata.mealReceivedAsRequested : "unsure",
      },
      notes: clean(metadata?.notes, 2000), createdAt: new Date().toISOString(),
    };
    localStorage.setItem(PREFIX + record.id, JSON.stringify(record));
    writeIndex([record.id, ...readIndex()]);
    if (saved) root.ROOTS_SAVED_MEALS.update(saved.id, { status: "saved", timesUsed: (saved.timesUsed || 0) + 1, lastUsedAt: timestamp });
    return clone(record);
  }
  function updateNotes(recordId, notes) { const record = get(recordId); if (!record) throw new Error("Order record not found."); record.notes = clean(notes, 2000); localStorage.setItem(PREFIX + record.id, JSON.stringify(record)); return clone(record); }
  function remove(recordId) { localStorage.removeItem(PREFIX + recordId); writeIndex(readIndex().filter((item) => item !== recordId)); return true; }
  function clear(options) { if (options?.confirmed !== true) return false; list(options).forEach((item) => localStorage.removeItem(PREFIX + item.id)); writeIndex(readIndex().filter((idValue) => !list(options).some((item) => item.id === idValue))); return true; }
  root.ROOTS_ORDER_HISTORY = { schemaVersion: SCHEMA_VERSION, limit: LIMIT, keys: { INDEX_KEY, PREFIX }, markOrdered, get, list, updateNotes, remove, clear };
})(typeof window !== "undefined" ? window : globalThis);
