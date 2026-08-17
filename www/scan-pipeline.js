(function (root) {
  "use strict";

  const HISTORY_SCHEMA_VERSION = 3;
  const INSUFFICIENT_DATA = "INSUFFICIENT_DATA";
  const LEGACY_STATUS = {
    JAIN: "SAFE", jain: "SAFE",
    NON_JAIN: "AVOID", nonJain: "AVOID",
    ALLERGEN: "AVOID", allergen: "AVOID",
    UNCERTAIN: "CAUTION", uncertain: "CAUTION",
  };
  let current = null;
  let previousBarcode = null;

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const id = () => `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const warning = (code, message, action) => ({ code, message, action });

  function activeProfile() {
    const api = root.ROOTS_PROFILE;
    return api.getActiveProfile() || api.createDefaultProfile();
  }

  function warningCodes(warnings) {
    return new Set((warnings || []).map((item) => typeof item === "string" ? item : item.code));
  }

  function parseText(text) {
    return root.ROOTS_DIETARY_ENGINE.parseIngredientText(text || "");
  }

  function mergeStatements(primary, secondary) {
    const keys = ["contains", "mayContain", "sharedEquipment", "sharedFacility"];
    const out = {};
    keys.forEach((key) => {
      const seen = new Set();
      out[key] = [...(primary[key] || []), ...(secondary[key] || [])].filter((item) => {
        const normalized = clean(item.normalizedName || item.name || item.rawName).toLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
    });
    return out;
  }

  function buildParsedProduct(source) {
    const original = clean(source.ingredientTextOriginal || source.rawIngredientText || "");
    const translated = clean(source.ingredientTextTranslated || "");
    const originalEvidence = clean(source.originalText) || original;
    const translatedEvidence = clean(source.translatedText) || translated;
    const analysisText = clean(source.editedText) || translated || original;
    const parsed = parseText(analysisText);
    const originalStatements = root.ROOTS_DIETARY_ENGINE.parseAllergenStatements(
      [source.allergenTextOriginal, source.tracesText, original].filter(Boolean).join("\n")
    );
    const translatedStatements = root.ROOTS_DIETARY_ENGINE.parseAllergenStatements(
      [source.allergenTextTranslated, translated].filter(Boolean).join("\n")
    );
    const statements = mergeStatements(
      mergeStatements(parsed, originalStatements),
      translatedStatements
    );
    const warnings = clone(source.extractionWarnings || source.warnings || []);
    if (!analysisText || !parsed.ingredients.length) {
      warnings.push(warning("missing_ingredient_text", "We could not find a complete ingredient list.", "Scan Ingredient Label"));
    }
    if ((analysisText.match(/\(/g) || []).length !== (analysisText.match(/\)/g) || []).length) {
      warnings.push(warning("unmatched_parentheses", "Part of the ingredient list may be incomplete.", "Review Ingredients"));
    }
    return {
      schemaVersion: 1,
      sourceType: source.sourceType,
      productName: clean(source.productName),
      brand: clean(source.brand),
      barcode: clean(source.barcode),
      image: clean(source.image),
      region: clean(source.region) || "US",
      originalLanguage: clean(source.originalLanguage || source.ingredientsLanguage) || "en",
      translatedLanguage: clean(source.translatedLanguage) || (translated ? "en" : clean(source.originalLanguage || source.ingredientsLanguage) || "en"),
      rawText: { original: originalEvidence, translated: translatedEvidence, edited: clean(source.editedText) || null },
      ingredientText: { original, translated, edited: clean(source.editedText) || null },
      ingredients: parsed.ingredients,
      allergenStatements: statements,
      contains: statements.contains,
      mayContain: statements.mayContain,
      sharedEquipment: statements.sharedEquipment,
      sharedFacility: statements.sharedFacility,
      certifications: clone(source.certifications || []),
      warnings,
      sourceMetadata: clone(source.sourceMetadata || {}),
    };
  }

  function evaluateSource(source, profile) {
    const usedProfile = clone(profile || activeProfile());
    const parsedProduct = buildParsedProduct(source);
    if (!parsedProduct.ingredients.length) {
      const output = {
        state: INSUFFICIENT_DATA,
        verdict: null,
        product: parsedProduct,
        profile: usedProfile,
        evaluation: null,
        warnings: parsedProduct.warnings,
      };
      current = clone(output);
      return output;
    }
    const evaluation = root.ROOTS_DIETARY_ENGINE.evaluateParsedProduct(parsedProduct, usedProfile);
    const hasRestrictions = (usedProfile.religiousDiets || []).some((item) => item.enabled) ||
      (usedProfile.lifestyleDiets || []).some((item) => item.enabled) ||
      (usedProfile.allergies || []).length || (usedProfile.customRules || []).length;
    if (hasRestrictions) {
      const unresolved = evaluation.safeItems.filter((item) => !item.matchedIngredientId);
      if (unresolved.length) {
        evaluation.safeItems = evaluation.safeItems.filter((item) => item.matchedIngredientId);
        unresolved.forEach((item) => {
          const uncertain = clone(item);
          uncertain.status = "CAUTION";
          uncertain.evidenceLevel = "needs_confirmation";
          uncertain.reasons = [{
            id: `unresolved-${item.normalizedName}`,
            category: "source_dependent",
            severity: "caution",
            label: `${item.displayName} could not be matched to the ingredient knowledge base.`,
            evidenceType: "direct_ingredient",
            evidenceLevel: "needs_confirmation",
          }];
          evaluation.cautionItems.push(uncertain);
          evaluation.unresolvedItems.push(uncertain);
        });
        if (evaluation.verdict === "SAFE") evaluation.verdict = "CAUTION";
        evaluation.summaryReasons = [
          ...unresolved.map((item) => ({
            id: `unresolved-${item.normalizedName}`,
            category: "source_dependent",
            severity: "caution",
            label: `${item.displayName} could not be matched to the ingredient knowledge base.`,
            evidenceType: "direct_ingredient",
            evidenceLevel: "needs_confirmation",
          })),
          ...evaluation.summaryReasons.filter((item) => item.id !== "no-conflicts"),
        ].slice(0, 5);
      }
    }
    const serious = warningCodes(parsedProduct.warnings);
    if (evaluation.verdict === "SAFE" &&
        ["incomplete_label", "blurry_image", "translation_uncertain", "low_ocr_quality", "unmatched_parentheses"]
          .some((code) => serious.has(code))) {
      evaluation.verdict = "CAUTION";
      evaluation.summaryReasons.unshift({
        id: "incomplete-evidence",
        category: "source_dependent",
        severity: "caution",
        label: "Some label information needs confirmation.",
        evidenceType: "direct_ingredient",
        evidenceLevel: "needs_confirmation",
      });
    }
    const output = {
      state: "EVALUATED",
      verdict: evaluation.verdict,
      product: parsedProduct,
      profile: usedProfile,
      evaluation,
      warnings: parsedProduct.warnings,
    };
    current = clone(output);
    if (parsedProduct.sourceType === "barcode") previousBarcode = clone(parsedProduct);
    else if (parsedProduct.sourceType === "label_photo") previousBarcode = null;
    return output;
  }

  function sourceFromBarcode(product, translatedEntries) {
    const original = clean(product.rawIngredientText || (product.ingredients || []).join(", "));
    const translated = translatedEntries && translatedEntries.length
      ? translatedEntries.map((item) => item.name).filter(Boolean).join(", ")
      : clean(product.translatedIngredientText || (product.english ? original : ""));
    return {
      sourceType: "barcode",
      barcode: product.code || product.barcode,
      productName: product.name || product.productName,
      brand: product.brand,
      image: product.image,
      region: product.region || "US",
      originalLanguage: product.lang || product.ingredientsLanguage || "en",
      translatedLanguage: translated ? "en" : product.lang || "en",
      rawIngredientText: original,
      ingredientTextOriginal: original,
      ingredientTextTranslated: translated,
      originalText: original,
      translatedText: translated,
      allergenTextOriginal: product.allergenText || "",
      tracesText: product.tracesText || "",
      certifications: product.certifications || [],
      warnings: product.warnings || [],
      sourceMetadata: {
        provider: "open_food_facts",
        sourceUpdatedAt: product.sourceUpdatedAt || product.verifiedAt || "",
        fromCache: !!product.fromCache,
        structuredIngredients: clone(product.structuredIngredients || []),
      },
    };
  }

  function sourceFromOcr(ocr) {
    const ocrIngredientText = ocr.ingredientTextTranslated || ocr.ingredientTextOriginal || "";
    const warnings = clone(ocr.extractionWarnings || []);
    if (previousBarcode?.ingredientText && ocrIngredientText) {
      const stored = clean(previousBarcode.ingredientText.translated || previousBarcode.ingredientText.original).toLowerCase();
      const physical = clean(ocrIngredientText).toLowerCase();
      if (stored && physical && stored !== physical) warnings.push(warning(
        "source_conflict",
        "This label differs from the stored product information. The current label is being used.",
        "Review Ingredients"
      ));
    }
    return {
      sourceType: "label_photo",
      productName: ocr.productName || "",
      brand: ocr.brand || "",
      originalLanguage: ocr.originalLanguage || ocr.detectedLanguage || "en",
      translatedLanguage: ocr.translatedLanguage || "en",
      ingredientTextOriginal: ocr.ingredientTextOriginal || ocr.originalText || "",
      ingredientTextTranslated: ocr.ingredientTextTranslated || ocr.translatedText || "",
      originalText: ocr.originalText || ocr.ingredientTextOriginal || "",
      translatedText: ocr.translatedText || ocr.ingredientTextTranslated || "",
      allergenTextOriginal: ocr.allergenTextOriginal || "",
      allergenTextTranslated: ocr.allergenTextTranslated || "",
      editedText: ocr.editedText || "",
      extractionWarnings: warnings,
      sourceMetadata: {
        provider: ocr.extractionProvider || "gemini",
        extractionVersion: ocr.extractionVersion || 1,
      },
    };
  }

  function makeHistoryRecord(scan) {
    const product = scan.product || {};
    const evaluation = scan.evaluation;
    return {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      id: id(),
      scannedAt: evaluation?.evaluatedAt || new Date().toISOString(),
      product: {
        name: product.productName || "",
        brand: product.brand || "",
        barcode: product.barcode || "",
        image: product.image || "",
        region: product.region || "US",
      },
      source: {
        type: product.sourceType || "",
        provider: product.sourceMetadata?.provider || "",
        originalLanguage: product.originalLanguage || "",
        translatedLanguage: product.translatedLanguage || "",
        editedByUser: !!product.rawText?.edited,
      },
      profile: {
        id: scan.profile?.id || "default",
        name: scan.profile?.name || "My Profile",
        snapshot: clone(scan.profile || {}),
      },
      evaluation: evaluation ? clone(evaluation) : null,
      state: scan.state,
      text: clone(product.rawText || { original: "", translated: "", edited: null }),
      ingredientText: clone(product.ingredientText || { original: "", translated: "", edited: null }),
      parsedProduct: clone(product),
      warnings: clone(scan.warnings || []),
    };
  }

  function legacyVerdict(record) {
    const raw = record.status || record.verdict || record.summary?.status;
    return LEGACY_STATUS[raw] || LEGACY_STATUS[String(raw || "").toUpperCase()] || "CAUTION";
  }

  function historySummary(record) {
    if (record?.schemaVersion === HISTORY_SCHEMA_VERSION && record.evaluation) {
      return {
        verdict: record.evaluation.verdict,
        reason: record.evaluation.summaryReasons?.[0]?.label || "Scan complete.",
        profileName: String(record.profile?.name || "My Profile").replace(/\b(?:Strict|Custom)\s+Jain\b/gi, "Jain"),
        date: record.scannedAt,
        legacy: false,
      };
    }
    return {
      verdict: legacyVerdict(record || {}),
      reason: record?.message || "Created with an earlier ROOTS rules version.",
      profileName: String(record?.profileLabel || "Earlier profile").replace(/\b(?:Strict|Custom)\s+Jain\b/gi, "Jain"),
      date: record?.savedAt || record?.scannedAt,
      legacy: true,
    };
  }

  function historySearchText(record) {
    const raw = JSON.stringify({
      product: record?.product, profile: record?.profile, profileLabel: record?.profileLabel,
      reasons: record?.evaluation?.summaryReasons, legacyMessage: record?.message,
    }).toLowerCase();
    return /\b(?:strict|custom)[ _-]?jain\b/.test(raw) ? `${raw} jain` : raw;
  }

  function recheck(record, profile) {
    if (!record?.parsedProduct) return null;
    const source = {
      sourceType: record.parsedProduct.sourceType,
      productName: record.product?.name,
      brand: record.product?.brand,
      barcode: record.product?.barcode,
      image: record.product?.image,
      region: record.product?.region,
      originalLanguage: record.source?.originalLanguage,
      translatedLanguage: record.source?.translatedLanguage,
      ingredientTextOriginal: record.ingredientText?.original || record.text?.original,
      ingredientTextTranslated: record.ingredientText?.translated || record.text?.translated,
      originalText: record.text?.original,
      translatedText: record.text?.translated,
      editedText: record.ingredientText?.edited || record.text?.edited,
      warnings: record.warnings,
      sourceMetadata: record.parsedProduct.sourceMetadata,
    };
    return evaluateSource(source, profile || activeProfile());
  }

  function editCurrentIngredientText(text) {
    if (!current?.product) return null;
    const p = current.product;
    return evaluateSource({
      sourceType: p.sourceType,
      productName: p.productName,
      brand: p.brand,
      barcode: p.barcode,
      image: p.image,
      region: p.region,
      originalLanguage: p.originalLanguage,
      translatedLanguage: p.translatedLanguage,
      ingredientTextOriginal: p.ingredientText?.original || p.rawText.original,
      ingredientTextTranslated: p.ingredientText?.translated || p.rawText.translated,
      originalText: p.rawText.original,
      translatedText: p.rawText.translated,
      editedText: text,
      warnings: p.warnings,
      sourceMetadata: p.sourceMetadata,
    }, current.profile || activeProfile());
  }

  function restoreCurrentIngredientText() {
    if (!current?.product) return null;
    const p = current.product;
    return evaluateSource({
      sourceType: p.sourceType,
      productName: p.productName,
      brand: p.brand,
      barcode: p.barcode,
      image: p.image,
      region: p.region,
      originalLanguage: p.originalLanguage,
      translatedLanguage: p.translatedLanguage,
      ingredientTextOriginal: p.ingredientText?.original || p.rawText.original,
      ingredientTextTranslated: p.ingredientText?.translated || p.rawText.translated,
      originalText: p.rawText.original,
      translatedText: p.rawText.translated,
      warnings: p.warnings,
      sourceMetadata: p.sourceMetadata,
    }, current.profile || activeProfile());
  }

  function getAIContext() {
    if (!current?.evaluation) return "";
    const reasons = (current.evaluation.summaryReasons || []).slice(0, 5).map((item) => `- ${clean(item.label)}`).join("\n");
    return [
      "Current deterministic scan:",
      `Product: ${clean(current.product.productName) || "Unnamed product"}`,
      `Verdict: ${current.evaluation.verdict}`,
      reasons ? `Main reasons:\n${reasons}` : "",
      `Evidence: ${current.product.sourceType === "label_photo" ? "current product label" : "Open Food Facts"}`,
      "Do not override or recompute this deterministic verdict. Separate confirmed facts from uncertainty. Never guarantee allergy safety.",
    ].filter(Boolean).join("\n");
  }

  root.ROOTS_SCAN_PIPELINE = {
    HISTORY_SCHEMA_VERSION,
    INSUFFICIENT_DATA,
    buildParsedProduct,
    sourceFromBarcode,
    sourceFromOcr,
    evaluateSource,
    makeHistoryRecord,
    historySummary,
    historySearchText,
    legacyVerdict,
    recheck,
    editCurrentIngredientText,
    restoreCurrentIngredientText,
    getCurrent: () => clone(current),
    setCurrent: (value) => { current = clone(value); },
    clearCurrent: () => { current = null; previousBarcode = null; },
    getAIContext,
  };
})(typeof window !== "undefined" ? window : globalThis);
