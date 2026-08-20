/* ============================================================
   ROOTS — Gemini extraction and compatibility scan adapter

   Reading the label: provider-backed vision through the protected ROOTS API.
   It extracts and translates evidence but never decides compatibility.
   Classifying: the LOCAL rule classifier below (a faithful port of api.py's
   classify_ingredient + term-set lists) decides JAIN / NON_JAIN / UNCERTAIN —
   free, instant, deterministic, including the allergy -> NON_JAIN safety net.

   Provider credentials stay on the backend. Local OCR is used when a supported
   device TextDetector or an installed native ROOTS_LOCAL_OCR_PROVIDER exists.

   Exposes window.BIJ_OCR = { scan(file, profile, onProgress) -> Promise<result> }.
   The returned object matches the shape the old /classify endpoint returned, so
   script.js / displayResult() consume it unchanged.
   ============================================================ */
(function () {
  "use strict";

  // DEPRECATED: this Jain-focused classifier remains only for historical
  // backend parity/debugging. Production scans call extractLabel(), then
  // ROOTS_SCAN_PIPELINE and ROOTS_DIETARY_ENGINE.

  /* ---------- Term sets for the classifier (ported verbatim from api.py) ---------- */
  const MEAT_TERMS = [
    "anchovy", "bacon", "beef", "bone broth", "broth", "chicken", "duck", "fish",
    "ham", "lamb", "lard", "meat", "mutton", "pork", "sausage", "shrimp", "stock",
    "tuna",
  ];
  const EGG_TERMS = ["egg", "eggs", "albumen", "albumin", "egg whites", "mayonnaise"];
  const ROOT_TERMS = [
    "beet", "beets", "carrot", "carrots", "garlic", "garlic powder", "ginger",
    "onion", "onion powder", "potato", "potatoes", "radish", "shallot", "shallots",
    "sweet potato", "tapioca", "turnip", "yam",
  ];
  const ONION_GARLIC_TERMS = ["garlic", "garlic powder", "onion", "onion powder", "shallot", "shallots"];
  const ANIMAL_BYPRODUCT_TERMS = [
    // Dairy (casein, lactose, whey) is intentionally NOT here — Jainism is
    // lacto-vegetarian, so dairy is allowed (blocked only for vegan / milk allergy).
    "carmine", "collagen", "confectioner's glaze", "gelatin", "isinglass",
    "rennet", "shellac",
  ];
  const DAIRY_TERMS = [
    "butter", "casein", "cheese", "cream", "ghee", "lactose", "milk", "milk powder",
    "paneer", "whey", "yogurt",
  ];
  const HONEY_TERMS = ["honey"];
  const ARTIFICIAL_ADDITIVE_TERMS = [
    "artificial color", "artificial colors", "artificial flavour", "artificial flavours",
    "artificial flavor", "artificial flavors", "blue 1", "blue 2", "fd&c", "red 3",
    "red 40", "yellow 5", "yellow 6",
  ];
  const JAIN_SAFE_TERMS = [
    "almond", "ascorbic acid", "basil", "black pepper", "brown rice", "cabbage",
    "calcium carbonate", "canola oil", "cardamom", "cashew", "chili pepper",
    "citric acid", "cocoa butter", "coconut oil", "corn flour", "corn starch",
    "cottonseed oil", "cream", "dextrose", "flour", "folic acid", "ghee", "guar gum",
    "lentils", "maltodextrin", "milk", "niacin", "paneer", "paprika", "peanut oil",
    "pepper", "rice", "riboflavin", "safflower oil", "salt", "sea salt", "seed",
    "soy lecithin", "soybean oil", "spinach", "sugar", "sunflower oil",
    "sunflower lecithin", "thiamine", "tomato", "turmeric", "vegetable oil", "water",
    "wheat flour", "xanthan gum", "yogurt",
  ];
  const AMBIGUOUS_TERMS = [
    "artificial flavor", "artificial flavors", "color", "colour", "culture", "cultures",
    "emulsifier", "enzyme", "enzymes", "flavor", "flavors", "flavour", "flavours",
    "natural flavor", "natural flavors", "natural flavour", "natural flavours",
    "preservative", "seasoning", "seasonings", "spice", "spices", "stabilizer",
  ];
  // Ingredient-specific context for each ambiguous term, so "uncertain" ingredients
  // explain WHY they're unclear instead of a one-size-fits-all "needs review" message.
  const AMBIGUOUS_TERM_REASONS = {
    "natural flavor": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavors": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavour": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavours": "Can legally come from a plant or animal source — the label doesn't say which.",
    "artificial flavor": "Usually lab-synthesized, not from an animal or plant source — typically the safer of the two flavor types.",
    "artificial flavors": "Usually lab-synthesized, not from an animal or plant source — typically the safer of the two flavor types.",
    "flavor": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavors": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavour": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavours": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "color": "Could be plant-based (turmeric, beet) or animal-based (carmine, from insects) — not specified.",
    "colour": "Could be plant-based (turmeric, beet) or animal-based (carmine, from insects) — not specified.",
    "culture": "A bacterial fermentation culture, not animal tissue — but often grown in a dairy base.",
    "cultures": "A bacterial fermentation culture, not animal tissue — but often grown in a dairy base.",
    "emulsifier": "Can be plant-based (soy lecithin) or occasionally animal-derived — not specified.",
    "enzyme": "Can be microbial or animal-derived (like rennet) — depends on the product.",
    "enzymes": "Can be microbial or animal-derived (like rennet) — depends on the product.",
    "preservative": "Usually synthetic or plant-derived, but the specific one isn't named.",
    "spice": "Spices are usually plant-based, but a “spice blend” could fold in onion or garlic powder.",
    "spices": "Spices are usually plant-based, but a “spice blend” could fold in onion or garlic powder.",
    "seasoning": "Seasoning blends often fold in onion or garlic powder without listing them separately.",
    "seasonings": "Seasoning blends often fold in onion or garlic powder without listing them separately.",
    "stabilizer": "Can be plant-based (gums) or animal-derived (gelatin) — not specified.",
  };
  // Pick the most specific matching term (e.g. prefer "natural flavor" over bare "flavor").
  function ambiguousReason(normalized) {
    const hits = AMBIGUOUS_TERMS.filter((t) => normalized.includes(t));
    if (!hits.length) return null;
    hits.sort((a, b) => b.length - a.length);
    return AMBIGUOUS_TERM_REASONS[hits[0]] || `Contains "${hits[0]}", which is too broad to classify from the label alone.`;
  }
  const LIKELY_SAFE_PATTERNS = [
    "acid", "bean", "berry", "bran", "butter", "calcium", "canola", "carbonate", "casein",
    "cereal", "cheese", "chloride", "citrate", "cocoa", "coconut", "corn", "cream",
    "dextrose", "flour", "fruit", "ghee", "glucose", "gum", "lactose", "lecithin",
    "maltodextrin", "milk", "oil", "paneer", "pea", "pepper", "phosphate", "potassium",
    "protein", "rice", "salt", "seed", "sodium", "soy", "starch", "sugar", "sulfate",
    "sunflower", "tomato", "turmeric", "vitamin", "water", "wheat", "whey", "xanthan",
    "yogurt",
  ];

  const uniq = (arr) => Array.from(new Set(arr));
  const NON_JAIN_TERMS = uniq([].concat(MEAT_TERMS, EGG_TERMS, ROOT_TERMS, ANIMAL_BYPRODUCT_TERMS, HONEY_TERMS));
  const VEGAN_BLOCK_TERMS = uniq([].concat(DAIRY_TERMS, HONEY_TERMS, EGG_TERMS, ANIMAL_BYPRODUCT_TERMS));

  /* ---------- difflib SequenceMatcher.ratio() port ----------
     Ratcliff/Obershelp similarity, matching Python's difflib closely for the
     short strings the classifier fuzzy-matches against. */
  function findLongestMatch(a, b, alo, ahi, blo, bhi) {
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = {};
    for (let i = alo; i < ahi; i++) {
      const newj2len = {};
      for (let j = blo; j < bhi; j++) {
        if (a[i] === b[j]) {
          const k = (j2len[j - 1] || 0) + 1;
          newj2len[j] = k;
          if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
        }
      }
      j2len = newj2len;
    }
    return [besti, bestj, bestsize];
  }
  function matchingBlocksSize(a, b, alo, ahi, blo, bhi) {
    const [i, j, k] = findLongestMatch(a, b, alo, ahi, blo, bhi);
    if (k === 0) return 0;
    return k
      + matchingBlocksSize(a, b, alo, i, blo, j)
      + matchingBlocksSize(a, b, i + k, ahi, j + k, bhi);
  }
  function ratio(a, b) {
    const total = a.length + b.length;
    if (total === 0) return 1;
    const matches = matchingBlocksSize(a, b, 0, a.length, 0, b.length);
    return (2.0 * matches) / total;
  }

  /* ---------- text helpers ---------- */
  function normalizeName(text) {
    let c = String(text == null ? "" : text).replace(/[\n\r]/g, " ");
    c = c.replace(/\s+/g, " ");
    c = c.replace(/^[ ,.;:\-]+|[ ,.;:\-]+$/g, "");
    if ((c.startsWith('"') && c.endsWith('"')) || (c.startsWith("'") && c.endsWith("'"))) {
      c = c.slice(1, -1).trim();
    }
    return c;
  }
  function normalizeKey(text) {
    let l = normalizeName(text).toLowerCase();
    l = l.replace(/&/g, " and ");
    l = l.replace(/[^a-z0-9+/\-\s]/g, " ");
    l = l.replace(/\s+/g, " ").trim();
    return l;
  }

  /* ---------- classifier (ported from classify_ingredient) ---------- */
  const hasTerm = (normalized, terms) => terms.some((t) => normalized.includes(t));
  function fuzzyTermHit(normalized, terms, threshold) {
    threshold = threshold == null ? 0.85 : threshold;
    const tokens = normalized.split(" ").filter((t) => t.length >= 4);
    for (const term of terms) {
      if (term.includes(" ") || term.length < 4) continue;
      for (const token of tokens) if (ratio(token, term) >= threshold) return term;
    }
    return null;
  }

  function defaultProfile() {
    return {
      label: "Jain",
      avoid_meat: true, avoid_eggs: true, avoid_root_vegetables: true,
      avoid_onion_garlic: true, avoid_honey: true, avoid_animal_byproducts: true,
      vegan: false, avoid_artificial_additives: false, allergies: [],
    };
  }

  // Allergen synonyms so e.g. a "milk" allergy also catches lactose/whey/casein, "gluten"
  // catches wheat/barley/rye, etc. Safety-first: we'd rather over-flag than miss an allergen.
  // (Ambiguous terms like bare "butter"/"lecithin"/"citric" are intentionally excluded.)
  const ALLERGEN_SYNONYMS = {
    milk: ["milk", "lactose", "whey", "casein", "caseinate", "ghee", "buttermilk", "milkfat", "milk fat", "milk solids", "cheese", "cream", "paneer", "curd", "yogurt", "yoghurt", "custard"],
    dairy: ["milk", "lactose", "whey", "casein", "caseinate", "ghee", "buttermilk", "cheese", "cream", "paneer", "curd", "yogurt", "yoghurt"],
    egg: ["egg", "albumen", "albumin", "ovalbumin", "mayonnaise", "meringue"],
    peanut: ["peanut", "groundnut", "arachis"],
    soy: ["soy", "soya", "soybean", "edamame", "tofu", "tempeh", "miso"],
    wheat: ["wheat", "durum", "semolina", "spelt", "farina", "atta", "maida", "bulgur"],
    gluten: ["gluten", "wheat", "barley", "rye", "malt", "triticale", "spelt", "semolina", "durum"],
    sesame: ["sesame", "tahini", "benne", "gingelly", "til"],
    mustard: ["mustard"],
    corn: ["corn", "maize", "cornstarch", "corn starch", "cornflour", "corn flour", "hominy", "polenta", "masa"],
    coconut: ["coconut", "copra"],
    sulfite: ["sulfite", "sulphite", "sulfur dioxide", "sulphur dioxide", "metabisulfite", "bisulfite"],
    almond: ["almond", "marzipan"],
    cashew: ["cashew"],
    walnut: ["walnut"],
    pistachio: ["pistachio"],
    chickpea: ["chickpea", "garbanzo", "gram flour", "besan", "chana"],
    lentil: ["lentil", "masoor", "moong", "toor", "urad"],
    mushroom: ["mushroom", "truffle", "shiitake", "portobello"],
    citrus: ["citrus", "lemon", "lime", "orange", "grapefruit", "tangerine"],
    cinnamon: ["cinnamon", "cassia"],
    "tree nut": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut", "filbert"],
    nut: ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut", "peanut"],
  };

  function classifyIngredient(name, profile) {
    const diet = profile || defaultProfile();
    const normalized = normalizeKey(name);

    const allergyHits = (diet.allergies || []).filter((a) => {
      if (!a) return false;
      const ak = normalizeKey(a);
      if (!ak) return false;
      const terms = ALLERGEN_SYNONYMS[ak] || [ak, ak.replace(/s$/, "")];
      return terms.some((t) => t && normalized.includes(t));
    });
    if (allergyHits.length) {
      // Allergens are a safety flag, NOT a Jain-diet conflict — own category/section.
      return { name, category: "ALLERGEN", reason: `Contains an allergen/restriction you listed: ${allergyHits.join(", ")}.` };
    }

    const blockers = [];
    if (diet.avoid_meat && hasTerm(normalized, MEAT_TERMS)) blockers.push("meat or seafood");
    if (diet.avoid_eggs && hasTerm(normalized, EGG_TERMS)) blockers.push("egg");
    if (diet.avoid_root_vegetables && hasTerm(normalized, ROOT_TERMS)) blockers.push("root vegetable");
    else if (diet.avoid_onion_garlic && hasTerm(normalized, ONION_GARLIC_TERMS)) blockers.push("onion or garlic");
    if (diet.avoid_honey && hasTerm(normalized, HONEY_TERMS)) blockers.push("honey");
    if (diet.avoid_animal_byproducts && hasTerm(normalized, ANIMAL_BYPRODUCT_TERMS)) blockers.push("animal-derived ingredient");
    if (diet.vegan && hasTerm(normalized, VEGAN_BLOCK_TERMS)) blockers.push("not vegan");
    if (diet.avoid_artificial_additives && hasTerm(normalized, ARTIFICIAL_ADDITIVE_TERMS)) blockers.push("artificial color/flavor additive");

    if (blockers.length) {
      const u = Array.from(new Set(blockers));
      return { name, category: "NON_JAIN", reason: `Not allowed by your diet profile: ${u.join(", ")}.` };
    }

    if (hasTerm(normalized, NON_JAIN_TERMS)) {
      return { name, category: "UNCERTAIN", reason: "This ingredient can conflict with Jain settings, but the active profile did not expose the matching legacy rule. Review with the current ROOTS engine." };
    }

    const ambiguousHit = ambiguousReason(normalized);
    if (ambiguousHit) {
      return { name, category: "UNCERTAIN", reason: ambiguousHit };
    }

    if (hasTerm(normalized, ARTIFICIAL_ADDITIVE_TERMS) || JAIN_SAFE_TERMS.includes(normalized) || LIKELY_SAFE_PATTERNS.some((p) => normalized.includes(p))) {
      return { name, category: "JAIN", reason: "Allowed by your current diet profile." };
    }

    const fuzzyBlockers = [];
    if (diet.avoid_meat) fuzzyBlockers.push(["meat or seafood", MEAT_TERMS]);
    if (diet.avoid_eggs) fuzzyBlockers.push(["egg", EGG_TERMS]);
    if (diet.avoid_root_vegetables) fuzzyBlockers.push(["root vegetable", ROOT_TERMS]);
    else if (diet.avoid_onion_garlic) fuzzyBlockers.push(["onion or garlic", ONION_GARLIC_TERMS]);
    if (diet.avoid_honey) fuzzyBlockers.push(["honey", HONEY_TERMS]);
    if (diet.avoid_animal_byproducts) fuzzyBlockers.push(["animal-derived ingredient", ANIMAL_BYPRODUCT_TERMS]);
    for (const [label, terms] of fuzzyBlockers) {
      const hit = fuzzyTermHit(normalized, terms);
      if (hit) return { name, category: "UNCERTAIN", reason: `Possible '${hit}' (${label}) detected from an unclear scan. Re-scan or confirm before trusting this.` };
    }

    return { name, category: "UNCERTAIN", reason: "We don't have a rule for this specific ingredient — treat it as possibly non-Jain if you want to be cautious." };
  }

  // Classify a list of {name, original} entries, attaching the original-language
  // text as `translation` when it differs from the English name.
  function classifyEntries(entries, profile) {
    const seen = new Set();
    const items = [];
    for (const e of entries) {
      const name = normalizeName(e.name || e.original || "");
      if (!name) continue;
      const key = normalizeKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const result = classifyIngredient(name, profile);
      const original = normalizeName(e.original || "");
      if (original && normalizeKey(original) !== key) result.translation = original;
      items.push(result);
    }
    return items;
  }

  /* ---------- response builder (matches build_scan_response shape) ---------- */
  function buildScanResponse(items, profile, opts) {
    opts = opts || {};
    const grouped = { allergen_ingredients: [], non_jain_ingredients: [], uncertain_ingredients: [], jain_ingredients: [] };
    for (const it of items) {
      if (it.category === "ALLERGEN") grouped.allergen_ingredients.push(it);
      else if (it.category === "NON_JAIN") grouped.non_jain_ingredients.push(it);
      else if (it.category === "JAIN") grouped.jain_ingredients.push(it);
      else grouped.uncertain_ingredients.push(it);
    }
    const count = items.length;
    const al = grouped.allergen_ingredients.length;
    const nj = grouped.non_jain_ingredients.length;
    const un = grouped.uncertain_ingredients.length;
    const ja = grouped.jain_ingredients.length;

    let status, message;
    if (count === 0) {
      status = "UNCERTAIN";
      message = opts.message || "We couldn't clearly read the ingredient list. Try a sharper, tighter photo of just the ingredients.";
    } else if (al) {
      // Allergens are the most safety-critical finding → headline the verdict.
      status = "ALLERGEN";
      const a = `${al} ingredient${al !== 1 ? "s" : ""} you're allergic to`;
      message = nj
        ? `Contains ${a}, plus ${nj} that ${nj !== 1 ? "aren't" : "isn't"} Jain.`
        : `Contains ${a}.`;
    } else if (nj) {
      status = "NON_JAIN";
      message = `${nj} ingredient${nj !== 1 ? "s" : ""} conflict with your diet profile.`;
    } else if (un) {
      status = "UNCERTAIN";
      message = `${un} ingredient${un !== 1 ? "s" : ""} need manual review.`;
    } else {
      status = "JAIN";
      message = `All ${ja} detected ingredients fit your diet profile.`;
    }

    return {
      summary: {
        is_safe: count > 0 && al === 0 && nj === 0 && un === 0,
        status,
        message,
        ocr_quality: opts.engine || "gemini",
        scanned_ingredient_count: count,
        profile_label: (profile && profile.label) || "Jain",
      },
      allergen_ingredients: grouped.allergen_ingredients,
      non_jain_ingredients: grouped.non_jain_ingredients,
      uncertain_ingredients: grouped.uncertain_ingredients,
      jain_ingredients: grouped.jain_ingredients,
      ocr_text: opts.ocrText || "",
      timestamp: new Date().toISOString(),
      from_cache: false,
      engine: opts.engine || "gemini",
      source_language: opts.sourceLanguage || "English",
    };
  }

  /* ---------- image helpers ---------- */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read the image file."));
      r.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load the image."));
      img.src = src;
    });
  }

  /* ---------- Protected provider API: extracts/translates evidence only ---------- */
  const apiBase = () => String(window.ROOTS_RUNTIME_CONFIG?.API_BASE_URL || "").replace(/\/+$/, "");
  const apiUrl = (path) => `${apiBase()}${path}`;
  function requestFingerprint(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }
  const extractionCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function localOcrAvailable() {
    const provider = window.ROOTS_LOCAL_OCR_PROVIDER;
    return (typeof provider?.extractText === "function" && provider.available?.() !== false) || typeof window.TextDetector === "function";
  }
  async function localExtract(file, onProgress, options) {
    const task = window.ROOTS_PERFORMANCE?.startTask?.("ocr_local", { source: "device" });
    let taskStatus = "failed";
    try {
      onProgress?.(0.1);
      let result;
      if (typeof window.ROOTS_LOCAL_OCR_PROVIDER?.extractText === "function" && window.ROOTS_LOCAL_OCR_PROVIDER.available?.() !== false) {
        result = await window.ROOTS_LOCAL_OCR_PROVIDER.extractText(file, { signal: options?.signal });
      } else if (typeof window.TextDetector === "function" && typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        try { result = await new window.TextDetector().detect(bitmap); }
        finally { bitmap.close?.(); }
      } else {
        throw Object.assign(new Error("Offline text recognition is unavailable on this device. Enter ingredients manually."), { code: "OCR_LOCAL_UNAVAILABLE" });
      }
      const segments = Array.isArray(result) ? result : Array.isArray(result?.segments) ? result.segments : [];
      const text = String(result?.text || segments.map((item) => item.rawValue || item.text || "").filter(Boolean).join("\n")).trim();
      if (!text) throw Object.assign(new Error("No label text was detected."), { code: "OCR_EMPTY_TEXT" });
      const lowConfidence = segments.some((item) => {
        const confidence = Number(item?.confidence);
        return Number.isFinite(confidence) && confidence < (confidence > 1 ? 65 : 0.65);
      });
      onProgress?.(1);
      taskStatus = "complete";
      return {
        sourceType: "label_photo", originalLanguage: "und", detectedLanguage: "und", translatedLanguage: "",
        originalText: text, translatedText: "", ingredientTextOriginal: text, ingredientTextTranslated: "",
        allergenTextOriginal: "", allergenTextTranslated: "", productName: "", brand: "",
        extractionProvider: "local_device_ocr", extractionVersion: 1, offline: window.ROOTS_CONNECTIVITY?.get?.().offline === true,
        verificationScope: "scanned_label_only",
        extractionWarnings: [
          { code: "local_ocr_unverified", message: "Review the locally detected text against the package label.", action: "Review Ingredients" },
          ...(lowConfidence ? [{ code: "low_ocr_quality", message: "Some locally detected words are uncertain. Compare them with the package label.", action: "Review Ingredients" }] : []),
        ],
      };
    } finally { window.ROOTS_PERFORMANCE?.endTask?.(task, { status: taskStatus }); }
  }
  async function extractOnce(file, apiKey, onProgress, options) {
    if (!extractionCache || (typeof file !== "object" && typeof file !== "function")) return geminiExtract(file, apiKey, onProgress, options);
    const cached = extractionCache.get(file);
    if (cached) {
      onProgress?.(0.95);
      rootPerformance("ocr_cache_hit", { cache: "hit" });
      return cached;
    }
    const pending = geminiExtract(file, apiKey, onProgress, options);
    extractionCache.set(file, pending);
    try { return await pending; }
    catch (error) { extractionCache.delete(file); throw error; }
  }
  function rootPerformance(name, metadata) {
    const task = window.ROOTS_PERFORMANCE?.startTask?.(name, metadata);
    window.ROOTS_PERFORMANCE?.endTask?.(task, metadata);
  }
  async function providerRequest(path, body, options) {
    const url = apiUrl(path);
    if (!apiBase()) throw (window.ROOTS_ERRORS?.create?.("API_NOT_CONFIGURED") || Object.assign(new Error("Online services are not configured for this build."), { code: "API_NOT_CONFIGURED" }));
    const isForm = body instanceof FormData;
    const headers = isForm ? {} : { "Content-Type": "application/json" };
    const installId = window.ROOTS_INSTALL_ID?.get?.();
    if (installId) headers["X-ROOTS-Install-ID"] = installId;
    const requestOptions = {
      method: "POST",
      headers,
      body: isForm ? body : JSON.stringify(body),
      signal: options?.signal, timeoutMs: 35000, retries: 1,
      dedupeKey: isForm ? null : `roots-api:${path}:${requestFingerprint(JSON.stringify(body))}`,
      skipDedupe: isForm,
      classification: options?.classification || "provider",
    };
    if (window.ROOTS_NETWORK) {
      return window.ROOTS_NETWORK.request(url, requestOptions);
    }
    const response = await fetch(url, requestOptions);
    return { ok: response.ok, status: response.status, data: await response.json() };
  }

  const EXTRACT_PROMPT =
    "You are an OCR extractor and translator for a food label. Transcribe evidence; do not decide " +
    "dietary safety and do not invent missing words. Preserve the ingredient section exactly as " +
    "printed in ingredient_text_original, including parentheses and subingredients. Translate that " +
    "complete section into English in ingredient_text_translated without dropping uncertain terms. " +
    "Preserve allergen advisory text separately in allergen_text_original and translate it in " +
    "allergen_text_translated. Return detected_language as a short language code. Add warning codes " +
    "from blurry_image, incomplete_label, low_ocr_quality, or translation_uncertain when applicable. " +
    "If this is not a readable food ingredient label, set is_valid false. Never add certifications.";

  const EXTRACT_SCHEMA = {
    type: "OBJECT",
    properties: {
      is_valid: { type: "BOOLEAN" },
      detected_language: { type: "STRING" },
      original_text: { type: "STRING" },
      translated_text: { type: "STRING" },
      ingredient_text_original: { type: "STRING" },
      ingredient_text_translated: { type: "STRING" },
      allergen_text_original: { type: "STRING" },
      allergen_text_translated: { type: "STRING" },
      product_name: { type: "STRING" },
      brand: { type: "STRING" },
      warnings: {
        type: "ARRAY",
        items: { type: "STRING" },
      },
    },
    required: ["is_valid", "ingredient_text_original", "ingredient_text_translated", "warnings"],
  };
  const TRANSLATE_LIST_SCHEMA = {
    type: "OBJECT",
    properties: {
      ingredients: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { name: { type: "STRING" }, original: { type: "STRING" } },
          required: ["name"],
        },
      },
    },
    required: ["ingredients"],
  };

  // Gemini accepts up to 20MB inline. Send the photo as-is when small (preserves
  // EXIF orientation); downscale large photos to keep the upload fast.
  async function imageForGemini(file) {
    if (file.size && file.size <= 6 * 1024 * 1024) {
      const dataUrl = await fileToDataURL(file);
      const comma = String(dataUrl).indexOf(",");
      return { base64: String(dataUrl).slice(comma + 1), mimeType: file.type || "image/jpeg" };
    }
    const img = await loadImage(await fileToDataURL(file));
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, 2000 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: out.slice(out.indexOf(",") + 1), mimeType: "image/jpeg" };
  }

  async function geminiExtract(file, apiKey, onProgress, options) {
    options = options || {};
    if (onProgress) onProgress(0.1);
    let upload = file;
    if (!file.size || file.size > 6 * 1024 * 1024) {
      const image = await imageForGemini(file);
      upload = await (await fetch(`data:${image.mimeType};base64,${image.base64}`)).blob();
    }
    if (onProgress) onProgress(0.35);
    const body = new FormData();
    body.append("file", upload, "label.jpg");
    let response;
    try {
      response = await providerRequest("/v1/ocr/label", body, { signal: options.signal, classification: "label_ocr" });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const mapped = error?.code === "NETWORK_TIMEOUT" ? "REQUEST_TIMEOUT" : error?.code || "API_UNREACHABLE";
      throw (window.ROOTS_ERRORS?.create?.(mapped, null, { stage: "label_ocr", originalName: error?.name || "Error" }) || Object.assign(error, { code: mapped }));
    }
    if (onProgress) onProgress(0.9);
    if (!response.ok) {
      const statusCodes = {
        413: "IMAGE_TOO_LARGE",
        415: "IMAGE_UNSUPPORTED",
        429: "OCR_RATE_LIMITED",
        503: "OCR_UNAVAILABLE",
      };
      // Preserve a safe recovery category without exposing provider or key details.
      throw Object.assign(
        new Error("Label scanning is temporarily unavailable."),
        { code: statusCodes[response.status] || (window.ROOTS_ERRORS?.fromHttpStatus?.(response.status) || "OCR_PROVIDER_FAILED"), debugMetadata: { httpStatus: response.status, stage: "label_ocr" } }
      );
    }
    return response.data;
  }

  async function geminiScan(file, profile, apiKey, onProgress) {
    const out = await geminiExtract(file, apiKey, onProgress) || {};
    const sourceLanguage = out.source_language || "English";
    if (out.is_valid === false) {
      return buildScanResponse([], profile, {
        engine: "gemini",
        sourceLanguage,
        message: "That doesn't look like an ingredient label. Try a photo of the ingredient list.",
      });
    }
    const entries = (out.ingredients || []).map((it) => ({ name: it.name, original: it.original }));
    const items = classifyEntries(entries, profile);
    const ocrText = entries.map((e) => e.original || e.name).filter(Boolean).join(", ");
    if (onProgress) onProgress(1);
    return buildScanResponse(items, profile, { ocrText, sourceLanguage, engine: "gemini" });
  }

  // Phase 2C production OCR contract. Gemini extracts and translates evidence;
  // it never produces the final dietary verdict.
  async function extractLabel(file, onProgress, options) {
    if (!file) throw new Error("No image to scan.");
    options = options || {};
    const connection = window.ROOTS_CONNECTIVITY?.get?.();
    // Browser TextDetector support is experimental and some implementations
    // advertise the API but return no label text. Only make local OCR the
    // default while actually offline. Online callers may explicitly request a
    // local-first attempt, but a failed local attempt must fall through to the
    // protected provider instead of ending the scan immediately.
    if (localOcrAvailable() && (connection?.offline || options.preferLocal === true)) {
      try {
        return await localExtract(file, onProgress, options);
      } catch (error) {
        if (connection?.offline || error?.name === "AbortError") throw error;
        onProgress?.(0.05);
      }
    }
    if (connection?.offline) throw Object.assign(new Error("Offline text recognition is unavailable on this device. Enter ingredients manually."), { code: "OCR_LOCAL_UNAVAILABLE", alternativeActions: ["manual_entry", "review_photo"] });
    if (!apiBase()) throw (window.ROOTS_ERRORS?.create?.("API_NOT_CONFIGURED") || Object.assign(new Error("Label scanning is not configured for this build."), { code: "API_NOT_CONFIGURED" }));
    const out = await extractOnce(file, "", onProgress, options) || {};
    if (!out || typeof out !== "object" || Array.isArray(out)) {
      throw Object.assign(new Error("The label response could not be read."), { code: "OCR_INVALID_RESPONSE", alternativeActions: ["review_photo", "manual_entry"] });
    }
    const warnings = Array.isArray(out.warnings) ? out.warnings.map((code) => ({
      code: String(code),
      message: String(code).replace(/_/g, " "),
      action: code === "translation_uncertain" ? "View Original Text" : "Review Ingredients",
    })) : [];
    if (out.is_valid === false) warnings.push({
      code: "incomplete_label",
      message: "We could not read the full ingredient label clearly.",
      action: "Retake Photo",
    });
    const visibleIngredientText = String(out.ingredient_text_original || out.ingredient_text_translated || "").trim();
    if (!visibleIngredientText) {
      throw Object.assign(new Error("No ingredient list was detected in this photo."), {
        code: "OCR_EMPTY_TEXT",
        alternativeActions: ["review_photo", "manual_entry", "retake"],
      });
    }
    if (onProgress) onProgress(1);
    return {
      sourceType: "label_photo",
      originalLanguage: out.detected_language || "en",
      detectedLanguage: out.detected_language || "en",
      translatedLanguage: "en",
      originalText: out.original_text || out.ingredient_text_original || "",
      translatedText: out.translated_text || out.ingredient_text_translated || "",
      ingredientTextOriginal: out.ingredient_text_original || "",
      ingredientTextTranslated: out.ingredient_text_translated || "",
      allergenTextOriginal: out.allergen_text_original || "",
      allergenTextTranslated: out.allergen_text_translated || "",
      productName: out.product_name || "",
      brand: out.brand || "",
      extractionProvider: "gemini",
      extractionVersion: 1,
      extractionWarnings: warnings,
    };
  }

  // Reusable: classify a list of {name, original} entries into the full result
  // shape (used by the barcode path in foodfacts.js / script.js).
  function analyze(entries, profile, opts) {
    const items = classifyEntries(entries || [], profile);
    return buildScanResponse(items, profile, opts || {});
  }

  // Translate raw ingredient strings (any language) to English {name, original}
  // via a quick Gemini TEXT call (no image — fast/cheap). Returns [] on failure
  // so callers can fall back to the raw strings.
  async function translateIngredientList(rawList, options) {
    options = options || {};
    if (!apiBase() || !rawList || !rawList.length) return [];
    const body = {
      source_text: JSON.stringify(rawList.map((original) => ({ original }))),
      target_language: "English",
      format: "ingredients",
    };
    try {
      const response = await providerRequest("/v1/translate", body, { signal: options.signal, classification: "ingredient_translation" });
      if (!response.ok) return [];
      const parsed = JSON.parse(response.data?.text || "{}");
      return Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
    } catch (_) { return []; }
  }

  async function explainEvidence(payload, options) {
    if (!apiBase()) throw new Error("Detailed explanations are not configured for this build.");
    const response = await providerRequest("/v1/ai/explain", payload, {
      signal: options?.signal, classification: "evidence_explanation",
    });
    if (!response.ok || !response.data || typeof response.data !== "object") throw new Error("The longer explanation is unavailable.");
    return response.data;
  }

  async function translateStructured(value, targetLanguage, options) {
    if (!apiBase()) throw new Error("Translation is not configured for this build.");
    const response = await providerRequest("/v1/translate", {
      source_text: JSON.stringify(value),
      target_language: String(targetLanguage || "English").slice(0, 50),
      format: options?.format === "explanation" ? "explanation" : "plain",
    }, { signal: options?.signal, classification: "explanation_translation" });
    if (!response.ok) throw new Error("Translation is unavailable.");
    try { return JSON.parse(response.data?.text || "{}"); } catch (_) { throw new Error("The translation could not be read."); }
  }

  // General-purpose Gemini text call (used by the Assistant + Shopping features).
  // opts: { history:[{role,text}], temperature, json:bool }
  async function generateText(prompt, opts) {
    opts = opts || {};
    if (!apiBase()) throw new Error("The assistant is not configured for this build.");
    const task = ["recipe", "meals", "dining-explanation"].includes(opts.task) ? opts.task : "question";
    let response;
    try {
      response = await providerRequest(`/v1/ai/${task}`, {
        prompt: String(prompt || "").slice(0, 20000),
        history: (opts.history || []).slice(-8).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          text: String(item.text || "").slice(0, 4000),
        })),
        json_output: !!opts.json,
      }, { classification: `ai_${task}`, signal: opts.signal });
    } catch (error) { throw (window.ROOTS_ERRORS?.create?.(error?.code || "API_UNREACHABLE") || Object.assign(new Error("The assistant is unavailable."), { code: error?.code || "API_UNREACHABLE" })); }
    if (!response.ok) {
      // Generic message — don't reveal quota/billing/key details to the user.
      throw new Error("The assistant is temporarily unavailable. Please try again in a little while.");
    }
    const text = String(response.data?.text || "").trim();
    if (!text) throw new Error("The assistant didn't return a response. Try rephrasing.");
    return text;
  }

  /* ---------- public entry point ---------- */
  async function scan(file, profile, onProgress) {
    if (!file) throw new Error("No image to scan.");
    if (!apiBase()) {
      throw new Error("Label scanning is not configured for this build.");
    }
    return geminiScan(file, profile, "", onProgress);
  }

  window.BIJ_OCR = {
    extractLabel,
    localOcrAvailable,
    extractLocal: localExtract,
    translateIngredientList,
    explainEvidence,
    translateStructured,
    generateText,
    hasCloudKey: () => !!apiBase(),
  };
})();
