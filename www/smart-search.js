(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const fold = (value) => clean(value).toLowerCase();
  const escType = new Set(["product", "restaurant", "meal", "history", "ingredient"]);
  let cache = null, cacheSignature = "";
  function item(type, id, title, detail, source, action) {
    return { type: escType.has(type) ? type : "history", id: clean(id), title: clean(title) || "Untitled", detail: clean(detail), source, action: clean(action) };
  }
  function build(input) {
    const output = [];
    (input?.savedProducts || []).forEach((record) => output.push(item("product", record.id, record.product?.name, record.product?.brand || "Saved product", record, "open-product")));
    (input?.history || []).forEach((record) => output.push(item("history", record.id || record.scannedAt || record.savedAt, record.product?.name || record.name || "Scan", record.product?.brand || record.brand || "Scan history", record, "open-history")));
    (input?.favoriteRestaurants || []).forEach((record) => output.push(item("restaurant", record.id, record.name, record.detail || "Favorite restaurant", record, "open-restaurants")));
    (input?.meals || []).forEach((record) => output.push(item("meal", record.id, record.name, record.restaurant?.name || "Saved meal", record, "open-meal")));
    const knowledge = root.ROOTS_INGREDIENT_KNOWLEDGE;
    const entries = knowledge?.getAll ? knowledge.getAll() : knowledge?.entries || knowledge?.INGREDIENTS || [];
    (Array.isArray(entries) ? entries : Object.values(entries || {})).forEach((record) => {
      const title = record.displayName || record.name || record.canonicalName || record.id;
      output.push(item("ingredient", record.id || title, title, (record.aliases || []).slice(0, 4).join(", "), record, "open-ingredient"));
    });
    return output;
  }
  function signature(input) {
    const ids = (values) => (values || []).map((item) => item.id || item.scannedAt || item.savedAt || "").join("|");
    return [ids(input?.savedProducts), ids(input?.history), ids(input?.favoriteRestaurants), ids(input?.meals)].join("::");
  }
  function index(input) {
    const nextSignature = signature(input);
    if (cache && cacheSignature === nextSignature) return cache;
    const task = root.ROOTS_PERFORMANCE?.startTask?.("smart_search_index", { count: 0 });
    cache = build(input).map((record) => ({ ...record, searchText: fold(`${record.title} ${record.detail} ${record.type}`) }));
    cacheSignature = nextSignature;
    root.ROOTS_PERFORMANCE?.endTask?.(task, { count: cache.length });
    return cache;
  }
  function invalidate() { cache = null; cacheSignature = ""; }
  function search(query, input, limit = 30) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const task = root.ROOTS_PERFORMANCE?.startTask?.("smart_search", { count: terms.length });
    const results = index(input).map((record) => {
      const matched = terms.filter((term) => record.searchText.includes(term));
      return { ...record, score: matched.length * 10 + (fold(record.title).startsWith(terms[0]) ? 4 : 0) };
    }).filter((record) => record.score >= terms.length * 10)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, Math.max(1, Math.min(50, limit)));
    root.ROOTS_PERFORMANCE?.endTask?.(task, { count: results.length });
    return results;
  }
  root.addEventListener?.("roots:savedproductschange", invalidate);
  root.addEventListener?.("roots:historychange", invalidate);
  root.addEventListener?.("roots:personalizationchange", invalidate);
  root.ROOTS_SMART_SEARCH = { build, index, invalidate, search };
})(typeof window !== "undefined" ? window : globalThis);
