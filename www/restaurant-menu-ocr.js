(function (root) {
  "use strict";
  const CACHE_KEY = "roots-menu-ocr-cache-v1", CACHE_LIMIT = 30, MODEL = "gemini-2.5-flash";
  const PROMPT = "Extract only visible restaurant menu content. Preserve page order, section headings, dish names, descriptions, prices, size options, modifier headings, dietary symbols, allergen notes, footnotes, and disclaimers. Do not invent ingredients, dishes, descriptions, recipes, certifications, or missing prices. Preserve the complete original-language transcription before translating it to English. Return JSON only.";
  const SCHEMA = {
    type: "OBJECT",
    properties: {
      detectedLanguage: { type: "STRING" },
      secondaryLanguages: { type: "ARRAY", items: { type: "STRING" } },
      originalText: { type: "STRING" },
      translatedText: { type: "STRING" },
      warnings: { type: "ARRAY", items: { type: "STRING" } },
      textBlocks: {
        type: "ARRAY", items: {
          type: "OBJECT", properties: {
            text: { type: "STRING" }, confidenceCategory: { type: "STRING" },
          }, required: ["text"],
        },
      },
    },
    required: ["detectedLanguage", "originalText", "translatedText", "warnings", "textBlocks"],
  };
  const clean = (value, limit) => String(value ?? "").trim().slice(0, limit || 100000);
  const readCache = () => { try { const value = JSON.parse(localStorage.getItem(CACHE_KEY)); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const writeCache = (value) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value.slice(0, CACHE_LIMIT))); } catch (_) { /* extraction remains usable */ } };
  async function bytes(file) {
    if (file?.arrayBuffer) return new Uint8Array(await file.arrayBuffer());
    if (file instanceof Uint8Array) return file;
    throw new TypeError("A readable menu image is required.");
  }
  async function hashPage(page) {
    if (page.contentHash) return page.contentHash;
    const data = await bytes(page.file || page.workingImage);
    if (root.crypto?.subtle) {
      const digest = await root.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    data.forEach((value) => { hash ^= value; hash = Math.imul(hash, 16777619); });
    return `fnv-${(hash >>> 0).toString(16)}-${data.length}`;
  }
  function detectLanguage(text) {
    const value = clean(text, 100000);
    const matches = [];
    if (/[áéíóúñ¿¡]/i.test(value) || /\b(el|la|con|de|para)\b/i.test(value)) matches.push("es");
    if (/[àâçéèêëîïôûùüÿœ]/i.test(value) || /\b(avec|et|du|des)\b/i.test(value)) matches.push("fr");
    if (/[A-Za-z]/.test(value)) matches.push("en");
    const unique = [...new Set(matches)];
    return { primary: unique[0] || "unknown", secondary: unique.slice(1), mixed: unique.length > 1 };
  }
  function normalize(raw, page, hash) {
    const originalText = clean(raw?.originalText, 100000);
    if (!originalText) { const error = new Error("No readable menu text was found on this page."); error.code = "ocr_empty"; throw error; }
    const detected = detectLanguage(originalText);
    const warnings = (Array.isArray(raw?.warnings) ? raw.warnings : []).map((value) => clean(value, 100)).filter(Boolean);
    if (detected.mixed && !warnings.includes("mixed_language")) warnings.push("mixed_language");
    return {
      pageId: String(page.id || ""), pageNumber: Number(page.order) + 1,
      detectedLanguage: clean(raw.detectedLanguage, 20) || detected.primary,
      secondaryLanguages: (raw.secondaryLanguages || detected.secondary).map((value) => clean(value, 20)).filter(Boolean),
      originalText, translatedText: clean(raw.translatedText, 100000),
      textBlocks: (Array.isArray(raw.textBlocks) ? raw.textBlocks : []).slice(0, 1000).map((block) => ({
        text: clean(block?.text, 2000), boundingBox: block?.boundingBox && typeof block.boundingBox === "object" ? block.boundingBox : null,
        confidenceCategory: ["clear", "likely", "uncertain"].includes(block?.confidenceCategory) ? block.confidenceCategory : "likely",
      })).filter((block) => block.text),
      warnings, extractionProvider: clean(raw.extractionProvider, 60) || "gemini",
      extractionVersion: 1, contentHash: hash,
    };
  }
  async function filePart(file) {
    const data = await bytes(file);
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < data.length; index += chunk) binary += String.fromCharCode(...data.subarray(index, index + chunk));
    return { inline_data: { mime_type: file.type || "image/jpeg", data: btoa(binary) } };
  }
  class GeminiMenuOcrProvider {
    async extractPage(page, options) {
      const file = page.file || page.workingImage;
      if (root.ROOTS_CONNECTIVITY?.get?.().offline === true) {
        if (!root.BIJ_OCR?.localOcrAvailable?.()) { const error = new Error("Offline menu reading is unavailable on this device. Enter menu text manually or use a saved menu."); error.code = "local_ocr_unavailable"; throw error; }
        const local = await root.BIJ_OCR.extractLocal(file, options?.onPageProgress, { signal: options?.signal });
        return { detectedLanguage: local.detectedLanguage || "unknown", secondaryLanguages: [], originalText: local.originalText, translatedText: "", warnings: (local.extractionWarnings || []).map((item) => item.code), textBlocks: [{ text: local.originalText, confidenceCategory: "uncertain" }], extractionProvider: "local_device_ocr" };
      }
      const base = clean(root.ROOTS_RUNTIME_CONFIG?.API_BASE_URL, 500).replace(/\/+$/, "");
      if (!base) { const error = new Error("Menu photo reading is unavailable until the OCR service is configured."); error.code = "ocr_provider_unavailable"; throw error; }
      const body = new FormData();
      body.append("file", file, "menu-page.jpg");
      const url = `${base}/v1/ocr/menu`;
      const response = root.ROOTS_NETWORK
        ? await root.ROOTS_NETWORK.request(url, {
          method: "POST", body, signal: options?.signal,
          timeoutMs: 30000, retries: 1, classification: "menu_ocr",
          dedupeKey: `menu-ocr:${page.id}:${file?.size || 0}:${file?.lastModified || 0}`,
        })
        : await fetch(url, { method: "POST", body, signal: options?.signal })
          .then(async (result) => ({ ok: result.ok, status: result.status, data: await result.json() }));
      if (!response.ok) { const error = new Error("This menu page could not be read. Try again."); error.code = "ocr_provider_error"; throw error; }
      return response.data;
    }
  }
  let provider = new GeminiMenuOcrProvider();
  async function processPages(pages, options) {
    const ordered = [...(Array.isArray(pages) ? pages : [])].sort((a, b) => a.order - b.order);
    const results = [], cache = readCache(), byHash = new Map(cache.map((item) => [item.contentHash, item]));
    const task = root.ROOTS_PERFORMANCE?.startTask?.("menu_ocr_pages", { count: ordered.length, concurrency: 1 });
    try {
      for (let index = 0; index < ordered.length; index += 1) {
        const page = ordered[index], hash = await hashPage(page);
        const cached = byHash.get(hash);
        if (cached) results.push({ ...cached, pageId: page.id, pageNumber: index + 1, fromCache: true });
        else {
          options?.onProgress?.({ current: index + 1, total: ordered.length, status: "reading" });
          const result = normalize(await provider.extractPage(page, options), page, hash);
          byHash.set(hash, result);
          writeCache([result, ...[...byHash.values()].filter((item) => item.contentHash !== hash)]);
          results.push(result);
        }
      }
    } catch (error) {
      root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "error", count: results.length });
      throw error;
    }
    options?.onProgress?.({ current: ordered.length, total: ordered.length, status: "complete" });
    root.ROOTS_PERFORMANCE?.endTask?.(task, { count: results.length });
    return results;
  }
  async function retryPage(page, options) {
    const hash = await hashPage(page);
    writeCache(readCache().filter((item) => item.contentHash !== hash));
    return (await processPages([page], options))[0];
  }
  root.ROOTS_MENU_OCR = {
    processPages, retryPage, detectLanguage, hashPage, normalize, constants: { CACHE_KEY, CACHE_LIMIT, MODEL },
    setProvider(next) { if (!next || typeof next.extractPage !== "function") throw new TypeError("Menu OCR provider must implement extractPage."); provider = next; },
    resetProvider() { provider = new GeminiMenuOcrProvider(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
