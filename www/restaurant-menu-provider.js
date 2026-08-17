(function (root) {
  "use strict";

  const SOURCE_TYPES = Object.freeze([
    "official_structured", "official_webpage", "official_allergen_guide",
    "provider_structured", "official_pdf", "provider_webpage",
    "user_image", "user_camera", "user_screenshot", "user_pdf", "user_text", "manual_entry",
  ]);
  const MENU_TYPES = Object.freeze([
    "breakfast", "brunch", "lunch", "dinner", "dessert", "drinks", "kids",
    "catering", "happy_hour", "seasonal", "specials", "all_day", "unknown",
  ]);
  const PRIORITY = Object.freeze({
    official_structured: 1, official_webpage: 2, official_allergen_guide: 3,
    provider_structured: 4, official_pdf: 5, provider_webpage: 6,
    user_image: 7, user_screenshot: 7, user_camera: 8, user_pdf: 8,
    user_text: 9, manual_entry: 10,
  });
  const ERROR_CODES = Object.freeze({
    PROVIDER_UNAVAILABLE: "provider_unavailable",
    REQUIRES_BACKEND_PROXY: "requires_backend_proxy",
    SOURCE_NOT_FOUND: "source_not_found",
    UNSAFE_URL: "unsafe_url",
    INVALID_SOURCE: "invalid_source",
    INVALID_RESPONSE: "invalid_response",
    OFFLINE: "offline",
    NETWORK: "network",
  });

  class MenuProviderError extends Error {
    constructor(code, message, recoverable) {
      super(message || code);
      this.name = "MenuProviderError";
      this.code = code;
      this.recoverable = recoverable !== false;
    }
  }
  class MenuProvider {
    async findMenuSources() { return []; }
    async fetchStructuredMenu() { throw new MenuProviderError(ERROR_CODES.PROVIDER_UNAVAILABLE); }
    async fetchMenuDocument() { throw new MenuProviderError(ERROR_CODES.REQUIRES_BACKEND_PROXY); }
    async fetchMenuText() { throw new MenuProviderError(ERROR_CODES.REQUIRES_BACKEND_PROXY); }
    async getSourceMetadata(source) { return source; }
  }

  const clean = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const iso = (value) => {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  function safeUrl(value) {
    if (!value) return "";
    try {
      const parsed = new URL(String(value));
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch (_) { return ""; }
  }
  function normalizeSource(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = SOURCE_TYPES.includes(raw.type) ? raw.type : "";
    const restaurantId = clean(raw.restaurantId, 160);
    if (!type || !restaurantId) return null;
    const remote = !type.startsWith("user_") && type !== "manual_entry";
    const url = safeUrl(raw.url);
    if (remote && raw.url && !url) return null;
    return {
      id: clean(raw.id, 180) || `menu-source-${restaurantId}-${type}`,
      restaurantId,
      type,
      title: clean(raw.title, 160) || "Menu",
      url,
      provider: clean(raw.provider, 100) || (raw.official ? "restaurant" : "user"),
      language: clean(raw.language, 20) || "unknown",
      menuType: MENU_TYPES.includes(raw.menuType) ? raw.menuType : "unknown",
      retrievedAt: iso(raw.retrievedAt) || new Date().toISOString(),
      sourceUpdatedAt: iso(raw.sourceUpdatedAt),
      official: raw.official === true,
      trusted: raw.trusted === true || raw.official === true,
      userImported: raw.userImported === true || type.startsWith("user_") || type === "manual_entry",
      contentType: clean(raw.contentType, 100),
      status: ["available", "stale", "blocked", "failed"].includes(raw.status) ? raw.status : "available",
    };
  }
  function rankSources(sources) {
    return (Array.isArray(sources) ? sources : [])
      .map(normalizeSource).filter(Boolean)
      .sort((a, b) => (PRIORITY[a.type] || 99) - (PRIORITY[b.type] || 99)
        || (Date.parse(b.sourceUpdatedAt || b.retrievedAt) - Date.parse(a.sourceUpdatedAt || a.retrievedAt)));
  }
  function normalizeError(error) {
    if (error instanceof MenuProviderError) return error;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return new MenuProviderError(ERROR_CODES.OFFLINE, "Menu retrieval needs an internet connection.");
    }
    return new MenuProviderError(ERROR_CODES.NETWORK, "The menu source could not be reached.");
  }

  let provider = new MenuProvider();
  async function findSources(restaurant) {
    if (!restaurant?.id) throw new MenuProviderError(ERROR_CODES.INVALID_SOURCE, "Restaurant details are incomplete.", false);
    try { return rankSources(await provider.findMenuSources(restaurant)); }
    catch (error) { throw normalizeError(error); }
  }
  async function fetchSource(source) {
    const normalized = normalizeSource(source);
    if (!normalized) throw new MenuProviderError(ERROR_CODES.INVALID_SOURCE, "This menu source is not valid.", false);
    try {
      if (normalized.type.endsWith("_structured")) return await provider.fetchStructuredMenu(normalized);
      if (normalized.type.endsWith("_webpage")) return await provider.fetchMenuText(normalized);
      if (["official_pdf", "official_allergen_guide"].includes(normalized.type)) return await provider.fetchMenuDocument(normalized);
      throw new MenuProviderError(ERROR_CODES.INVALID_SOURCE, "Use the matching local import action for this source.", false);
    } catch (error) { throw normalizeError(error); }
  }

  root.ROOTS_MENU_PROVIDER = {
    MenuProvider, MenuProviderError, ERROR_CODES, SOURCE_TYPES, MENU_TYPES, PRIORITY,
    safeUrl, normalizeSource, rankSources, normalizeError, findSources, fetchSource,
    setProvider(next) {
      const methods = ["findMenuSources", "fetchStructuredMenu", "fetchMenuDocument", "fetchMenuText", "getSourceMetadata"];
      if (!next || !methods.every((name) => typeof next[name] === "function")) throw new TypeError("Menu provider does not satisfy the ROOTS menu contract.");
      provider = next;
    },
    getProvider: () => provider,
    resetProvider: () => { provider = new MenuProvider(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
