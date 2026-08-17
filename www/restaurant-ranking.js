(function (root) {
  "use strict";
  const VERSION = 1;
  const CATEGORIES = Object.freeze({
    EXCELLENT_MATCH: "EXCELLENT_MATCH", GOOD_MATCH: "GOOD_MATCH", LIMITED_OPTIONS: "LIMITED_OPTIONS",
    NEEDS_MORE_INFORMATION: "NEEDS_MORE_INFORMATION", POOR_MATCH: "POOR_MATCH",
  });
  const CATEGORY_ORDER = Object.freeze({ EXCELLENT_MATCH: 5, GOOD_MATCH: 4, LIMITED_OPTIONS: 3, NEEDS_MORE_INFORMATION: 2, POOR_MATCH: 1 });
  const EVIDENCE_ORDER = Object.freeze({ STRONG: 3, MODERATE: 2, LIMITED: 1 });
  const WEIGHTS = Object.freeze({
    bestChoice: 16, modifiable: 8, compatibleSection: 6, compatibleFamily: 5,
    evidenceStrong: 18, evidenceModerate: 8, mealHigh: 14, mealMedium: 6,
    currentMenu: 7, customization: 4, avoid: -2, needsConfirmation: -5,
    crossContact: -7, stale: -12, closed: -3, distanceTieBreak: -0.05,
  });
  const INTENTS = Object.freeze({
    pizza: ["pizza", "flatbread", "margherita"],
    breakfast: ["breakfast", "pancake", "waffle", "omelet", "idli", "dosa"],
    dessert: ["dessert", "cake", "ice cream", "gelato", "cookie", "pastry", "sweet"],
    coffee: ["coffee", "espresso", "latte", "cappuccino", "bakery"],
    ramen: ["ramen"],
    salad: ["salad"],
    paneer: ["paneer"],
    burger: ["burger"],
    burgers: ["burger"],
    indian: ["indian", "dosa", "idli", "biryani", "paneer", "curry"],
    vegan: ["vegan"],
    vegetarian: ["vegetarian"],
  });
  const MEAL_SECTIONS = /\b(entree|main|bowl|plate|pizza|burger|sandwich|breakfast|lunch|dinner|combo|build your own)\b/i;
  const LOW_VALUE_SECTIONS = /\b(sauces?|toppings?|condiments?|add[- ]?ons?|sides?)\b/i;
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const bounded = (value, min, max) => Math.min(max, Math.max(min, value));
  function dishFamily(dish) {
    return clean(dish?.dishName || dish?.nameOriginal).toLowerCase()
      .replace(/\b(small|medium|large|single|double|triple|kids?|half|full|\d+\s*(?:oz|inch|in))\b/g, "")
      .replace(/\b(with|without|no|add)\b.*$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function practicalDish(dish, menu) {
    const section = menu?.sections?.find((item) => item.id === dish.sectionId);
    const name = clean(section?.nameOriginal);
    if (LOW_VALUE_SECTIONS.test(name) && !MEAL_SECTIONS.test(name)) return false;
    return true;
  }
  function freshness(menu, now) {
    if (!menu) return { status: "unknown", lastCheckedAt: null, ageDays: null };
    const timestamp = Date.parse(menu.source?.sourceUpdatedAt || menu.source?.retrievedAt || menu.lastNormalizedAt || "");
    if (!Number.isFinite(timestamp)) return { status: "unknown", lastCheckedAt: null, ageDays: null };
    const ageDays = Math.max(0, ((now || Date.now()) - timestamp) / 86400000);
    return { status: ageDays <= 30 ? "current" : ageDays <= 90 ? "possibly_stale" : "stale", lastCheckedAt: new Date(timestamp).toISOString(), ageDays: Math.floor(ageDays) };
  }
  function evidenceStrength(menu, report) {
    if (!menu || !report?.dishes?.length) return { level: "LIMITED", officialMenu: false, officialAllergenGuide: false, userReviewedMenu: false, incompleteMenu: true };
    const officialMenu = menu.source?.official === true;
    const officialAllergenGuide = report.dishes.some((dish) => dish.evidence.some((item) => item.source === "restaurant_allergen_guide" && item.level === "confirmed"));
    const structuredIngredients = report.dishes.some((dish) => dish.evidence.some((item) => item.source === "restaurant_ingredient_list"));
    const userReviewedMenu = menu.reviewedByUser === true;
    const unresolved = report.dishes.filter((dish) => dish.verdict === "NEEDS_CONFIRMATION").length / report.dishes.length;
    const ocrOnly = ["user_image", "user_camera", "user_screenshot"].includes(menu.source?.type);
    const incompleteMenu = menu.warnings?.some((item) => ["no_dishes_found", "incomplete_menu", "partial_menu"].includes(item.code)) || unresolved > 0.65;
    let level = "LIMITED";
    if (officialMenu && (officialAllergenGuide || structuredIngredients) && unresolved <= 0.35) level = "STRONG";
    else if ((officialMenu || userReviewedMenu) && unresolved <= 0.65 && !ocrOnly) level = "MODERATE";
    return { level, officialMenu, officialAllergenGuide, structuredIngredients, userReviewedMenu, incompleteMenu: !!incompleteMenu, ocrOnly };
  }
  function mealIntent(report, menu, query) {
    const raw = clean(query).toLowerCase();
    if (!raw || raw === "anything") return { query: raw || "anything", relevance: "high", matchedDishIds: report?.dishes?.map((dish) => dish.dishId) || [] };
    const terms = INTENTS[raw] || [raw.replace(/s$/, "")];
    const matched = (report?.dishes || []).filter((dish) => {
      const section = menu?.sections?.find((item) => item.id === dish.sectionId);
      const text = `${dish.dishName} ${section?.nameOriginal || ""}`.toLowerCase();
      return terms.some((term) => new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(text));
    }).map((dish) => dish.dishId);
    const practicalCompatible = (report?.dishes || []).filter((dish) => ["SAFE", "SAFE_WITH_MODIFICATION"].includes(dish.verdict) && practicalDish(dish, menu));
    const compatibleMatches = practicalCompatible.filter((dish) => matched.includes(dish.dishId)).length;
    return { query: raw, relevance: compatibleMatches >= 2 ? "high" : compatibleMatches === 1 || matched.length ? "medium" : "low", matchedDishIds: matched };
  }
  function summarize(restaurant, menu, report, context) {
    const dishes = report?.dishes || [];
    const practical = dishes.filter((dish) => practicalDish(dish, menu));
    const best = practical.filter((dish) => dish.verdict === "SAFE");
    const modifiable = practical.filter((dish) => dish.verdict === "SAFE_WITH_MODIFICATION");
    const needs = dishes.filter((dish) => dish.verdict === "NEEDS_CONFIRMATION");
    const avoid = dishes.filter((dish) => dish.verdict === "AVOID");
    const compatible = [...best, ...modifiable];
    const sections = new Set(compatible.map((dish) => dish.sectionId));
    const families = new Set(compatible.map(dishFamily).filter(Boolean));
    const evidence = evidenceStrength(menu, report);
    const menuFreshness = freshness(menu, context?.now);
    const intent = mealIntent(report, menu, context?.meal);
    const crossIssues = dishes.flatMap((dish) => dish.evidence.filter((item) => item.source === "cross_contact"));
    const strictCross = crossIssues.filter((item) => item.effect === "avoid").length;
    const crossBurden = strictCross >= 2 ? "high" : crossIssues.length ? "moderate" : "low";
    const customizationQuality = modifiable.length >= 3 ? "strong" : modifiable.length ? "available" : "none";
    const completeness = dishes.length ? (dishes.length - needs.length) / dishes.length : 0;
    let category;
    if (!menu || !report || !dishes.length || evidence.incompleteMenu || (evidence.level === "LIMITED" && needs.length >= dishes.length / 2)) category = CATEGORIES.NEEDS_MORE_INFORMATION;
    else if (evidence.level === "STRONG" && best.length >= 4 && sections.size >= 2 && families.size >= 3 && needs.length <= dishes.length * 0.3 && intent.relevance !== "low") category = CATEGORIES.EXCELLENT_MATCH;
    else if (best.length >= 1 && evidence.level !== "LIMITED" && compatible.length >= 2) category = CATEGORIES.GOOD_MATCH;
    else if (compatible.length >= 1) category = CATEGORIES.LIMITED_OPTIONS;
    else if (evidence.level === "STRONG" && avoid.length > 0 && needs.length === 0) category = CATEGORIES.POOR_MATCH;
    else category = CATEGORIES.NEEDS_MORE_INFORMATION;
    if (menuFreshness.status === "stale" && category === CATEGORIES.EXCELLENT_MATCH) category = CATEGORIES.GOOD_MATCH;
    if (evidence.level === "LIMITED" && [CATEGORIES.EXCELLENT_MATCH, CATEGORIES.GOOD_MATCH].includes(category)) category = CATEGORIES.LIMITED_OPTIONS;
    const componentValues = {
      bestChoice: best.length * WEIGHTS.bestChoice, modifiable: modifiable.length * WEIGHTS.modifiable,
      compatibleSection: sections.size * WEIGHTS.compatibleSection, compatibleFamily: families.size * WEIGHTS.compatibleFamily,
      evidence: evidence.level === "STRONG" ? WEIGHTS.evidenceStrong : evidence.level === "MODERATE" ? WEIGHTS.evidenceModerate : 0,
      mealIntent: intent.relevance === "high" ? WEIGHTS.mealHigh : intent.relevance === "medium" ? WEIGHTS.mealMedium : 0,
      freshness: menuFreshness.status === "current" ? WEIGHTS.currentMenu : menuFreshness.status === "stale" ? WEIGHTS.stale : 0,
      customization: modifiable.length ? WEIGHTS.customization : 0, avoid: avoid.length * WEIGHTS.avoid,
      needsConfirmation: needs.length * WEIGHTS.needsConfirmation, crossContact: crossIssues.length * WEIGHTS.crossContact,
      availability: restaurant?.openStatus === "closed" ? WEIGHTS.closed : 0,
      distance: Number.isFinite(restaurant?.distanceMiles) ? restaurant.distanceMiles * WEIGHTS.distanceTieBreak : 0,
    };
    const topReasons = [];
    if (best.length) topReasons.push(`${best.length} Best Choice dish${best.length === 1 ? "" : "es"}`);
    if (modifiable.length) topReasons.push(`${modifiable.length} menu-supported modification${modifiable.length === 1 ? "" : "s"}`);
    if (evidence.officialAllergenGuide) topReasons.push("Official allergen evidence is available");
    if (sections.size > 1) topReasons.push(`Compatible choices across ${sections.size} menu sections`);
    const limitations = [];
    if (!menu) limitations.push("Menu information is needed before ROOTS can rank this restaurant.");
    if (evidence.level === "LIMITED") limitations.push("Available menu evidence is limited.");
    if (needs.length) limitations.push(`${needs.length} dish${needs.length === 1 ? "" : "es"} need confirmation.`);
    if (crossIssues.length) limitations.push("Cross-contact information limits some choices.");
    if (menuFreshness.status === "stale") limitations.push(`Menu was last checked ${menuFreshness.ageDays} days ago.`);
    if (intent.relevance === "low") limitations.push(`Few analyzed dishes match “${intent.query}”.`);
    return {
      schemaVersion: 1, rankingVersion: VERSION, restaurantId: restaurant?.id, restaurantName: restaurant?.name,
      activeProfileId: report?.profileSnapshot?.id || context?.profile?.id || null, evaluatedAt: context?.evaluatedAt || new Date().toISOString(),
      matchCategory: category,
      dishCounts: { bestChoice: best.length, canModify: modifiable.length, needsConfirmation: needs.length, avoid: avoid.length, totalEvaluated: dishes.length },
      variety: { compatibleSections: sections.size, compatibleDishFamilies: families.size },
      evidence, freshness: menuFreshness, mealIntent: intent,
      crossContact: { burden: crossBurden, unresolvedIssues: crossIssues.map((item) => item.text) },
      customizationQuality, informationCompleteness: completeness,
      topReasons: topReasons.slice(0, 4), limitations: limitations.slice(0, 6),
      bestChoiceDishIds: best.map((dish) => dish.dishId), modifiableDishIds: modifiable.map((dish) => dish.dishId), confirmationDishIds: needs.map((dish) => dish.dishId),
      topDishes: best.slice(0, 3).map((dish) => ({ id: dish.dishId, name: dish.dishName })),
      restaurantMetadata: { distanceMiles: restaurant?.distanceMiles ?? null, openStatus: restaurant?.openStatus || "unknown", rating: restaurant?.rating ?? null },
      internalRanking: { value: Object.values(componentValues).reduce((sum, value) => sum + value, 0), components: componentValues },
      report: report || null,
    };
  }
  function explainRanking(summary) {
    return { category: summary.matchCategory, positives: summary.topReasons.slice(), limitations: summary.limitations.slice() };
  }
  function sortSummaries(items, sortId) {
    const sort = sortId || "best_match", copy = items.map((item, index) => ({ item, index }));
    const value = (entry, field) => entry.item?.dishCounts?.[field] || 0;
    copy.sort((a, b) => {
      if (sort === "distance") return (a.item.restaurantMetadata.distanceMiles ?? Infinity) - (b.item.restaurantMetadata.distanceMiles ?? Infinity) || a.index - b.index;
      if (sort === "best_choices") return value(b, "bestChoice") - value(a, "bestChoice") || a.index - b.index;
      if (sort === "modifiable") return value(b, "canModify") - value(a, "canModify") || a.index - b.index;
      if (sort === "evidence") return EVIDENCE_ORDER[b.item.evidence.level] - EVIDENCE_ORDER[a.item.evidence.level] || a.index - b.index;
      return CATEGORY_ORDER[b.item.matchCategory] - CATEGORY_ORDER[a.item.matchCategory]
        || b.item.internalRanking.value - a.item.internalRanking.value
        || (a.item.restaurantMetadata.distanceMiles ?? Infinity) - (b.item.restaurantMetadata.distanceMiles ?? Infinity) || a.index - b.index;
    });
    return copy.map((entry) => entry.item);
  }
  function applyFilters(items, filters) {
    const active = new Set(filters || []);
    return items.filter((item) => {
      if (active.has("excellent") && item.matchCategory !== CATEGORIES.EXCELLENT_MATCH) return false;
      if (active.has("good") && item.matchCategory !== CATEGORIES.GOOD_MATCH) return false;
      if (active.has("best_choices") && !item.dishCounts.bestChoice) return false;
      if (active.has("modifiable") && !item.dishCounts.canModify) return false;
      if (active.has("strong_evidence") && item.evidence.level !== "STRONG") return false;
      if (active.has("open_now") && item.restaurantMetadata.openStatus !== "open") return false;
      if (active.has("menu_recent") && item.freshness.status !== "current") return false;
      if (active.has("needs_confirmation") && !item.dishCounts.needsConfirmation) return false;
      return true;
    });
  }
  root.ROOTS_RESTAURANT_RANKING = {
    evaluateRestaurant: summarize, summarize, rankRestaurants: (items, context) => sortSummaries(items, context?.sort),
    getMatchCategory: (summary) => summary.matchCategory, explainRanking, sortSummaries, applyFilters,
    dishFamily, practicalDish, evidenceStrength, mealIntent, freshness, getRankingVersion: () => VERSION,
    constants: { VERSION, CATEGORIES, CATEGORY_ORDER, EVIDENCE_ORDER, WEIGHTS, INTENTS },
  };
})(typeof window !== "undefined" ? window : globalThis);
