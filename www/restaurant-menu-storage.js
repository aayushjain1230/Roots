(function (root) {
  "use strict";
  const KEY = "roots-restaurant-menus-v1", LIMIT = 20;
  const Parser = root.ROOTS_MENU_PARSER;
  const read = () => {
    try { const data = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(data) ? data : []; }
    catch (_) { return []; }
  };
  const write = (value) => {
    try { localStorage.setItem(KEY, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  };
  function migrate(menu) {
    if (menu?.schemaVersion === 1) return Parser.normalizeMenu(menu);
    if (menu && Array.isArray(menu.items)) {
      return Parser.normalizeMenu({ ...menu, sections: [{ nameOriginal: menu.title || "Menu", items: menu.items }] });
    }
    return null;
  }
  function getFreshness(menu, now) {
    const source = menu?.source || {};
    const timestamp = Date.parse(source.sourceUpdatedAt || source.retrievedAt || menu?.lastNormalizedAt || 0);
    const maxAge = source.official ? 7 * 86400000 : 30 * 86400000;
    const ageMs = Math.max(0, (now || Date.now()) - timestamp);
    return { state: !timestamp || ageMs > maxAge ? "stale" : "current", ageMs, maxAge, label: !timestamp || ageMs > maxAge ? "Menu may be outdated" : "Source recently checked" };
  }
  function enforce(items) {
    if (items.length <= LIMIT) return items;
    const protectedItems = items.filter((menu) => menu.savedByUser || menu.reviewedByUser);
    const expendable = items.filter((menu) => !menu.savedByUser && !menu.reviewedByUser)
      .sort((a, b) => Date.parse(b.lastAccessedAt || 0) - Date.parse(a.lastAccessedAt || 0));
    return [...protectedItems, ...expendable].slice(0, Math.max(LIMIT, protectedItems.length));
  }
  function save(input) {
    const menu = migrate({ ...input, lastAccessedAt: new Date().toISOString() });
    if (!menu?.id || !menu.restaurantId) throw new TypeError("Menu identity is required.");
    const next = enforce([menu, ...read().filter((item) => item?.id !== menu.id)]);
    if (!write(next)) {
      const error = new Error("This menu could not be saved because device storage is full.");
      error.code = "storage_full"; throw error;
    }
    return menu;
  }
  function get(menuId) {
    const stored = read(), found = stored.find((menu) => menu?.id === menuId);
    if (!found) return null;
    const menu = migrate(found);
    menu.lastAccessedAt = new Date().toISOString();
    write([menu, ...stored.filter((item) => item?.id !== menuId)]);
    return menu;
  }
  function getByRestaurant(restaurantId) {
    return read().filter((menu) => menu?.restaurantId === restaurantId).map(migrate).filter(Boolean)
      .sort((a, b) => Date.parse(b.lastNormalizedAt) - Date.parse(a.lastNormalizedAt));
  }
  function remove(menuId) { return write(read().filter((menu) => menu?.id !== menuId)); }
  function clearExpired(now) {
    const items = read().filter((menu) => menu.savedByUser || menu.reviewedByUser || getFreshness(menu, now).state !== "stale");
    write(items); return items.length;
  }
  root.ROOTS_MENU_STORAGE = { key: KEY, limit: LIMIT, save, get, getByRestaurant, remove, getFreshness, clearExpired, migrate };
})(typeof window !== "undefined" ? window : globalThis);
