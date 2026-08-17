(function (root) {
  "use strict";
  const MAX = 3;
  let items = [];
  function add(summary) {
    if (!summary?.restaurantId || items.some((item) => item.restaurantId === summary.restaurantId)) return { accepted: false, reason: "duplicate", items: items.slice() };
    if (items.length >= MAX) return { accepted: false, reason: "limit", items: items.slice() };
    items.push(summary); return { accepted: true, items: items.slice() };
  }
  function remove(id) { items = items.filter((item) => item.restaurantId !== id); return items.slice(); }
  function clear() { items = []; return []; }
  function bestSupported() {
    return items.slice().sort((a, b) => (root.ROOTS_RESTAURANT_RANKING.constants.CATEGORY_ORDER[b.matchCategory] - root.ROOTS_RESTAURANT_RANKING.constants.CATEGORY_ORDER[a.matchCategory])
      || (root.ROOTS_RESTAURANT_RANKING.constants.EVIDENCE_ORDER[b.evidence.level] - root.ROOTS_RESTAURANT_RANKING.constants.EVIDENCE_ORDER[a.evidence.level]))[0] || null;
  }
  root.ROOTS_RESTAURANT_COMPARISON = { add, remove, clear, getItems: () => items.slice(), bestSupported, constants: { MAX } };
})(typeof window !== "undefined" ? window : globalThis);
