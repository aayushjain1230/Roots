/* ============================================================
   ROOTS — Open Food Facts product lookup (barcodes)

   Looks a barcode up in the free Open Food Facts database (no key, no quota)
   to get a product's ingredient list — far faster and more reliable than OCR
   for packaged goods, and it uses ZERO Gemini quota.

   Verified results are cached in localStorage (with a verifiedAt date) so
   repeat scans are instant and work offline.

   Exposes window.BIJ_FOODFACTS = { lookup(barcode) -> Promise<product>, getCached }.
   product = { found, code, name, brand, image, lang, english, ingredients[], verifiedAt, fromCache }
   ============================================================ */
(function () {
  "use strict";

  const CACHE_KEY = "bij-product-cache-v1";
  const CACHE_SCHEMA_VERSION = 2;
  const CACHE_MAX = 300;
  const CACHE_FRESH_MS = 30 * 24 * 60 * 60 * 1000;
  const FIELDS = "product_name,brands,ingredients_text,ingredients_text_en,ingredients,lang,allergens,allergens_tags,traces,traces_tags,labels_tags,countries_tags,last_modified_t,image_front_url,image_front_small_url,image_url";
  const endpoint = (code) =>
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (_) { /* quota/full */ }
  }
  function getCached(code) {
    const c = readCache();
    const product = c[String(code)] || null;
    if (!product) return null;
    const ageMs = Math.max(0, Date.now() - Date.parse(product.verifiedAt || 0));
    return { ...product, cacheAgeMs: ageMs, cacheFreshness: !Date.parse(product.verifiedAt || 0) || ageMs > CACHE_FRESH_MS ? "stale" : "current", needsLabelVerification: true };
  }
  function putCached(code, product) {
    const c = readCache();
    c[String(code)] = product;
    const codes = Object.keys(c);
    if (codes.length > CACHE_MAX) {
      codes.sort((a, b) => String(c[a].verifiedAt || "").localeCompare(String(c[b].verifiedAt || "")));
      for (let i = 0; i < codes.length - CACHE_MAX; i++) delete c[codes[i]];
    }
    writeCache(c);
  }

  // Preserve raw text and parenthetical subingredients. The Phase 2B parser is
  // the only authoritative parser; this adapter only selects source evidence.
  function pickIngredients(p) {
    if (p.ingredients_text_en && p.ingredients_text_en.trim()) {
      return {
        raw: String(p.ingredients_text_en).trim(),
        originalRaw: String(p.ingredients_text || p.ingredients_text_en).trim(),
        english: true,
      };
    }
    return {
      raw: String(p.ingredients_text || "").trim(),
      originalRaw: String(p.ingredients_text || "").trim(),
      english: p.lang === "en",
    };
  }

  function buildProduct(code, p) {
    const picked = pickIngredients(p);
    return {
      found: true,
      code: String(code),
      name: p.product_name || "Unknown product",
      brand: (p.brands || "").split(",")[0].trim(),
      image: p.image_front_url || p.image_front_small_url || p.image_url || "",
      lang: p.lang || "",
      english: picked.english,
      rawIngredientText: picked.originalRaw,
      translatedIngredientText: picked.english ? picked.raw : "",
      ingredients: picked.raw ? [picked.raw] : [],
      structuredIngredients: Array.isArray(p.ingredients) ? p.ingredients : [],
      allergenText: p.allergens || (p.allergens_tags || []).join(", "),
      tracesText: p.traces || (p.traces_tags || []).join(", "),
      certifications: Array.isArray(p.labels_tags) ? p.labels_tags : [],
      region: Array.isArray(p.countries_tags) && p.countries_tags[0] ? p.countries_tags[0] : "US",
      sourceUpdatedAt: p.last_modified_t ? new Date(Number(p.last_modified_t) * 1000).toISOString() : "",
      productVersion: p.last_modified_t ? `off-${p.last_modified_t}` : `off-observed-${Date.now()}`,
      sourceMetadata: { type: "structured_product_database", provider: "open_food_facts", retrievedAt: new Date().toISOString(), sourceUpdatedAt: p.last_modified_t ? new Date(Number(p.last_modified_t) * 1000).toISOString() : "" },
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      verifiedAt: new Date().toISOString(),
    };
  }

  // Open Food Facts stores codes as EAN-13, but many US products scan as 12-digit
  // UPC-A. Try the code as decoded, then its zero-padded/trimmed counterpart, before
  // giving up — otherwise a real product can 404 purely on a digit-count mismatch.
  function barcodeVariants(code) {
    const digits = String(code).replace(/\D/g, "");
    const variants = [digits];
    if (digits.length === 12) variants.push("0" + digits);
    if (digits.length === 13 && digits.startsWith("0")) variants.push(digits.slice(1));
    return variants;
  }

  async function fetchProduct(code, signal) {
    const url = endpoint(code);
    const response = window.ROOTS_NETWORK
      ? await window.ROOTS_NETWORK.request(url, {
        headers: { Accept: "application/json" }, signal, timeoutMs: 12000, retries: 1,
        dedupeKey: `open-food-facts:${code}`, classification: "barcode_lookup",
      })
      : await fetch(url, { headers: { Accept: "application/json" }, signal }).then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json() }));
    if (!response.ok) return { ok: false, status: response.status };
    const data = response.data;
    if (!data || data.status !== 1 || !data.product) return { ok: false, notFound: true };
    return { ok: true, product: data.product };
  }

  async function lookup(code, options) {
    options = options || {};
    code = String(code || "").trim();
    if (!code) throw new Error("No barcode detected.");
    const cached = getCached(code);

    if (window.ROOTS_CONNECTIVITY?.get?.().offline === true) {
      if (cached) return Object.assign({}, cached, { fromCache: true, offline: true });
      throw Object.assign(new Error("This barcode is not cached on this device. Scan the ingredient label or enter ingredients manually."), { code: "BARCODE_OFFLINE_MISS", alternativeActions: ["scan_label", "manual_entry"] });
    }

    let fetchFailure = null;
    let httpStatus = null;
    for (const variant of barcodeVariants(code)) {
      let result;
      try {
        result = await fetchProduct(variant, options.signal);
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        fetchFailure = error;
        continue;
      }
      if (!result.ok) {
        if (result.status) httpStatus = result.status;
        continue;
      }
      const product = buildProduct(code, result.product); // keep the code as originally scanned
      if (product.rawIngredientText) putCached(code, product); // only cache useful results
      return product;
    }

    if (cached) return Object.assign({}, cached, { fromCache: true, cacheFallbackReason: fetchFailure ? "lookup_failed" : httpStatus ? "provider_http_error" : "not_found" });
    if (fetchFailure) {
      const mapped = window.ROOTS_ERRORS?.classifyFetchError?.(fetchFailure) || fetchFailure.code || "API_UNREACHABLE";
      throw (window.ROOTS_ERRORS?.create?.(mapped, null, { stage: "barcode_lookup", provider: "open_food_facts", originalName: fetchFailure?.name || "Error" }) || Object.assign(fetchFailure, { code: mapped }));
    }
    if (httpStatus) {
      const mapped = window.ROOTS_ERRORS?.fromHttpStatus?.(httpStatus) || "HTTP_SERVER_ERROR";
      throw (window.ROOTS_ERRORS?.create?.(mapped, null, { stage: "barcode_lookup", provider: "open_food_facts", httpStatus }) || Object.assign(new Error("Open Food Facts lookup failed."), { code: mapped, debugMetadata: { httpStatus } }));
    }
    return { found: false, code };
  }

  function clearCache() { try { localStorage.removeItem(CACHE_KEY); return true; } catch (_) { return false; } }
  function getCacheStats() { const values = Object.values(readCache()); return { count: values.length, stale: values.filter((item) => Date.now() - Date.parse(item.verifiedAt || 0) > CACHE_FRESH_MS).length, max: CACHE_MAX }; }
  window.BIJ_FOODFACTS = { lookup, getCached, clearCache, getCacheStats, CACHE_SCHEMA_VERSION };
})();
