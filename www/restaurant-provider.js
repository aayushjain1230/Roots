(function (root) {
  "use strict";

  const ERROR_CODES = Object.freeze({
    PROVIDER_UNAVAILABLE: "provider_unavailable",
    OFFLINE: "offline",
    TIMEOUT: "timeout",
    NETWORK: "network",
    INVALID_RESPONSE: "invalid_response",
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
    return {
      id, name,
      cuisine: String(value.cuisine || "").trim().slice(0, 100),
      image,
      distanceMiles: Number.isFinite(distanceMiles) && distanceMiles >= 0 ? distanceMiles : null,
      openStatus: ["open", "closed", "unknown"].includes(value.openStatus) ? value.openStatus : "unknown",
      priceRange,
      rating: Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null,
      menuAvailable: value.menuAvailable === true,
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
    if (typeof navigator !== "undefined" && navigator.onLine === false) return new RestaurantProviderError(ERROR_CODES.OFFLINE);
    return new RestaurantProviderError(ERROR_CODES.NETWORK);
  }

  let provider = new UnconfiguredRestaurantProvider();
  root.ROOTS_RESTAURANT_PROVIDER = {
    RestaurantProvider,
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
    validateLocation,
    normalizeRestaurant,
    withTimeout,
    normalizeError,
  };
})(typeof window !== "undefined" ? window : globalThis);
