(function (root) {
  "use strict";
  const P = root.ROOTS_RESTAURANT_PROVIDER, S = root.ROOTS_RESTAURANT_STORAGE;
  if (!P || !S) throw new Error("Restaurant provider and storage must load before restaurant-search.js");

  const GEO_TIMEOUT = 10000, SEARCH_TIMEOUT = 12000;
  let activeController = null;
  const cleanMeal = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  function activeProvider() {
    const provider = P.getProvider();
    if (provider?.constructor?.name === "UnconfiguredRestaurantProvider" && typeof P.installDefaultProvider === "function") return P.installDefaultProvider();
    return provider;
  }

  function geolocationError(error) {
    const code = error?.code;
    return {
      code: error?.restricted ? "permission_restricted" : code === 1 ? "permission_denied" : code === 2 ? "location_unavailable" : code === 3 ? "location_timeout" : "location_unavailable",
      message: error?.restricted ? "Location access is restricted on this device. Enter an address instead." : code === 1 ? "Location access was denied. Enter an address instead." : code === 3 ? "Location took too long. Try again or enter an address." : "Your location is unavailable. Enter an address instead.",
    };
  }
  function getCurrentLocation(options) {
    const geolocation = options?.geolocation || (typeof navigator !== "undefined" ? navigator.geolocation : null);
    if (!geolocation) return Promise.reject({ code: "location_unsupported", message: "Location is not available on this device. Enter an address instead." });
    return new Promise((resolve, reject) => {
      geolocation.getCurrentPosition(
        (position) => {
          const location = P.validateLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: "Current location" });
          if (!location) { reject({ code: "location_unavailable", message: "ROOTS could not read this location. Enter an address instead." }); return; }
          S.addRecentLocation(location);
          resolve(location);
        },
        (error) => reject(geolocationError(error)),
        { enableHighAccuracy: false, timeout: options?.timeoutMs || GEO_TIMEOUT, maximumAge: 5 * 60 * 1000 }
      );
    });
  }
  async function autocomplete(query, options) {
    const text = String(query || "").trim().slice(0, 180);
    if (text.length < 3) return [];
    const result = await P.withTimeout(activeProvider().autocomplete({ query: text, signal: options?.signal }), { timeoutMs: options?.timeoutMs || 8000, signal: options?.signal });
    return (Array.isArray(result) ? result : []).map((item) => ({ ...P.validateLocation(item), id: String(item.id || ""), label: String(item.label || "").slice(0, 180) })).filter((item) => item.latitude != null && item.label);
  }

  async function resolveAddress(query, options) {
    const text = String(query || "").trim().slice(0, 180);
    if (text.length < 3) throw { code: "location_required", message: "Enter an address, city, state, or ZIP code." };
    const items = await autocomplete(text, options);
    const first = items[0] ? P.validateLocation(items[0]) : null;
    if (!first) throw { code: "location_not_found", message: "ROOTS could not find that location. Try adding a city and state." };
    S.addRecentLocation(first);
    return first;
  }

  async function searchRestaurants(input, options) {
    const meal = cleanMeal(input?.meal), location = P.validateLocation(input?.location), radius = S.setRadius(input?.radius);
    if (!meal) throw { code: "meal_required", message: "Choose or enter what you would like to eat." };
    if (!location) throw { code: "location_required", message: "Choose a location before searching." };
    if (root.ROOTS_CONNECTIVITY?.get?.().offline === true) {
      const cached = S.getCachedResults(meal, location, radius, { allowStale: true });
      if (cached) return { ...cached, cached: true };
      throw { code: "offline", message: "Restaurant search needs internet. Reconnect and try again." };
    }
    activeController?.abort();
    activeController = new AbortController();
    const signal = options?.signal || activeController.signal;
    try {
      const response = await P.withTimeout(activeProvider().searchRestaurants({ meal, location, radius, signal }), { timeoutMs: options?.timeoutMs || SEARCH_TIMEOUT, signal });
      const raw = Array.isArray(response) ? response : response?.restaurants;
      if (!Array.isArray(raw)) throw new P.RestaurantProviderError(P.ERROR_CODES.INVALID_RESPONSE);
      const restaurants = raw.map(P.normalizeRestaurant).filter(Boolean);
      S.addRecentLocation(location);
      S.addRecentSearch(meal, location, radius);
      const record = S.cacheResults(meal, location, radius, restaurants, { provider: String(response?.provider || ""), resultCount: restaurants.length, ...(response?.metadata || {}) });
      root.ROOTS_METRICS?.track?.("restaurant_searched", { outcome: restaurants.length ? "results" : "empty" });
      root.ROOTS_LAUNCH?.mark?.("first_restaurant_search");
      return { ...record, cached: false };
    } finally {
      if (signal === activeController?.signal) activeController = null;
    }
  }
  function cancel() { activeController?.abort(); activeController = null; }

  root.ROOTS_RESTAURANT_SEARCH = { cleanMeal, geolocationError, getCurrentLocation, autocomplete, resolveAddress, searchRestaurants, cancel };
})(typeof window !== "undefined" ? window : globalThis);
