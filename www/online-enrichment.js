(function (root) {
  "use strict";
  let provider = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value) => String(value || "").trim();
  async function defaultProvider(scan, options) {
    const prior = scan?.product?.sourceMetadata?.priorBarcodeEvidence;
    const barcode = clean(scan?.product?.barcode || prior?.barcode);
    if (!barcode || !root.BIJ_FOODFACTS?.lookup) return null;
    return root.BIJ_FOODFACTS.lookup(barcode, { signal: options?.signal });
  }
  async function enrich(scan, options) {
    if (!scan?.evaluation || root.ROOTS_CONNECTIVITY?.get?.().online !== true) return { scan, changed: false, reason: "offline" };
    const task = root.ROOTS_PERFORMANCE?.startTask?.("online_enrichment", { source: scan.product?.sourceType || "unknown" });
    try {
      const product = await (provider || defaultProvider)(clone(scan), options || {});
      if (!product?.found || !clean(product.rawIngredientText)) return { scan, changed: false, reason: "no_enrichment_source" };
      const physicalText = scan.product?.ingredientText?.edited || scan.product?.ingredientText?.translated || scan.product?.ingredientText?.original;
      if (!clean(physicalText)) return { scan, changed: false, reason: "no_physical_label" };
      const source = {
        sourceType: "label_photo", barcode: product.code, productName: scan.product.productName || product.name, brand: scan.product.brand || product.brand,
        originalLanguage: scan.product.originalLanguage || "en", translatedLanguage: scan.product.translatedLanguage || "en",
        ingredientTextOriginal: scan.product.ingredientText.original, ingredientTextTranslated: scan.product.ingredientText.translated,
        originalText: scan.product.rawText.original, translatedText: scan.product.rawText.translated,
        allergenTextOriginal: product.allergenText || "", tracesText: product.tracesText || "", certifications: product.certifications || [],
        extractionWarnings: [...(scan.product.warnings || []), { code: "online_enrichment_applied", message: "ROOTS added current structured product evidence after the local label result.", action: "Review Evidence" }],
        sourceMetadata: { provider: "user_scan", verificationScope: "physical_label_plus_structured_product_data", offline: false, priorBarcodeEvidence: { barcode: product.code, productName: product.name, brand: product.brand, ingredientText: product.rawIngredientText, provider: "open_food_facts", sourceUpdatedAt: product.sourceUpdatedAt || product.verifiedAt } },
      };
      const enriched = root.ROOTS_SCAN_PIPELINE.evaluateSource(source, scan.storedProfile || scan.profile);
      enriched.enrichment = { applied: true, provider: "open_food_facts", enrichedAt: new Date().toISOString(), priorDecision: scan.decision?.status || null, decisionChanged: enriched.decision?.status !== scan.decision?.status };
      try { root.dispatchEvent?.(new root.CustomEvent("roots:scanenriched", { detail: { decisionChanged: enriched.enrichment.decisionChanged } })); } catch (_) { /* optional event */ }
      return { scan: enriched, changed: true, decisionChanged: enriched.enrichment.decisionChanged };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { scan, changed: false, reason: "provider_failed" };
    } finally { root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "complete" }); }
  }
  root.ROOTS_ONLINE_ENRICHMENT = Object.freeze({ enrich, setProvider(next) { if (next != null && typeof next !== "function") throw new TypeError("Enrichment provider must be a function."); provider = next; }, resetProvider() { provider = null; } });
})(typeof window !== "undefined" ? window : globalThis);
