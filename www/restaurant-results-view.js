(function (root) {
  "use strict";
  const Ranking = root.ROOTS_RESTAURANT_RANKING, Cache = root.ROOTS_RESTAURANT_RANKING_STORAGE;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const LABEL = { EXCELLENT_MATCH: "Excellent Match", GOOD_MATCH: "Good Match", LIMITED_OPTIONS: "Limited Options", NEEDS_MORE_INFORMATION: "Needs More Information", POOR_MATCH: "Poor Match" };
  const COPY = {
    EXCELLENT_MATCH: "Several strong options for your profile.", GOOD_MATCH: "A few good options, with some limitations.",
    LIMITED_OPTIONS: "Only a small number of workable choices.", NEEDS_MORE_INFORMATION: "ROOTS needs more menu or preparation details.",
    POOR_MATCH: "Confirmed menu conflicts leave no strong options.",
  };
  let sourceRestaurants = [], summaries = [], restaurants = new Map(), sortId = "best_match", filters = new Set(), context = {}, initialized = false, analysisToken = 0;
  function summaryFor(restaurant) {
    const profile = root.ROOTS_PROFILE.getActiveProfile();
    const menu = root.ROOTS_MENU_STORAGE.getByRestaurant(restaurant.id)[0] || null;
    const key = Cache.cacheKey(restaurant, menu, profile, context);
    const cached = Cache.get(key);
    if (cached) return { ...cached, report: cached.report || null };
    let report = null;
    if (menu) {
      try { report = root.ROOTS_RESTAURANT_REPORT.generate(menu, profile, { cuisine: restaurant.cuisine }); }
      catch (_) { report = null; }
    }
    return Cache.set(key, Ranking.summarize(restaurant, menu, report, { ...context, profile }));
  }
  function card(summary) {
    const restaurant = restaurants.get(summary.restaurantId) || {};
    const analyzed = summary.dishCounts.totalEvaluated > 0;
    return `<article class="restaurant-card personalized-card category-${esc(summary.matchCategory.toLowerCase().replaceAll("_", "-"))}" aria-label="${esc(`${summary.restaurantName}, ${LABEL[summary.matchCategory]}`)}">
      ${restaurant.image ? `<img src="${esc(restaurant.image)}" alt="" loading="lazy" width="112" height="96">` : `<span class="restaurant-image-placeholder" aria-hidden="true">⌂</span>`}
      <div class="personalized-card-main"><div class="restaurant-card-title"><h3>${esc(summary.restaurantName)}</h3><span class="match-category">${esc(LABEL[summary.matchCategory])}</span></div>
      <p>${esc(restaurant.cuisine || "Cuisine not provided")}${restaurant.distanceMiles != null ? ` · ${esc(restaurant.distanceMiles.toFixed(1))} mi` : ""} · ${esc(restaurant.openStatus === "open" ? "Open" : restaurant.openStatus === "closed" ? "Closed" : "Hours unavailable")}</p>
      <p class="match-copy">${esc(COPY[summary.matchCategory])}</p>
      ${analyzed ? `<p class="dish-count-summary"><b>${summary.dishCounts.bestChoice} Best Choice${summary.dishCounts.bestChoice === 1 ? "" : "s"}</b> · ${summary.dishCounts.canModify} Can Be Modified${summary.dishCounts.needsConfirmation ? ` · ${summary.dishCounts.needsConfirmation} Need Confirmation` : ""}</p>
      <p class="evidence-freshness">${esc(summary.evidence.level[0] + summary.evidence.level.slice(1).toLowerCase())} evidence · ${esc(summary.freshness.status === "current" ? `Menu checked ${summary.freshness.ageDays} days ago` : summary.freshness.status === "unknown" ? "Menu date unknown" : "Menu may have changed")}</p>
      ${summary.topDishes.length ? `<div class="top-dishes"><b>Top choices</b><ul>${summary.topDishes.map((dish) => `<li>${esc(dish.name)}</li>`).join("")}</ul></div>` : ""}` : `<p class="menu-needed">Menu needed before personalized ranking.</p>`}
      <div class="restaurant-card-actions">
        <button type="button" class="secondary-btn" data-view-restaurant="${esc(summary.restaurantId)}">${analyzed ? "View Restaurant" : restaurant.menuAvailable ? "Check Menu" : "Add Menu"}</button>
        <button type="button" class="text-btn" data-favorite-restaurant="${esc(summary.restaurantId)}" aria-pressed="${root.ROOTS_PERSONALIZATION?.isFavorite?.("restaurants", summary.restaurantId) ? "true" : "false"}">${root.ROOTS_PERSONALIZATION?.isFavorite?.("restaurants", summary.restaurantId) ? "Favorited" : "Favorite"}</button>
        ${analyzed ? `<button type="button" class="text-btn" data-compare-restaurant="${esc(summary.restaurantId)}">Compare</button>` : ""}
      </div></div></article>`;
  }
  function render() {
    const task = root.ROOTS_PERFORMANCE?.startTask?.("restaurant_result_render", { count: summaries.length });
    const filtered = Ranking.applyFilters(Ranking.sortSummaries(summaries, sortId), filters);
    $("restaurant-results-meta").textContent = `${filtered.length} restaurant${filtered.length === 1 ? "" : "s"} shown${filters.size ? ` with ${filters.size} filter${filters.size === 1 ? "" : "s"}` : ""}.`;
    $("restaurant-filter-count").textContent = filters.size ? `${filters.size} active` : "None active";
    const list = $("restaurant-results");
    if (!filtered.length) {
      list.innerHTML = `<div class="restaurant-state"><h3>${filters.size ? "No restaurants match these filters" : "No strong matches found"}</h3><p>${filters.size ? "Clear filters to see all restaurant results." : "ROOTS found restaurants, but needs more compatible options or evidence for a strong match."}</p>${filters.size ? `<button type="button" class="secondary-btn" data-ranking-action="clear-filters">Clear Filters</button>` : ""}</div>`;
    } else {
      list.innerHTML = filtered.map(card).join("");
    }
    $("restaurant-results-live").textContent = `${filtered.length} restaurant results updated.`;
    root.ROOTS_PERFORMANCE?.endTask?.(task, { count: filtered.length });
  }
  function open(results, nextContext) {
    analysisToken += 1;
    sourceRestaurants = Array.isArray(results) ? results.slice() : [];
    restaurants = new Map(sourceRestaurants.map((item) => [item.id, item]));
    context = { ...(nextContext || {}) };
    summaries = sourceRestaurants.map(summaryFor);
    render(); return summaries.slice();
  }
  async function openProgressive(results, nextContext, options) {
    const task = root.ROOTS_PERFORMANCE?.startTask?.("restaurant_analysis", { count: results?.length || 0, concurrency: 4 });
    analysisToken += 1;
    const token = analysisToken;
    sourceRestaurants = Array.isArray(results) ? results.slice() : [];
    restaurants = new Map(sourceRestaurants.map((item) => [item.id, item]));
    context = { ...(nextContext || {}) };
    summaries = [];
    const batchSize = Math.max(1, Math.min(8, Number(options?.batchSize) || 4));
    for (let index = 0; index < sourceRestaurants.length; index += batchSize) {
      if (token !== analysisToken) { root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "cancelled", count: summaries.length }); return { cancelled: true, summaries: summaries.slice() }; }
      sourceRestaurants.slice(index, index + batchSize).forEach((item) => summaries.push(summaryFor(item)));
      render();
      options?.onPartial?.(summaries.slice());
      if (index + batchSize < sourceRestaurants.length) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    summaries = Ranking.sortSummaries(summaries, sortId);
    render();
    options?.onComplete?.(summaries.slice());
    root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "complete", count: summaries.length });
    return { cancelled: false, summaries: summaries.slice() };
  }
  function cancel() { analysisToken += 1; return summaries.slice(); }
  function setSort(next) { sortId = ["best_match", "distance", "best_choices", "modifiable", "evidence"].includes(next) ? next : "best_match"; render(); return sortId; }
  function setFilters(next) { filters = new Set(next || []); render(); return [...filters]; }
  function clearFilters() { filters.clear(); document.querySelectorAll("[data-ranking-filter]").forEach((input) => { input.checked = false; }); render(); }
  function refresh() { summaries = sourceRestaurants.map((item) => { Cache.invalidateRestaurant(item.id); return summaryFor(item); }); render(); return summaries.slice(); }
  function bind() {
    $("restaurant-sort")?.addEventListener("change", (event) => setSort(event.target.value));
    $("restaurant-ranking-filters")?.addEventListener("change", () => setFilters([...document.querySelectorAll("[data-ranking-filter]:checked")].map((item) => item.value)));
    $("restaurant-clear-filters")?.addEventListener("click", clearFilters);
    $("restaurant-results")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-ranking-action='clear-filters']")) { clearFilters(); return; }
      const detail = event.target.closest("[data-view-restaurant]");
      if (detail) {
        const summary = summaries.find((item) => item.restaurantId === detail.dataset.viewRestaurant);
        const restaurant = restaurants.get(detail.dataset.viewRestaurant);
        if (summary?.dishCounts.totalEvaluated) root.ROOTS_RESTAURANT_DETAIL.open(summary, restaurant, detail);
        else root.ROOTS_MENU_REVIEW?.open(restaurant, detail);
      }
      const favorite = event.target.closest("[data-favorite-restaurant]");
      if (favorite && root.ROOTS_PERSONALIZATION) {
        const summary = summaries.find((item) => item.restaurantId === favorite.dataset.favoriteRestaurant);
        const restaurant = restaurants.get(favorite.dataset.favoriteRestaurant) || {};
        if (summary) {
          const active = root.ROOTS_PERSONALIZATION.toggle("restaurants", {
            id: summary.restaurantId, name: summary.restaurantName, detail: restaurant.cuisine || restaurant.address,
            image: restaurant.image, metadata: {
              address: restaurant.address || "", cuisine: restaurant.cuisine || "",
              evidenceLevel: summary.evidence?.level || "UNKNOWN", matchCategory: summary.matchCategory,
            },
          });
          if (active && restaurant.cuisine) root.ROOTS_PERSONALIZATION.favorite("cuisines", {
            id: restaurant.cuisine.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: restaurant.cuisine,
            detail: "Cuisine from an explicitly favorited restaurant",
          });
        }
        render();
        return;
      }
      const compare = event.target.closest("[data-compare-restaurant]");
      if (compare) {
        const summary = summaries.find((item) => item.restaurantId === compare.dataset.compareRestaurant);
        const result = root.ROOTS_RESTAURANT_COMPARISON.add(summary);
        $("restaurant-comparison-status").textContent = result.accepted ? `${summary.restaurantName} added to comparison.` : result.reason === "limit" ? "Compare up to three restaurants. Remove one before adding another." : "Restaurant is already in comparison.";
        renderComparison();
      }
    });
    $("restaurant-clear-comparison")?.addEventListener("click", () => { root.ROOTS_RESTAURANT_COMPARISON.clear(); renderComparison(); });
    $("restaurant-comparison-table")?.addEventListener("click", (event) => { const button = event.target.closest("[data-remove-comparison]"); if (button) { root.ROOTS_RESTAURANT_COMPARISON.remove(button.dataset.removeComparison); renderComparison(); } });
  }
  function renderComparison() {
    const items = root.ROOTS_RESTAURANT_COMPARISON.getItems(), panel = $("restaurant-comparison-panel");
    panel.hidden = !items.length;
    $("restaurant-clear-comparison").hidden = !items.length;
    $("restaurant-comparison-table").innerHTML = items.length ? `<table><caption>Restaurant dietary comparison</caption><thead><tr><th scope="col">Restaurant</th><th scope="col">Match</th><th scope="col">Best Choices</th><th scope="col">Can Modify</th><th scope="col">Evidence</th><th scope="col">Freshness</th><th scope="col">Action</th></tr></thead><tbody>${items.map((item) => `<tr><th scope="row">${esc(item.restaurantName)}</th><td>${esc(LABEL[item.matchCategory])}</td><td>${item.dishCounts.bestChoice}</td><td>${item.dishCounts.canModify}</td><td>${esc(item.evidence.level)}</td><td>${esc(item.freshness.status.replaceAll("_", " "))}</td><td><button type="button" data-remove-comparison="${esc(item.restaurantId)}">Remove</button></td></tr>`).join("")}</tbody></table>` : "";
  }
  function destroy() { cancel(); sourceRestaurants = []; summaries = []; restaurants.clear(); filters.clear(); context = {}; }
  function init() { if (initialized || !$("restaurant-sort")) return; initialized = true; bind(); }
  root.ROOTS_RESTAURANT_RESULTS = { init, open, openProgressive, cancel, setSort, setFilters, clearFilters, refresh, destroy, getSummaries: () => summaries.slice(), getSort: () => sortId, getFilters: () => [...filters] };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
