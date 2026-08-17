(function (root) {
  "use strict";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const list = (value) => Array.isArray(value) ? value : [];
  function newestMenu(record) {
    const menus = root.ROOTS_MENU_STORAGE?.getByRestaurant?.(record.restaurant.restaurantId) || [];
    return menus[0] || root.ROOTS_MENU_STORAGE?.get?.(record.menu.menuId) || null;
  }
  function compareProfile(record, profile) {
    const current = profile || root.ROOTS_PROFILE?.getActiveProfile?.();
    const fingerprint = root.ROOTS_SAVED_MEALS?.profileFingerprint?.(current);
    return { changed: !!current && fingerprint !== record.profile.profileFingerprint, current, original: clone(record.profile.snapshot) };
  }
  function currentOptionMap(dish, evidence) {
    return new Map((root.ROOTS_MEAL_ENGINE?.supportedOptions?.(dish, evidence) || []).map((item) => [item.id, item]));
  }
  function detectChanges(record, context) {
    const menu = context?.menu || newestMenu(record), profileCheck = compareProfile(record, context?.profile);
    const changes = [], informational = [];
    if (profileCheck.changed) changes.push({ type: "PROFILE_CHANGED", section: "Profile", message: "Your dietary profile has changed since this meal was saved." });
    if (!menu) return { state: "NEEDS_REVIEW", recheckStatus: "required", changes: [...changes, { type: "MENU_CHANGED", section: "Menu", message: "Current menu information is unavailable." }], informational, menu: null, dish: null, missingModifiers: [] };
    const found = root.ROOTS_MEAL_ENGINE.findDish(menu, record.meal.mainDishId);
    if (!found) {
      const report = root.ROOTS_RESTAURANT_REPORT?.generate?.(menu, profileCheck.current, { bypassCache: false });
      return { state: "UNAVAILABLE", recheckStatus: "unavailable", changes: [...changes, { type: "UNAVAILABLE", section: "Menu", message: "This dish is no longer on the available menu." }], informational, menu, report, dish: null, missingModifiers: list(record.meal.selectedModifiers), profileCheck };
    }
    if (menu.id !== record.menu.menuId || Date.parse(menu.lastNormalizedAt || 0) !== Date.parse(record.menu.menuUpdatedAt || 0)) changes.push({ type: "MENU_CHANGED", section: "Menu", message: "The restaurant menu has changed." });
    const originalName = clean(record.meal.mainDishName).toLowerCase(), currentName = clean(found.dish.nameOriginal).toLowerCase();
    const originalDescription = clean(record.meal.mainDescription).toLowerCase();
    if (originalName !== currentName || (originalDescription && originalDescription !== clean(found.dish.descriptionOriginal).toLowerCase())) changes.push({ type: "DISH_CHANGED", section: "Menu", message: "The dish name or description changed." });
    const report = root.ROOTS_RESTAURANT_REPORT?.generate?.(menu, profileCheck.current, { bypassCache: false });
    const evidence = report?.dishes?.find((item) => item.dishId === found.dish.id);
    const options = currentOptionMap(found.dish, evidence), missingModifiers = list(record.meal.selectedModifiers).filter((item) => !options.has(item.id));
    if (missingModifiers.length) changes.push({ type: "MODIFIER_UNAVAILABLE", section: "Menu", message: "One or more saved options are no longer listed." });
    const evidenceVersion = root.ROOTS_RESTAURANT_EVIDENCE?.constants?.VERSION || 1, mealVersion = root.ROOTS_MEAL_ENGINE?.constants?.VERSION || 1;
    if (evidenceVersion !== record.evaluation.evidenceEngineVersion || mealVersion !== record.evaluation.mealEngineVersion) changes.push({ type: "EVIDENCE_UPDATED", section: "ROOTS Evidence", message: "ROOTS has updated its dietary evidence." });
    const price = found.dish.price?.display;
    if (record.meal.price && price && record.meal.price !== price) informational.push({ type: "PRICE_CHANGED", message: `Current listed price: ${price}.` });
    const state = changes.length ? (changes.some((item) => item.type === "UNAVAILABLE") ? "UNAVAILABLE" : changes[0].type) : "UNCHANGED";
    const supportedAlternatives = [...options.values()].filter((item) => !record.meal.selectedOptionIds.includes(item.id) && item.type === "resolution");
    return { state, recheckStatus: changes.length ? "required" : menu && root.ROOTS_MENU_STORAGE?.getFreshness?.(menu)?.state === "stale" ? "recommended" : "current", changes, informational, menu, dish: found.dish, report, evidence, missingModifiers, supportedAlternatives, profileCheck };
  }
  function similarDishes(record, menu, report) {
    if (!menu || !report) return [];
    const original = clean(record.meal.mainDishName).toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    return report.dishes.filter((item) => item.dishId !== record.meal.mainDishId && ["SAFE", "SAFE_WITH_MODIFICATION", "NEEDS_CONFIRMATION"].includes(item.verdict))
      .map((item) => ({ ...item, score: original.filter((term) => clean(item.dishName).toLowerCase().includes(term)).length }))
      .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function reevaluate(record, context) {
    const original = clone(record), inspection = detectChanges(record, context);
    if (!inspection.dish || !inspection.report) return { original, current: null, inspection, similarDishes: similarDishes(record, inspection.menu, inspection.report), requiresReview: true };
    const meal = root.ROOTS_MEAL_ENGINE.newMeal(inspection.menu, inspection.report, inspection.dish.id, record.restaurant);
    const available = new Set(meal.main.options.map((item) => item.id));
    const selected = record.meal.selectedOptionIds.filter((optionId) => available.has(optionId));
    let currentMeal = root.ROOTS_MEAL_ENGINE.update(meal, { selectedOptionIds: selected, portion: clone(record.meal.portion) });
    record.meal.selectedComponents.forEach((component) => {
      try { currentMeal = root.ROOTS_MEAL_ENGINE.addComponent(currentMeal, inspection.menu, inspection.report, component.dishId, component.role); } catch (_) { inspection.changes.push({ type: "DISH_CHANGED", section: "Meal", message: `${component.name} is no longer listed.` }); }
    });
    if (inspection.missingModifiers.length) currentMeal.analysis = { ...currentMeal.analysis, verdict: "NEEDS_CONFIRMATION", label: "Needs Confirmation", unknowns: [...currentMeal.analysis.unknowns, ...inspection.missingModifiers.map((item) => item.label)] };
    return { original, current: currentMeal, inspection, similarDishes: [], evaluatedAt: new Date().toISOString(), requiresReview: true };
  }
  function inspect(savedMealId, context) {
    const record = root.ROOTS_SAVED_MEALS?.get(savedMealId); if (!record) throw new Error("Saved meal not found.");
    const result = reevaluate(record, context);
    root.ROOTS_SAVED_MEALS.update(savedMealId, { recheckStatus: result.inspection.recheckStatus, changeFlags: result.inspection.changes.map((item) => item.type), lastCheckedAt: result.evaluatedAt || new Date().toISOString() });
    return result;
  }
  function confirmationAge(confirmation, at) {
    const days = Math.floor(((at || Date.now()) - Date.parse(confirmation.confirmedAt)) / 86400000);
    return { days, status: days <= 30 ? "current" : days <= 90 ? "aging" : "old", label: days <= 30 ? "Previously confirmed by you" : days <= 90 ? "Previously confirmed, but may have changed" : "Old confirmation. Verify again." };
  }
  root.ROOTS_ORDER_RECHECK = { inspect, compareProfile, detectChanges, reevaluate, similarDishes, confirmationAge, newestMenu };
})(typeof window !== "undefined" ? window : globalThis);
