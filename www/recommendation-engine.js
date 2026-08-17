(function (root) {
  "use strict";

  const VERSION = 1;
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const words = (value) => new Set(clean(value).toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2));
  const safeProduct = (item) => (item?.evaluation?.verdict || item?.verdict) === "SAFE";
  const safeMeal = (item) => ["BEST_CHOICE", "COMPATIBLE"].includes(item?.evaluation?.verdict);
  const safeRestaurant = (item) => ["EXCELLENT_MATCH", "GOOD_MATCH"].includes(item?.matchCategory);
  const dateValue = (item) => Date.parse(item?.scannedAt || item?.savedAt || item?.lastCheckedAt || item?.favoritedAt || 0) || 0;
  const productRecord = (item) => {
    const product = item?.product || {};
    return {
      id: clean(item?.id || product.barcode || `${product.name || product.productName}:${product.brand}`),
      name: clean(product.name || product.productName) || "Scanned product",
      brand: clean(product.brand),
      image: clean(product.image),
      barcode: clean(product.barcode),
      verdict: item?.evaluation?.verdict || item?.verdict || "",
      source: item,
    };
  };
  function unique(items) {
    const seen = new Set();
    return items.filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
  }
  function frequency(items, selector) {
    const counts = new Map();
    items.map(selector).filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return counts;
  }
  function recentlySafe(history, limit = 6) {
    return unique((history || []).filter(safeProduct).sort((a, b) => dateValue(b) - dateValue(a)).map(productRecord)).slice(0, limit)
      .map((item) => ({ ...item, reason: "You recently scanned this product and ROOTS found it compatible with the profile used then." }));
  }
  function productRecommendations(input, limit = 8) {
    const history = input?.history || [], saved = input?.savedProducts || [];
    const brands = frequency(history.filter(safeProduct), (item) => clean(item.product?.brand).toLowerCase());
    const store = clean(input?.groceryStore);
    return unique([...saved, ...history].filter(safeProduct).sort((a, b) => {
      const aBrand = brands.get(clean(a.product?.brand).toLowerCase()) || 0;
      const bBrand = brands.get(clean(b.product?.brand).toLowerCase()) || 0;
      return bBrand - aBrand || dateValue(b) - dateValue(a);
    }).map(productRecord)).slice(0, limit).map((item) => ({
      ...item,
      reason: store
        ? `Known compatible from your local records; shown first while Grocery Mode is set to ${store}. Store availability is not assumed.`
        : brands.get(item.brand.toLowerCase()) > 1
          ? `You have safely scanned ${item.brand || "this brand"} more than once.`
          : "This is a compatible product already present in your local history or Saved items.",
    }));
  }
  function alternatives(unsafeProduct, candidates, limit = 6) {
    const source = productRecord(unsafeProduct || {});
    const sourceWords = words(`${source.name} ${source.brand} ${unsafeProduct?.product?.categories || ""}`);
    return unique((candidates || []).filter(safeProduct).map(productRecord).filter((item) => item.id !== source.id).map((item) => {
      const targetWords = words(`${item.name} ${item.brand} ${item.source?.product?.categories || ""}`);
      const shared = [...sourceWords].filter((word) => targetWords.has(word)).length;
      const sameBrand = source.brand && source.brand.toLowerCase() === item.brand.toLowerCase();
      const score = shared * 3 + (sameBrand ? 2 : 0);
      const similarity = score >= 8 ? "Very Similar" : score >= 3 ? "Similar" : "Different but Safe";
      return { ...item, similarity, score, reason: `${similarity}: this known local product was previously classified Safe${shared ? ` and shares ${shared} product term${shared === 1 ? "" : "s"}` : ""}.` };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))).slice(0, limit);
  }
  function restaurantRecommendations(summaries, favorites, limit = 6) {
    const favoriteIds = new Set((favorites || []).map((item) => item.id));
    return (summaries || []).filter(safeRestaurant).sort((a, b) =>
      Number(favoriteIds.has(b.restaurantId)) - Number(favoriteIds.has(a.restaurantId)) ||
      (b.dishCounts?.bestChoice || 0) - (a.dishCounts?.bestChoice || 0) ||
      clean(a.restaurantName).localeCompare(clean(b.restaurantName))
    ).slice(0, limit).map((item) => ({
      ...item,
      reason: favoriteIds.has(item.restaurantId)
        ? "You explicitly favorited this restaurant, and its current deterministic match remains compatible."
        : "Its analyzed menu contains compatible choices for your current profile.",
    }));
  }
  function mealRecommendations(meals, limit = 6) {
    return (meals || []).filter(safeMeal).sort((a, b) =>
      Number(!!b.favorite) - Number(!!a.favorite) || (b.timesUsed || 0) - (a.timesUsed || 0) || dateValue(b) - dateValue(a)
    ).slice(0, limit).map((item) => ({
      ...item,
      reason: item.favorite ? "You explicitly saved this as a favorite compatible meal." :
        item.timesUsed ? `You have used this compatible order ${item.timesUsed} time${item.timesUsed === 1 ? "" : "s"}.` :
          "This saved meal had a compatible deterministic verdict when checked.",
    }));
  }
  function context(date) {
    const current = date instanceof Date ? date : new Date(date || Date.now());
    const hour = current.getHours(), month = current.getMonth() + 1;
    return {
      meal: hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack",
      season: [12, 1, 2].includes(month) ? "winter" : [3, 4, 5].includes(month) ? "spring" : [6, 7, 8].includes(month) ? "summer" : "fall",
    };
  }
  function profileSignals(profile) {
    return {
      dietaryRestrictions: [
        ...(profile?.religiousDiets || []), ...(profile?.lifestyleDiets || []),
        ...(profile?.restrictions || []), ...(profile?.customRules || []).map((item) => item.name || item.ingredient),
      ].filter(Boolean),
      allergens: (profile?.allergies || []).map((item) => typeof item === "string" ? item : item.name || item.id).filter(Boolean),
    };
  }

  root.ROOTS_RECOMMENDATIONS = {
    version: VERSION, recentlySafe, products: productRecommendations, alternatives,
    restaurants: restaurantRecommendations, meals: mealRecommendations, context, profileSignals,
    isSafeProduct: safeProduct, isSafeMeal: safeMeal, isSafeRestaurant: safeRestaurant,
  };
})(typeof window !== "undefined" ? window : globalThis);
