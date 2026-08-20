(function (root) {
  "use strict";

  const ERROR_CODES = Object.freeze({
    PROVIDER_UNAVAILABLE: "provider_unavailable",
    OFFLINE: "offline",
    TIMEOUT: "timeout",
    REQUEST_FAILED: "request_failed",
    INVALID_RESPONSE: "invalid_response",
    API_NOT_CONFIGURED: "api_not_configured",
    API_HTTP: "api_http",
    CANCELLED: "cancelled",
  });

  class RestaurantProviderError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = "RestaurantProviderError";
      this.code = code;
    }
  }

  class RestaurantProvider {
    async searchRestaurants() { throw new RestaurantProviderError(ERROR_CODES.PROVIDER_UNAVAILABLE); }
    async reverseGeocode() { throw new RestaurantProviderError(ERROR_CODES.PROVIDER_UNAVAILABLE); }
    async autocomplete() { throw new RestaurantProviderError(ERROR_CODES.PROVIDER_UNAVAILABLE); }
  }

  class UnconfiguredRestaurantProvider extends RestaurantProvider {}

  function validateLocation(value) {
    if (!value || typeof value !== "object") return null;
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    const label = String(value.label || "").trim().slice(0, 180);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude, label: label || "Selected location" };
  }

  function normalizeRestaurant(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.id || "").trim();
    const name = String(value.name || "").trim().slice(0, 160);
    if (!id || !name) return null;
    const image = /^https:\/\//i.test(String(value.image || "")) ? String(value.image) : "";
    const distanceMiles = Number(value.distanceMiles);
    const rating = Number(value.rating);
    const priceRange = /^\${1,4}$/.test(String(value.priceRange || "")) ? String(value.priceRange) : "";
    const coordinates = value.coordinates && typeof value.coordinates === "object" ? {
      latitude: Number(value.coordinates.latitude), longitude: Number(value.coordinates.longitude),
    } : null;
    const safeWebsite = (() => { try { const parsed = new URL(String(value.website || "")); return parsed.protocol === "https:" ? parsed.href : ""; } catch (_) { return ""; } })();
    const tags = Array.isArray(value.dietaryTags) ? value.dietaryTags.map((item) => String(item || "").trim().slice(0, 60)).filter(Boolean).slice(0, 12) : [];
    return {
      id, name,
      provider: String(value.provider || "").trim().slice(0, 60),
      providerEntityType: String(value.providerEntityType || "").trim().slice(0, 40),
      providerEntityId: String(value.providerEntityId || "").trim().slice(0, 120),
      brand: String(value.brand || "").trim().slice(0, 120),
      cuisine: String(value.cuisine || "").trim().slice(0, 100),
      image,
      coordinates: coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude) ? coordinates : null,
      address: String(value.address || "").trim().slice(0, 220),
      website: safeWebsite,
      phone: String(value.phone || "").trim().slice(0, 80),
      openingHours: String(value.openingHours || "").trim().slice(0, 220),
      dietaryTags: tags,
      discoveredAt: String(value.discoveredAt || "").trim().slice(0, 40),
      distanceMiles: Number.isFinite(distanceMiles) && distanceMiles >= 0 ? distanceMiles : null,
      openStatus: ["open", "closed", "unknown"].includes(value.openStatus) ? value.openStatus : "unknown",
      priceRange,
      rating: Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null,
      menuAvailable: value.menuAvailable === true || !!safeWebsite,
      providerMetadata: value.providerMetadata && typeof value.providerMetadata === "object" ? value.providerMetadata : {},
    };
  }

  function withTimeout(promise, options) {
    const timeoutMs = Math.max(1000, Number(options?.timeoutMs) || 10000);
    const signal = options?.signal;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abort);
        callback(value);
      };
      const abort = () => finish(reject, new RestaurantProviderError(ERROR_CODES.CANCELLED));
      const timer = setTimeout(() => finish(reject, new RestaurantProviderError(ERROR_CODES.TIMEOUT)), timeoutMs);
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener?.("abort", abort, { once: true });
      Promise.resolve(promise).then((value) => finish(resolve, value), (error) => finish(reject, normalizeError(error)));
    });
  }

  function normalizeError(error) {
    if (error instanceof RestaurantProviderError) return error;
    if (error?.name === "AbortError") return new RestaurantProviderError(ERROR_CODES.CANCELLED);
    if (root.ROOTS_CONNECTIVITY?.get?.().offline === true) return new RestaurantProviderError(ERROR_CODES.OFFLINE);
    if (error?.code === "REQUEST_TIMEOUT" || error?.code === "NETWORK_TIMEOUT") return new RestaurantProviderError(ERROR_CODES.TIMEOUT, error.message);
    if (error?.code === "API_NOT_CONFIGURED") return new RestaurantProviderError(ERROR_CODES.API_NOT_CONFIGURED, error.message);
    if (error?.code === "API_HTTP") return new RestaurantProviderError(ERROR_CODES.API_HTTP, error.message);
    if (error?.code === "INVALID_RESPONSE" || error?.code === "MALFORMED_JSON") return new RestaurantProviderError(ERROR_CODES.INVALID_RESPONSE, error.message);
    return new RestaurantProviderError(ERROR_CODES.REQUEST_FAILED, error?.message || "Restaurant request failed.");
  }

  function endpoint(path) {
    const base = root.ROOTS_RUNTIME_CONFIG?.API_BASE_URL || "";
    if (!base) throw new RestaurantProviderError(ERROR_CODES.API_NOT_CONFIGURED, "Restaurant search is not configured for this build.");
    return `${base}${path}`;
  }
  function mapHttpError(response, stage) {
    const detail = response?.data?.detail;
    const message = typeof detail === "string" ? detail : detail?.message || "Restaurant service request failed.";
    const error = new RestaurantProviderError(ERROR_CODES.API_HTTP, message);
    error.status = response?.status;
    error.stage = stage;
    return error;
  }
  class BackendRestaurantProvider extends RestaurantProvider {
    async searchRestaurants(input) {
      const location = validateLocation(input?.location);
      const response = await root.ROOTS_NETWORK.request(endpoint("/v1/restaurants/discover"), {
        method: "POST", classification: "restaurant_discovery", timeoutMs: 18000, retries: 1, signal: input?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal: input?.meal || "anything", location, radiusMiles: input?.radius || 5 }),
      });
      if (!response.ok) throw mapHttpError(response, "restaurant_discovery");
      return { provider: response.data?.provider || "roots_backend", restaurants: response.data?.restaurants || [], metadata: response.data?.metadata || {} };
    }
    async autocomplete(input) {
      const query = encodeURIComponent(String(input?.query || "").trim());
      const response = await root.ROOTS_NETWORK.request(endpoint(`/v1/restaurants/geocode?q=${query}`), {
        method: "GET", classification: "restaurant_geocode", timeoutMs: 10000, retries: 1, signal: input?.signal,
      });
      if (!response.ok) throw mapHttpError(response, "restaurant_geocode");
      return response.data?.results || [];
    }
    async reverseGeocode(input) {
      const location = validateLocation(input?.location || input);
      return location || null;
    }
  }
  let provider = new UnconfiguredRestaurantProvider();
  root.ROOTS_RESTAURANT_PROVIDER = {
    RestaurantProvider,
    BackendRestaurantProvider,
    RestaurantProviderError,
    ERROR_CODES,
    setProvider(next) {
      if (!next || !["searchRestaurants", "reverseGeocode", "autocomplete"].every((method) => typeof next[method] === "function")) {
        throw new TypeError("Restaurant provider must implement searchRestaurants, reverseGeocode, and autocomplete.");
      }
      provider = next;
    },
    getProvider: () => provider,
    resetProvider: () => { provider = new UnconfiguredRestaurantProvider(); },
    installDefaultProvider() { if (root.ROOTS_RUNTIME_CONFIG?.API_BASE_URL && root.ROOTS_NETWORK) provider = new BackendRestaurantProvider(); return provider; },
    validateLocation,
    normalizeRestaurant,
    withTimeout,
    normalizeError,
  };
  if (root.ROOTS_RUNTIME_CONFIG?.API_BASE_URL && root.ROOTS_NETWORK) root.ROOTS_RESTAURANT_PROVIDER.installDefaultProvider();
})(typeof window !== "undefined" ? window : globalThis);
