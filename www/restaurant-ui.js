(function (root) {
  "use strict";
  const Search = root.ROOTS_RESTAURANT_SEARCH, Storage = root.ROOTS_RESTAURANT_STORAGE;
  if (!Search || !Storage) throw new Error("Restaurant modules must load before restaurant-ui.js");

  const MEALS = Object.freeze([
    "Pizza", "Indian", "Chinese", "Thai", "Mexican", "Italian", "Mediterranean",
    "Breakfast", "Dessert", "Coffee", "Healthy", "Fast Food",
    "Jain Friendly", "Burgers", "Asian", "Coffee & Bakery",
  ]);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let location = null, meal = "", initialized = false, autocompleteTimer = null, autocompleteController = null, renderedRestaurants = new Map(), mapVisible = true;

  function status(message, kind) {
    const el = $("restaurant-status");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "";
  }
  function showStep(number) {
    $("restaurant-location-step").hidden = false;
    $("restaurant-meal-step").hidden = number < 2;
    $("restaurant-results-step").hidden = number !== 3;
  }
  function locationLabel() { return location?.label || "Choose location"; }
  function renderLocationCollections() {
    const saved = Storage.getSavedLocations(), recent = Storage.getRecentLocations();
    const render = (items, savedGroup) => items.length ? items.map((item) =>
      `<button type="button" class="location-row" data-location-id="${esc(item.id)}" data-location-group="${savedGroup ? "saved" : "recent"}"><span aria-hidden="true">${item.kind === "home" ? "⌂" : item.kind === "work" ? "▣" : "⌖"}</span><span><b>${esc(item.kind === "home" ? "Home" : item.kind === "work" ? "Work" : item.label)}</b>${item.kind ? `<small>${esc(item.label)}</small>` : ""}</span></button>`
    ).join("") : `<p class="restaurant-empty-small">None yet.</p>`;
    $("restaurant-saved-locations").innerHTML = render(saved, true);
    $("restaurant-recent-locations").innerHTML = render(recent, false);
  }
  function selectLocation(next) {
    location = root.ROOTS_RESTAURANT_PROVIDER.validateLocation(next);
    if (!location) return;
    Storage.addRecentLocation(location);
    $("restaurant-selected-location").textContent = locationLabel();
    $("restaurant-location-actions").hidden = false;
    renderLocationCollections();
    showStep(2);
    $("restaurant-meal-input").focus();
  }
  function renderMealCollections() {
    $("restaurant-meal-chips").innerHTML = MEALS.map((item) => `<button type="button" class="meal-chip${item === meal ? " selected" : ""}" data-meal="${esc(item)}">${esc(item)}</button>`).join("");
    const recent = Storage.getRecentSearches();
    $("restaurant-recent-searches").innerHTML = recent.length ? recent.map((item, index) =>
      `<button type="button" class="recent-search-row" data-recent-search="${index}"><span><b>${esc(item.meal)}</b><small>${esc(item.location.label)} · ${esc(item.radius)} mi</small></span><span aria-hidden="true">›</span></button>`
    ).join("") : `<p class="restaurant-empty-small">Your recent meal searches will appear here.</p>`;
    $("restaurant-clear-searches").hidden = !recent.length;
  }
  function setMeal(value) {
    meal = Search.cleanMeal(value);
    $("restaurant-meal-input").value = meal;
    renderMealCollections();
  }

  function osmUrl(item) {
    const coords = item?.coordinates;
    if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(coords.latitude)}&mlon=${encodeURIComponent(coords.longitude)}#map=17/${encodeURIComponent(coords.latitude)}/${encodeURIComponent(coords.longitude)}`;
    return "";
  }
  function renderMapPreview(restaurants) {
    const map = $("restaurant-map-preview");
    if (!map) return;
    const mapped = (restaurants || []).filter((item) => osmUrl(item)).slice(0, 8);
    map.hidden = !mapVisible || !mapped.length;
    map.innerHTML = mapped.length ? `<div class="restaurant-map-header"><h4>Map</h4><small>OpenStreetMap links, no bulk tile downloads</small></div><div class="restaurant-map-pins">${mapped.map((item, index) => `<a href="${esc(osmUrl(item))}" target="_blank" rel="noopener noreferrer"><span>${index + 1}</span>${esc(item.name)}</a>`).join("")}</div>` : "";
  }

  function renderRestaurants(restaurants, cached, cacheRecord) {
    renderedRestaurants = new Map(restaurants.map((item) => [item.id, item]));
    const list = $("restaurant-results");
    $("restaurant-results-title").textContent = `${meal} near ${locationLabel()}`;
    $("restaurant-results-meta").textContent = cached
      ? `${cacheRecord?.cacheFreshness === "stale" ? "Cached information may be outdated" : "Showing cached information"}${cacheRecord?.cachedAt ? ` · last updated ${new Date(cacheRecord.cachedAt).toLocaleString()}` : ""}. Live hours and distance are unavailable offline.`
      : `${restaurants.length} restaurant${restaurants.length === 1 ? "" : "s"} found`;
    renderMapPreview(restaurants);
    const toggle = $("restaurant-map-toggle");
    if (toggle) toggle.setAttribute("aria-pressed", String(mapVisible));
    if (root.ROOTS_RESTAURANT_RESULTS) {
      root.ROOTS_RESTAURANT_RESULTS.openProgressive(restaurants, { meal, location, radius: Number($("restaurant-radius").value), cached });
      return;
    }
    if (!restaurants.length) {
      list.innerHTML = stateCard("No restaurants found", "Try a broader meal search or increase the search radius.", "Change search", "change-search");
      return;
    }
    list.innerHTML = restaurants.map((item) => `<article class="restaurant-card">
      ${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy" width="112" height="96">` : `<span class="restaurant-image-placeholder" aria-hidden="true">⌂</span>`}
      <div><h3>${esc(item.name)}</h3>
      <p>${esc(item.cuisine || "Cuisine not provided")}${item.distanceMiles != null ? ` · ${esc(item.distanceMiles.toFixed(1))} mi` : ""}${item.provider === "openstreetmap" ? " · Public map data" : ""}</p>
      <div class="restaurant-facts">
        <span class="open-${esc(item.openStatus)}">${esc(item.openStatus === "open" ? "Open" : item.openStatus === "closed" ? "Closed" : "Hours unavailable")}</span>
        ${item.priceRange ? `<span>${esc(item.priceRange)}</span>` : ""}
        ${item.rating != null ? `<span aria-label="${esc(item.rating)} out of 5 stars">★ ${esc(item.rating.toFixed(1))}</span>` : ""}
      </div>
      <p class="restaurant-analysis"><b>${item.menuAvailable ? "Menu available" : "Menu availability unknown"}</b><span>Compatibility analysis: Not yet analyzed</span></p>
      <button type="button" class="secondary-btn restaurant-menu-button" data-restaurant-menu="${esc(item.id)}">${item.menuAvailable ? "View Menu" : "Add Menu"}</button></div>
    </article>`).join("");
  }
  function stateCard(title, message, action, actionId) {
    return `<div class="restaurant-state"><h3>${esc(title)}</h3><p>${esc(message)}</p>${action ? `<button type="button" class="secondary-btn" data-restaurant-action="${esc(actionId)}">${esc(action)}</button>` : ""}</div>`;
  }
  function renderError(error) {
    const code = error?.code || "network";
    const states = {
      offline: ["You're offline", "Reconnect to search restaurants. Cached searches are shown automatically when available.", "Retry", "retry"],
      timeout: ["Search took too long", "Check your connection and try again.", "Retry", "retry"],
      provider_unavailable: ["Restaurant search is not configured", "A restaurant data provider must be connected before live results are available.", "Change search", "change-search"],
      api_not_configured: ["Restaurant search is not configured", "This build needs a ROOTS API URL before live restaurant discovery can run.", "Change search", "change-search"],
      api_http: ["Restaurant service error", "The restaurant service responded with an error. Try again in a moment.", "Retry", "retry"],
      location_not_found: ["Location not found", "Try adding a city, state, or ZIP code.", "Choose location", "choose-location"],
      location_required: ["Choose a location", "Select your location before searching.", "Choose location", "choose-location"],
      meal_required: ["Choose a meal", "Enter a food, cuisine, or meal category.", "Change search", "change-search"],
      network: ["Could not load restaurants", "Check your connection and try again.", "Retry", "retry"],
      invalid_response: ["Results could not be read", "Try the search again.", "Retry", "retry"],
    };
    const item = states[code] || states.network;
    $("restaurant-results").innerHTML = stateCard(...item);
    $("restaurant-results-title").textContent = "Restaurant search";
    $("restaurant-results-meta").textContent = "";
  }
  async function submitSearch() {
    setMeal($("restaurant-meal-input").value);
    if (!location) { showStep(1); status("Choose a location before searching.", "error"); return; }
    if (!meal) { status("Enter what you would like to eat.", "error"); $("restaurant-meal-input").focus(); return; }
    status("Searching restaurants…", "loading");
    $("restaurant-search-button").disabled = true;
    showStep(3);
    $("restaurant-results").innerHTML = stateCard("Finding restaurants", "Searching near your selected location.");
    try {
      const result = await Search.searchRestaurants({ meal, location, radius: $("restaurant-radius").value });
      renderRestaurants(result.restaurants, result.cached, result);
      renderMealCollections();
      status("Restaurant search complete.", "success");
    } catch (error) {
      renderError(error);
      status(error?.message || "Restaurant search failed.", "error");
    } finally {
      $("restaurant-search-button").disabled = false;
    }
  }
  async function useCurrentLocation() {
    const button = $("restaurant-use-location");
    button.disabled = true;
    status("Getting your location…", "loading");
    try { selectLocation(await Search.getCurrentLocation()); status("Location selected.", "success"); }
    catch (error) { status(error?.message || "Location is unavailable. Enter an address instead.", "error"); $("restaurant-manual-address").focus(); }
    finally { button.disabled = false; }
  }
  async function updateAutocomplete() {
    const query = $("restaurant-manual-address").value.trim();
    autocompleteController?.abort();
    if (query.length < 3) { $("restaurant-address-suggestions").innerHTML = ""; return; }
    autocompleteController = new AbortController();
    try {
      const items = await Search.autocomplete(query, { signal: autocompleteController.signal });
      $("restaurant-address-suggestions").innerHTML = items.length ? items.map((item, index) =>
        `<button type="button" role="option" data-address-result="${index}">${esc(item.label)}</button>`
      ).join("") : `<p>No address suggestions found. Try adding a city, state, or ZIP code.</p>`;
      $("restaurant-address-suggestions")._items = items;
    } catch (error) {
      if (error?.code !== "cancelled") $("restaurant-address-suggestions").innerHTML = `<p>Address suggestions are unavailable. Check the provider or connection.</p>`;
    }
  }
  function bind() {
    $("restaurant-use-location").addEventListener("click", useCurrentLocation);
    $("restaurant-location-form").addEventListener("submit", async (event) => { event.preventDefault(); const query = $("restaurant-manual-address").value.trim(); status("Finding that location...", "loading"); try { selectLocation(await Search.resolveAddress(query)); status("Location selected.", "success"); } catch (error) { status(error?.message || "Location lookup failed.", "error"); updateAutocomplete(); } });
    $("restaurant-manual-address").addEventListener("input", () => {
      clearTimeout(autocompleteTimer);
      autocompleteTimer = setTimeout(updateAutocomplete, 300);
    });
    $("restaurant-address-suggestions").addEventListener("click", (event) => {
      const button = event.target.closest("[data-address-result]");
      if (button) selectLocation($("restaurant-address-suggestions")._items?.[Number(button.dataset.addressResult)]);
    });
    $("restaurantsView").addEventListener("click", (event) => {
      const locationButton = event.target.closest("[data-location-id]");
      if (locationButton) {
        const list = locationButton.dataset.locationGroup === "saved" ? Storage.getSavedLocations() : Storage.getRecentLocations();
        selectLocation(list.find((item) => item.id === locationButton.dataset.locationId));
        return;
      }
      const chip = event.target.closest("[data-meal]");
      if (chip) { setMeal(chip.dataset.meal); submitSearch(); return; }
      const recent = event.target.closest("[data-recent-search]");
      if (recent) {
        const item = Storage.getRecentSearches()[Number(recent.dataset.recentSearch)];
        if (item) { location = item.location; setMeal(item.meal); $("restaurant-radius").value = item.radius; submitSearch(); }
        return;
      }
      const action = event.target.closest("[data-restaurant-action]")?.dataset.restaurantAction;
      if (action === "retry") submitSearch();
      if (action === "change-search") showStep(2);
      if (action === "choose-location") showStep(1);
      const mapToggle = event.target.closest("#restaurant-map-toggle");
      if (mapToggle) { mapVisible = !mapVisible; mapToggle.setAttribute("aria-pressed", String(mapVisible)); renderMapPreview([...renderedRestaurants.values()]); return; }
      const menuButton = event.target.closest("[data-restaurant-menu]");
      if (menuButton) root.ROOTS_MENU_REVIEW?.open(renderedRestaurants.get(menuButton.dataset.restaurantMenu), menuButton);
    });
    $("restaurant-meal-form").addEventListener("submit", (event) => { event.preventDefault(); submitSearch(); });
    $("restaurant-change-location").addEventListener("click", () => showStep(1));
    $("restaurant-back-to-meal").addEventListener("click", () => showStep(2));
    $("restaurant-radius").value = Storage.getRadius();
    $("restaurant-radius").addEventListener("change", (event) => Storage.setRadius(event.target.value));
    $("restaurant-clear-searches").addEventListener("click", () => { Storage.clearRecentSearches(); renderMealCollections(); status("Recent searches cleared.", "success"); });
    $("restaurant-save-home").addEventListener("click", () => { if (location) { Storage.saveLocation("home", location, location.label); renderLocationCollections(); status("Home saved.", "success"); } });
    $("restaurant-save-work").addEventListener("click", () => { if (location) { Storage.saveLocation("work", location, location.label); renderLocationCollections(); status("Work saved.", "success"); } });
    $("restaurant-save-favorite").addEventListener("click", () => { if (location) { Storage.saveLocation("favorite", location, location.label); renderLocationCollections(); status("Favorite location saved.", "success"); } });
    root.addEventListener("online", () => status("You're back online.", "success"));
    root.addEventListener("offline", () => status("You're offline. Live restaurant search is unavailable.", "error"));
  }
  function init() {
    if (initialized || !$("restaurantsView")) return;
    initialized = true;
    bind();
    renderLocationCollections();
    renderMealCollections();
    showStep(1);
  }

  root.ROOTS_RESTAURANT_UI = { MEALS, init, selectLocation, setMeal, submitSearch, renderRestaurants, renderError };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
