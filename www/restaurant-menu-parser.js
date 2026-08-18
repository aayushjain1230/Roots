(function (root) {
  "use strict";
  const Provider = root.ROOTS_MENU_PROVIDER;
  const SECTION_NAMES = /^(appetizers?|starters?|soups?|salads?|entr[eé]es?|main courses?|mains?|sides?|desserts?|drinks?|cocktails?|kids|specials?|combos?|build your own|add[- ]?ons?|sauces?|toppings?|breakfast|brunch|lunch|dinner)$/i;
  const ALLERGEN = /\b(contains|may contain|allerg(?:en|y)|gluten|peanut|tree nut|milk|egg|soy|wheat|sesame|fish|shellfish)\b/i;
  const DIETARY = /\b(vegan|vegetarian|halal|kosher|jain|gluten[- ]free|dairy[- ]free|plant[- ]based)\b/i;
  const FOOTNOTE = /^(\*+|note:|please note|consuming raw|ask your server)/i;
  const PRICE_END = /(?:\s+|^)(\$?\d{1,3}(?:\.\d{2})?)(?:\s*\/\s*(\$?\d{1,3}(?:\.\d{2})?))?\s*$/;
  let sequence = 0;
  const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const clean = (value, limit) => String(value ?? "").replace(/[ \t]+/g, " ").trim().slice(0, limit || 5000);
  const lines = (text) => String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => clean(line, 1000)).filter(Boolean);
  function price(display) {
    const match = clean(display, 80).match(PRICE_END);
    if (!match) return { amount: null, currency: "USD", display: "", unknown: true };
    const amount = Number(String(match[1]).replace("$", ""));
    return { amount: Number.isFinite(amount) ? amount : null, currency: "USD", display: match[0].trim(), unknown: !Number.isFinite(amount) };
  }
  function splitDish(line) {
    const match = line.match(PRICE_END);
    if (!match) return { name: line, price: price("") };
    return { name: clean(line.slice(0, match.index), 240), price: price(match[0]) };
  }
  function isHeading(line) {
    return SECTION_NAMES.test(line) || (line.length < 42 && line === line.toUpperCase() && /[A-Z]/.test(line) && !PRICE_END.test(line));
  }
  function translated(value) {
    if (value && typeof value === "object") return { original: clean(value.original, 5000), translation: clean(value.translation, 5000) || null, language: clean(value.language, 20) || "unknown" };
    return { original: clean(value, 5000), translation: null, language: "unknown" };
  }
  function dishFromLine(line, sectionId, order, pageId, method) {
    const parsed = splitDish(line);
    return {
      id: id("dish"), sectionId, order,
      nameOriginal: parsed.name || "Untitled dish", nameTranslated: null,
      descriptionOriginal: null, descriptionTranslated: null,
      price: parsed.price, sizes: [], modifiers: [], options: [],
      dietaryLabels: (line.match(new RegExp(DIETARY.source, "ig")) || []).map(clean),
      allergenLabels: (line.match(new RegExp(ALLERGEN.source, "ig")) || []).map(clean),
      menuNotes: [], sourcePageIds: pageId ? [pageId] : [],
      extraction: { method: method || "text", evidenceLevel: "likely", warnings: [] },
      ingredientEvidence: { complete: false, source: "menu_description" },
      userEdited: false, originalExtracted: null,
    };
  }
  function detectDuplicates(menu) {
    const exact = [], ambiguous = [], seen = new Map();
    menu.sections.forEach((section) => section.items.forEach((dish) => {
      const name = clean(dish.nameOriginal, 240).toLowerCase();
      const exactKey = `${menu.menuType}|${section.id}|${name}|${dish.price.display}`;
      const looseKey = `${menu.menuType}|${section.id}|${name}`;
      if (seen.has(exactKey)) exact.push([seen.get(exactKey), dish.id]);
      else {
        for (const [key, value] of seen) if (key.startsWith(`${menu.menuType}|${section.id}|${name}|`) && key !== exactKey) ambiguous.push([value, dish.id]);
        seen.set(exactKey, dish.id);
      }
      dish._duplicateKey = looseKey;
    }));
    return { exact, ambiguous };
  }
  function mergeExactDuplicates(menu) {
    const duplicate = detectDuplicates(menu);
    const remove = new Set(duplicate.exact.map((pair) => pair[1]));
    menu.sections.forEach((section) => {
      section.items = section.items.filter((dish) => !remove.has(dish.id));
      section.items.forEach((dish, index) => { dish.order = index; delete dish._duplicateKey; });
    });
    duplicate.ambiguous.forEach((pair) => menu.warnings.push({ code: "ambiguous_duplicate", message: "Similar dishes have different details and need review.", dishIds: pair }));
    return menu;
  }
  function normalizeMenu(raw) {
    const source = Provider?.normalizeSource(raw?.source) || Provider?.normalizeSource({
      restaurantId: raw?.restaurantId || "unknown", type: "manual_entry", title: raw?.title || "Menu", userImported: true,
    });
    const menu = {
      schemaVersion: 1,
      id: clean(raw?.id, 180) || id("menu"),
      restaurantId: clean(raw?.restaurantId || source?.restaurantId, 160),
      restaurantName: clean(raw?.restaurantName, 160),
      title: clean(raw?.title, 160) || "Menu",
      menuType: Provider?.MENU_TYPES.includes(raw?.menuType) ? raw.menuType : source?.menuType || "unknown",
      language: {
        original: clean(raw?.language?.original, 20) || "unknown",
        translatedTo: clean(raw?.language?.translatedTo, 20) || null,
        mixed: raw?.language?.mixed === true,
      },
      source, sections: [], footnotes: [], allergenNotes: [], dietaryLegend: [],
      warnings: Array.isArray(raw?.warnings) ? raw.warnings.slice(0, 100) : [],
      reviewedByUser: raw?.reviewedByUser === true,
      savedByUser: raw?.savedByUser === true,
      createdAt: raw?.createdAt || new Date().toISOString(),
      lastNormalizedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };
    (Array.isArray(raw?.sections) ? raw.sections : []).forEach((section, index) => {
      const sectionId = clean(section.id, 180) || id("section");
      const normalized = {
        id: sectionId, nameOriginal: clean(section.nameOriginal, 240) || "Menu",
        nameTranslated: clean(section.nameTranslated, 240) || null,
        descriptionOriginal: clean(section.descriptionOriginal, 1000) || null,
        descriptionTranslated: clean(section.descriptionTranslated, 1000) || null,
        order: index, items: [],
      };
      (Array.isArray(section.items) ? section.items : []).forEach((item, itemIndex) => {
        const dish = dishFromLine(item.nameOriginal || "Untitled dish", sectionId, itemIndex, null, item.extraction?.method);
        Object.assign(dish, item, { id: clean(item.id, 180) || dish.id, sectionId, order: itemIndex });
        dish.ingredientEvidence = {
          complete: item.ingredientEvidence?.complete === true || item.ingredientsComplete === true,
          source: clean(item.ingredientEvidence?.source, 80) || "menu_description",
        };
        dish.price = item.price && typeof item.price === "object" ? item.price : price(item.price?.display || "");
        normalized.items.push(dish);
      });
      menu.sections.push(normalized);
    });
    menu.footnotes = (raw?.footnotes || []).map((value) => clean(value, 1000)).filter(Boolean);
    menu.allergenNotes = (raw?.allergenNotes || []).map((value) => clean(value, 1000)).filter(Boolean);
    menu.dietaryLegend = (raw?.dietaryLegend || []).map((value) => clean(value, 500)).filter(Boolean);
    return mergeExactDuplicates(menu);
  }
  function parse(raw) {
    const original = translated(raw?.originalText ?? raw?.text ?? "");
    const translatedText = translated(raw?.translatedText ?? "");
    const inputLines = lines(original.original);
    const rawMenu = {
      restaurantId: raw?.restaurantId, restaurantName: raw?.restaurantName,
      title: raw?.title || "Menu", menuType: raw?.menuType || "unknown", source: raw?.source,
      language: { original: raw?.detectedLanguage || original.language, translatedTo: translatedText.original ? "en" : null, mixed: raw?.mixed === true },
      sections: [], warnings: Array.isArray(raw?.warnings) ? raw.warnings.slice() : [],
      footnotes: [], allergenNotes: [], dietaryLegend: [],
    };
    let section = null, lastDish = null;
    const addSection = (name) => {
      section = { id: id("section"), nameOriginal: name || "Menu", nameTranslated: null, order: rawMenu.sections.length, items: [] };
      rawMenu.sections.push(section); lastDish = null; return section;
    };
    inputLines.forEach((line, index) => {
      if (FOOTNOTE.test(line)) { rawMenu.footnotes.push(line); return; }
      if (ALLERGEN.test(line) && !PRICE_END.test(line) && (/^contains|^may contain|allerg/i.test(line))) { rawMenu.allergenNotes.push(line); return; }
      if (DIETARY.test(line) && /legend|symbol|\*=|means/i.test(line)) { rawMenu.dietaryLegend.push(line); return; }
      if (isHeading(line)) { addSection(line); return; }
      if (!section) addSection("Menu");
      const hasPrice = PRICE_END.test(line);
      const looksDescription = !hasPrice && lastDish && (line.length > 45 || /^[a-z]/.test(line) || /[,;]/.test(line));
      const modifier = /^(add|choice of|choose|served with|substitute|make it|toppings?|options?|sizes?)\b/i.test(line);
      if (modifier && lastDish) { lastDish.modifiers.push({ textOriginal: line, textTranslated: null }); return; }
      if (looksDescription) {
        lastDish.descriptionOriginal = clean([lastDish.descriptionOriginal, line].filter(Boolean).join(" "), 2000);
        return;
      }
      lastDish = dishFromLine(line, section.id, section.items.length, raw?.pageId, raw?.method || "text");
      if (!hasPrice) lastDish.extraction.warnings.push({ code: "price_missing", line: index + 1 });
      section.items.push(lastDish);
    });
    if (!inputLines.length) throw new TypeError("Menu text is empty.");
    if (!rawMenu.sections.some((item) => item.items.length)) rawMenu.warnings.push({ code: "no_dishes_found", message: "No dishes were found. Review the extracted text or add dishes manually." });
    return normalizeMenu(rawMenu);
  }
  root.ROOTS_MENU_PARSER = { parse, normalizeMenu, detectDuplicates, mergeExactDuplicates, splitDish, price, lines, isHeading };
})(typeof window !== "undefined" ? window : globalThis);
