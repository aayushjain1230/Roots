(function (root) {
  "use strict";
  const Engine = root.ROOTS_RESTAURANT_EVIDENCE;
  if (!Engine) throw new Error("Restaurant evidence engine must load before restaurant-compatibility-report.js");
  const CACHE_KEY = "roots-restaurant-evidence-cache-v1", CACHE_LIMIT = 25;
  const read = () => { try { const value = JSON.parse(localStorage.getItem(CACHE_KEY)); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const write = (value) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value.slice(0, CACHE_LIMIT))); } catch (_) { /* report remains available */ } };
  const signature = (menu, profile) => [
    menu.id, menu.lastNormalizedAt, menu.reviewedByUser, profile.id, profile.updatedAt,
    JSON.stringify(menu.sections.map((section) => section.items.map((dish) => [dish.id, dish.nameOriginal, dish.descriptionOriginal, dish.modifiers, dish.options]))),
  ].join("|");
  function generate(menu, profile, options) {
    if (!menu?.sections) throw new TypeError("A normalized Phase 4C menu is required.");
    const key = signature(menu, profile), cached = read().find((item) => item.key === key);
    if (cached && options?.bypassCache !== true) return { ...cached.report, fromCache: true };
    const dishes = menu.sections.flatMap((section) => section.items.map((dish) => Engine.evaluateDish(menu, dish, profile, {
      cuisine: options?.cuisine, evaluatedAt: options?.evaluatedAt, ...(options?.evidenceByDish?.[dish.id] || {}),
    })));
    const groups = { bestChoices: [], canModify: [], needsConfirmation: [], avoid: [] };
    dishes.forEach((dish) => {
      if (dish.verdict === "SAFE") groups.bestChoices.push(dish);
      else if (dish.verdict === "SAFE_WITH_MODIFICATION") groups.canModify.push(dish);
      else if (dish.verdict === "AVOID") groups.avoid.push(dish);
      else groups.needsConfirmation.push(dish);
    });
    const report = {
      schemaVersion: 1, engineVersion: Engine.constants.VERSION,
      restaurant: { id: menu.restaurantId, name: menu.restaurantName },
      menu: { id: menu.id, title: menu.title, menuType: menu.menuType, source: menu.source },
      profileSnapshot: { id: profile.id, name: profile.name, updatedAt: profile.updatedAt, schemaVersion: profile.schemaVersion },
      groups, dishes, generatedAt: options?.evaluatedAt || new Date().toISOString(), fromCache: false,
    };
    root.ROOTS_METRICS?.track?.("menu_analyzed", { outcome: dishes.length ? "evaluated" : "empty" });
    write([{ key, report, lastAccessedAt: new Date().toISOString() }, ...read().filter((item) => item.key !== key)]);
    return report;
  }
  function clear(menuId) { const next = read().filter((item) => item.report?.menu?.id !== menuId); write(next); return next.length; }
  root.ROOTS_RESTAURANT_REPORT = { generate, clear, signature, constants: { CACHE_KEY, CACHE_LIMIT } };
})(typeof window !== "undefined" ? window : globalThis);
