(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").normalize("NFKD").replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  function search(records, query) {
    const terms = clean(query).split(" ").filter(Boolean);
    if (!terms.length) return records.slice();
    return records.filter((record) => {
      const text = clean([record.name, record.restaurant?.name, record.meal?.mainDishName, record.personalNotes, ...(record.tags || []), ...(record.meal?.selectedModifiers || []).map((item) => item.label)].join(" "));
      return terms.every((term) => text.includes(term));
    });
  }
  function filter(records, filters) {
    return records.filter((record) => {
      if (filters?.restaurantId && record.restaurant?.restaurantId !== filters.restaurantId) return false;
      if (filters?.verdict && record.evaluation?.verdict !== filters.verdict) return false;
      if (filters?.needsRecheck && record.recheckStatus === "current") return false;
      if (filters?.archived === true && record.status !== "archived") return false;
      if (filters?.archived !== true && record.status === "archived") return false;
      if (filters?.ordered && !(record.timesUsed > 0)) return false;
      return true;
    });
  }
  function sort(records, sortId) {
    return records.map((record, index) => ({ record, index })).sort((a, b) => {
      let value = 0;
      if (sortId === "recently_used") value = Date.parse(b.record.lastUsedAt || 0) - Date.parse(a.record.lastUsedAt || 0);
      else if (sortId === "restaurant") value = String(a.record.restaurant?.name || "").localeCompare(String(b.record.restaurant?.name || ""));
      else if (sortId === "meal_name") value = String(a.record.name || "").localeCompare(String(b.record.name || ""));
      else if (sortId === "needs_recheck") value = ({ unavailable: 0, required: 1, recommended: 2, current: 3 }[a.record.recheckStatus] ?? 4) - ({ unavailable: 0, required: 1, recommended: 2, current: 3 }[b.record.recheckStatus] ?? 4);
      else if (sortId === "most_used") value = (b.record.timesUsed || 0) - (a.record.timesUsed || 0);
      else value = Date.parse(b.record.createdAt || 0) - Date.parse(a.record.createdAt || 0);
      return value || a.index - b.index;
    }).map((item) => item.record);
  }
  function query(records, options) { return sort(filter(search(records, options?.query || ""), options?.filters || {}), options?.sort || "recently_saved"); }
  root.ROOTS_MEMORY_SEARCH = { normalize: clean, search, filter, sort, query };
})(typeof window !== "undefined" ? window : globalThis);
