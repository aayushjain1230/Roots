(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const HISTORY_KEY = "bij-history-v2";
  let initialized = false;
  const history = () => { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const savedProducts = () => root.ROOTS_REPORT_ACTIONS?.getSavedProducts?.() || [];
  const meals = () => root.ROOTS_SAVED_MEALS?.list?.({ includeArchived: false }) || [];
  const favoriteRestaurants = () => root.ROOTS_PERSONALIZATION?.list?.("restaurants") || [];
  const data = () => ({ history: history(), savedProducts: savedProducts(), meals: meals(), favoriteRestaurants: favoriteRestaurants() });
  function productCard(item) {
    const image = root.ROOTS_REPORT_ACTIONS?.safeImageUrl?.(item.image);
    return `<button type="button" class="personalized-item" data-home-product="${esc(item.id)}">
      ${image ? `<img src="${esc(image)}" alt="" loading="lazy" width="52" height="52">` : '<span class="personalized-placeholder" aria-hidden="true">✓</span>'}
      <span><b>${esc(item.name)}</b>${item.brand ? `<small>${esc(item.brand)}</small>` : ""}<small>${esc(item.reason)}</small></span>
    </button>`;
  }
  function renderHome() {
    const target = $("personalized-home");
    if (!target || !root.ROOTS_RECOMMENDATIONS || !root.ROOTS_PERSONALIZATION) return;
    const all = data(), recent = root.ROOTS_RECOMMENDATIONS.recentlySafe(all.history, 4);
    const recommendedMeals = root.ROOTS_RECOMMENDATIONS.meals(all.meals, 3);
    const state = root.ROOTS_PERSONALIZATION.getState();
    const favoriteRecords = new Map(root.ROOTS_PERSONALIZATION.list("products").map((item) => [item.id, item]));
    const favorites = savedProducts().filter((item) => item.verdict === "SAFE" && favoriteRecords.has(item.id)).sort((a, b) =>
      Number(favoriteRecords.get(b.id)?.metadata?.groceryStore === state.preferences.groceryStore) -
      Number(favoriteRecords.get(a.id)?.metadata?.groceryStore === state.preferences.groceryStore)
    ).slice(0, 4).map((item) => ({
      id: item.id, name: item.product?.name, brand: item.product?.brand, image: item.product?.image,
      reason: favoriteRecords.get(item.id)?.metadata?.groceryStore
        ? `You marked this compatible product as a favorite at ${favoriteRecords.get(item.id).metadata.groceryStore}.`
        : "You marked this compatible product as a favorite.",
    }));
    const recentScans = all.history.slice(0, 5);
    const hasUsefulContent = recent.length || favorites.length || recommendedMeals.length || recentScans.length > 1 || state.preferences.groceryStore;
    if (!hasUsefulContent) {
      target.replaceChildren();
      target.hidden = true;
      return;
    }
    const scanCount = recentScans.length;
    const latestScanTime = recentScans[0]?.scannedAt || recentScans[0]?.savedAt || recentScans[0]?.createdAt;
    const minutesAgo = latestScanTime ? Math.max(1, Math.round((Date.now() - Date.parse(latestScanTime)) / 60000)) : null;
    const recentDetail = `${scanCount} product${scanCount === 1 ? "" : "s"} scanned${minutesAgo && Number.isFinite(minutesAgo) ? ` · ${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago` : ""}`;
    const continuation = recent[0] || recentScans[0]
      ? { title: "Recent scans", detail: recentDetail, target: "activity" }
      : recommendedMeals[0]
        ? { title: "Order again", detail: `${recommendedMeals[0].name}${recommendedMeals[0].restaurant?.name ? ` at ${recommendedMeals[0].restaurant.name}` : ""}`, target: "meals" }
        : favorites[0]
          ? { title: "Saved favorite", detail: favorites[0].name, target: "products" }
          : { title: "Recent scans", detail: "View your recently scanned products", target: "activity" };
    target.hidden = false;
    target.innerHTML = `<section class="home-personalized-card" aria-labelledby="home-personalized-title">
      <p class="eyebrow">Continue</p>
      <button type="button" class="home-continuation" data-home-destination="savedView" data-saved-target="${continuation.target}">
        <span class="home-continuation-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"></path><path d="M4 4v4.5h4.5M12 8v4l3 2"></path></svg></span>
        <span><b id="home-personalized-title">${esc(continuation.title)}</b><small>${esc(continuation.detail)}</small></span><span aria-hidden="true">›</span>
      </button>
    </section>`;
    return;
    /* Legacy multi-panel renderer retained below for storage compatibility; Phase 7 uses one continuation. */
    target.hidden = false;
    target.innerHTML = `<section class="home-personalized-card" aria-labelledby="home-personalized-title">
      <div class="section-head with-action"><div><p class="eyebrow">For you</p><h2 id="home-personalized-title">Pick up where you left off</h2></div></div>
      ${recent.length ? `<section class="personalized-row" aria-labelledby="recent-safe-title"><div class="section-head with-action"><h3 id="recent-safe-title">Recently Safe</h3><button type="button" class="text-btn" data-home-destination="savedView" data-saved-target="activity">View activity</button></div><div class="personalized-scroll">${recent.slice(0, 3).map(productCard).join("")}</div></section>` : ""}
      ${favorites.length ? `<section class="personalized-row" aria-labelledby="home-favorites-title"><div class="section-head with-action"><h3 id="home-favorites-title">Favorites</h3><button type="button" class="text-btn" data-home-destination="savedView" data-saved-target="products">Manage</button></div><div class="personalized-scroll">${favorites.slice(0, 3).map(productCard).join("")}</div></section>` : ""}
      ${recommendedMeals.length ? `<section class="personalized-row" aria-labelledby="recommended-orders-title"><div class="section-head with-action"><h3 id="recommended-orders-title">Recommended orders</h3><button type="button" class="text-btn" data-home-destination="savedView" data-saved-target="meals">Saved meals</button></div><div class="personalized-scroll">${recommendedMeals.slice(0, 2).map((item) => `<button type="button" class="personalized-item" data-home-meal="${esc(item.id)}"><span class="personalized-placeholder" aria-hidden="true">✓</span><span><b>${esc(item.name)}</b><small>${esc(item.restaurant?.name || "")}</small><small>${esc(item.reason)}</small></span></button>`).join("")}</div></section>` : ""}
      ${recentScans.length > 1 ? `<section class="continue-shopping" aria-labelledby="continue-shopping-title"><div><h3 id="continue-shopping-title">Continue Shopping</h3><p>Review your latest scans or scan the next item.</p></div><button type="button" class="ghost-btn" data-home-destination="savedView" data-saved-target="activity">Recent scans</button></section>` : ""}
      <details class="home-personalized-tools"><summary>Search saved ROOTS data${state.preferences.groceryStore ? ` · ${esc(state.preferences.groceryStore)}` : ""}</summary>
      <form id="smart-search-form" class="smart-search-form" role="search">
        <label for="smart-search-input">Search ROOTS</label>
        <div><input id="smart-search-input" type="search" maxlength="120" autocomplete="off" placeholder="Products, restaurants, meals, ingredients…"><button type="submit">Search</button></div>
      </form>
      <div id="smart-search-results" class="smart-search-results" hidden aria-live="polite"></div>
      <label class="grocery-mode-control" for="grocery-mode-store"><span><b>Grocery Mode</b><small>Prioritize products you have explicitly found at a store. Availability is never assumed.</small></span>
        <select id="grocery-mode-store"><option value="">No store selected</option>${["Costco", "Walmart", "Trader Joe's", "Whole Foods", "Target"].map((store) => `<option value="${esc(store)}"${state.preferences.groceryStore === store ? " selected" : ""}>${esc(store)}</option>`).join("")}</select>
      </label></details></section>`;
  }
  function renderSavedFavorites() {
    const target = $("favoriteProductsList");
    if (!target) return;
    const favorites = savedProducts().filter((item) => root.ROOTS_PERSONALIZATION.isFavorite("products", item.id));
    target.innerHTML = favorites.length ? favorites.map((item) => `<article class="favorite-product-card" data-favorite-product="${esc(item.id)}">
      <div><span class="history-badge safe">Favorite</span><h4>${esc(item.product?.name || "Scanned Product")}</h4><p>${esc(item.product?.brand || "")}</p><small>${esc(item.mainReasons?.[0] || "Saved compatible report")}</small></div>
      <div><button type="button" class="ghost-btn" data-favorite-action="open">Open</button><button type="button" class="text-btn" data-favorite-action="remove">Unfavorite</button></div>
    </article>`).join("") : '<div class="empty-state"><h4>No favorite products yet</h4><p>Favorite a Saved product to keep it here.</p><button type="button" class="text-btn" data-favorite-action="browse-saved">Browse Saved Products</button></div>';
  }
  function renderSavedRestaurants() {
    const target = $("savedRestaurantsList");
    if (!target || !root.ROOTS_PERSONALIZATION) return;
    const favorites = favoriteRestaurants();
    target.innerHTML = favorites.length ? favorites.map((item) => {
      const orders = (root.ROOTS_ORDER_HISTORY?.list?.({ restaurantId: item.id }) || []).sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
      return `<article class="saved-restaurant-card" data-personalized-restaurant="${esc(item.id)}"><div><h4>${esc(item.name)}</h4><p>${esc(item.metadata?.address || item.detail || "Address not stored")}</p><small>${orders[0] ? `Last visit ${esc(new Date(orders[0].orderedAt).toLocaleDateString())}` : "No visit recorded"}${item.metadata?.evidenceLevel ? ` · ${esc(item.metadata.evidenceLevel.replaceAll("_", " "))} evidence when saved` : ""}</small></div>
        <label>Personal note<input type="text" maxlength="300" value="${esc(item.metadata?.note || "")}" data-favorite-restaurant-note></label>
        <div><button type="button" class="text-btn" data-restaurant-favorite-action="save-note">Save note</button><button type="button" class="text-btn" data-restaurant-favorite-action="remove">Unfavorite</button></div></article>`;
    }).join("") : '<div class="empty-state"><h4>No saved restaurants yet</h4><p>Favorite a restaurant to keep it here.</p><button type="button" class="primary-btn" data-empty-view="restaurantsView">Find Restaurants</button></div>';
  }
  function renderSearch(query) {
    const target = $("smart-search-results");
    if (!target || !root.ROOTS_SMART_SEARCH) return;
    const results = root.ROOTS_SMART_SEARCH.search(query, data(), 20);
    target.hidden = false;
    target.innerHTML = results.length ? `<div class="section-head with-action"><h3>Search results</h3><button type="button" class="text-btn" data-search-close>Close</button></div>
      <ul>${results.map((item) => `<li><button type="button" data-search-type="${esc(item.type)}" data-search-id="${esc(item.id)}"><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span><em>${esc(item.type)}</em></button>${item.type === "ingredient" ? `<button type="button" class="text-btn search-favorite-ingredient" data-favorite-ingredient="${esc(item.id)}" data-favorite-name="${esc(item.title)}" aria-pressed="${root.ROOTS_PERSONALIZATION.isFavorite("ingredients", item.id) ? "true" : "false"}">${root.ROOTS_PERSONALIZATION.isFavorite("ingredients", item.id) ? "Favorited" : "Favorite ingredient"}</button>` : ""}</li>`).join("")}</ul>`
      : `<div class="search-empty"><p>No local results found.</p><button type="button" class="text-btn" data-search-close>Clear search</button></div>`;
  }
  function openProduct(id) { root.dispatchEvent?.(new CustomEvent("roots:openproduct", { detail: { id } })); }
  function go(view) { document.querySelector(`.dock-btn[data-view="${view}"]`)?.click(); }
  function bind() {
    $("personalized-home")?.addEventListener("submit", (event) => {
      if (event.target.id !== "smart-search-form") return;
      event.preventDefault(); renderSearch($("smart-search-input").value);
    });
    $("personalized-home")?.addEventListener("change", (event) => {
      if (event.target.id === "grocery-mode-store") {
        root.ROOTS_PERSONALIZATION.setPreference("groceryStore", event.target.value);
        if (event.target.value) root.ROOTS_PERSONALIZATION.favorite("stores", { id: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: event.target.value, detail: "Selected in Grocery Mode" });
      }
    });
    $("personalized-home")?.addEventListener("click", (event) => {
      const product = event.target.closest("[data-home-product]"); if (product) { openProduct(product.dataset.homeProduct); return; }
      const meal = event.target.closest("[data-home-meal]"); if (meal) { go("savedView"); setTimeout(() => root.ROOTS_RESTAURANT_MEMORY?.openMeal?.(meal.dataset.homeMeal), 0); return; }
      const destination = event.target.closest("[data-home-destination]"); if (destination) {
        if (destination.dataset.savedTarget) sessionStorage.setItem("roots-saved-category-v1", destination.dataset.savedTarget);
        go(destination.dataset.homeDestination); return;
      }
      if (event.target.closest("[data-search-close]")) { $("smart-search-input").value = ""; $("smart-search-results").hidden = true; return; }
      const result = event.target.closest("[data-search-type]");
      const favoriteIngredient = event.target.closest("[data-favorite-ingredient]");
      if (favoriteIngredient) {
        root.ROOTS_PERSONALIZATION.toggle("ingredients", { id: favoriteIngredient.dataset.favoriteIngredient, name: favoriteIngredient.dataset.favoriteName, detail: "Explicitly favorited ingredient" });
        renderSearch($("smart-search-input").value);
        return;
      }
      if (!result) return;
      if (["product", "history"].includes(result.dataset.searchType)) openProduct(result.dataset.searchId);
      else if (result.dataset.searchType === "meal") { go("savedView"); setTimeout(() => root.ROOTS_RESTAURANT_MEMORY?.openMeal?.(result.dataset.searchId), 0); }
      else if (result.dataset.searchType === "ingredient") root.ROOTS_INGREDIENT_EXPLORER?.open?.(result.dataset.searchId, result);
      else go("restaurantsView");
    });
    $("favoriteProductsList")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-favorite-action='browse-saved']")) { $("saved-product-search")?.focus?.(); return; }
      const card = event.target.closest("[data-favorite-product]"); if (!card) return;
      if (event.target.closest("[data-favorite-action='remove']")) root.ROOTS_PERSONALIZATION.unfavorite("products", card.dataset.favoriteProduct);
      else if (event.target.closest("[data-favorite-action='open']")) openProduct(card.dataset.favoriteProduct);
    });
    $("savedRestaurantsList")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-personalized-restaurant]"), action = event.target.closest("[data-restaurant-favorite-action]")?.dataset.restaurantFavoriteAction;
      if (!card || !action) return;
      const existing = favoriteRestaurants().find((item) => item.id === card.dataset.personalizedRestaurant); if (!existing) return;
      if (action === "remove") root.ROOTS_PERSONALIZATION.unfavorite("restaurants", existing.id);
      else root.ROOTS_PERSONALIZATION.favorite("restaurants", { ...existing, metadata: { ...existing.metadata, note: card.querySelector("[data-favorite-restaurant-note]").value } });
    });
    $("home-restaurant-finder")?.addEventListener("click", () => go("restaurantsView"));
    root.addEventListener?.("roots:personalizationchange", () => { renderHome(); renderSavedFavorites(); renderSavedRestaurants(); });
    root.addEventListener?.("roots:savedproductschange", () => { renderHome(); renderSavedFavorites(); });
    root.addEventListener?.("roots:historychange", renderHome);
  }
  function init() {
    if (initialized || !root.ROOTS_PERSONALIZATION) return;
    initialized = true; bind();
    const schedule = root.requestIdleCallback || ((callback) => setTimeout(callback, 120));
    schedule(() => {
      const task = root.ROOTS_PERFORMANCE?.startTask?.("home_personalization", { source: "local" });
      renderHome(); renderSavedFavorites(); renderSavedRestaurants();
      root.ROOTS_PERFORMANCE?.endTask?.(task, { count: 1 });
    }, { timeout: 900 });
  }
  root.ROOTS_PERSONALIZATION_VIEW = { init, renderHome, renderSavedFavorites, renderSavedRestaurants, renderSearch };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
