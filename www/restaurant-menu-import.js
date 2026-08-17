(function (root) {
  "use strict";
  const Provider = root.ROOTS_MENU_PROVIDER, OCR = root.ROOTS_MENU_OCR, Parser = root.ROOTS_MENU_PARSER;
  const LIMITS = Object.freeze({ pages: 12, imageBytes: 12 * 1024 * 1024, pdfBytes: 20 * 1024 * 1024, textChars: 100000 });
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  let current = null, sequence = 0;
  const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const clone = () => current ? { ...current, pages: current.pages.map(({ file, ...page }) => ({ ...page, hasFile: !!file })) } : null;
  function source(restaurant, type, overrides) {
    return Provider.normalizeSource({
      id: makeId("source"), restaurantId: restaurant.id, type, title: overrides?.title || "Imported Menu",
      provider: "user", language: "unknown", menuType: overrides?.menuType || "unknown",
      retrievedAt: new Date().toISOString(), official: false, trusted: false, userImported: true,
      contentType: overrides?.contentType || "", status: "available",
    });
  }
  function begin(restaurant, sourceType, options) {
    if (!restaurant?.id || !restaurant?.name) throw new TypeError("Restaurant identity is required.");
    cleanup();
    current = { id: makeId("menu-session"), restaurant: { id: String(restaurant.id), name: String(restaurant.name).slice(0, 160) }, source: source(restaurant, sourceType || "user_image", options), pages: [], status: "capturing", createdAt: new Date().toISOString() };
    return clone();
  }
  function requireSession() { if (!current) throw new Error("Start a menu import first."); return current; }
  function validateImage(file) {
    if (!file || !IMAGE_TYPES.has(String(file.type).toLowerCase())) { const error = new TypeError("Choose a JPEG, PNG, WebP, HEIC, or HEIF menu image."); error.code = "invalid_image_type"; throw error; }
    if (file.size > LIMITS.imageBytes) { const error = new RangeError("Each menu image must be 12 MB or smaller."); error.code = "image_too_large"; throw error; }
  }
  function addPage(file, metadata) {
    const session = requireSession();
    if (session.pages.length >= LIMITS.pages) { const error = new RangeError(`A menu import can contain up to ${LIMITS.pages} pages.`); error.code = "page_limit"; throw error; }
    validateImage(file);
    const page = {
      id: makeId("page"), file, sourceType: metadata?.sourceType || "image", order: session.pages.length,
      rotation: [0, 90, 180, 270].includes(metadata?.rotation) ? metadata.rotation : 0,
      crop: metadata?.crop && typeof metadata.crop === "object" ? { ...metadata.crop } : null,
      warnings: [], objectUrl: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "",
    };
    session.pages.push(page); return { ...page, file: undefined };
  }
  function removePage(pageId) {
    const session = requireSession(), page = session.pages.find((item) => item.id === pageId);
    if (page?.objectUrl) URL.revokeObjectURL?.(page.objectUrl);
    session.pages = session.pages.filter((item) => item.id !== pageId);
    session.pages.forEach((item, index) => { item.order = index; });
    return clone();
  }
  function replacePage(pageId, file, metadata) {
    validateImage(file);
    const session = requireSession(), page = session.pages.find((item) => item.id === pageId);
    if (!page) throw new Error("Menu page was not found.");
    if (page.objectUrl) URL.revokeObjectURL?.(page.objectUrl);
    Object.assign(page, { file, objectUrl: URL.createObjectURL?.(file) || "", rotation: metadata?.rotation || 0, crop: metadata?.crop || null, warnings: [] });
    return clone();
  }
  function reorderPages(order) {
    const session = requireSession();
    if (!Array.isArray(order) || order.length !== session.pages.length || new Set(order).size !== order.length) throw new TypeError("Page order is invalid.");
    const map = new Map(session.pages.map((page) => [page.id, page]));
    if (order.some((pageId) => !map.has(pageId))) throw new TypeError("Page order is invalid.");
    session.pages = order.map((pageId, index) => Object.assign(map.get(pageId), { order: index }));
    return clone();
  }
  function movePage(pageId, direction) {
    const session = requireSession(), index = session.pages.findIndex((page) => page.id === pageId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= session.pages.length) return clone();
    [session.pages[index], session.pages[target]] = [session.pages[target], session.pages[index]];
    session.pages.forEach((page, pageIndex) => { page.order = pageIndex; });
    return clone();
  }
  async function importPdf(file, options) {
    const session = requireSession();
    if (!file || String(file.type).toLowerCase() !== "application/pdf") { const error = new TypeError("Choose a valid PDF menu."); error.code = "invalid_pdf_type"; throw error; }
    if (file.size > LIMITS.pdfBytes) { const error = new RangeError("PDF menus must be 20 MB or smaller."); error.code = "pdf_too_large"; throw error; }
    const header = new Uint8Array((await file.slice(0, 5).arrayBuffer()));
    if (String.fromCharCode(...header) !== "%PDF-") { const error = new TypeError("This PDF appears to be malformed."); error.code = "malformed_pdf"; throw error; }
    if (options?.embeddedText) return importText(options.embeddedText, { ...options, sourceType: "user_pdf", contentType: "application/pdf" });
    const error = new Error("This PDF has no locally available embedded text. Image-page rendering needs the planned, audited local PDF adapter; choose menu images or paste text instead.");
    error.code = "pdf_processing_unavailable"; error.recoverable = true; throw error;
  }
  function importText(text, options) {
    const session = requireSession(), value = String(text ?? "").replace(/\r\n?/g, "\n").trim();
    if (!value) { const error = new TypeError("Paste menu text before continuing."); error.code = "empty_text"; throw error; }
    if (value.length > LIMITS.textChars) { const error = new RangeError("Menu text must be 100,000 characters or fewer."); error.code = "text_too_large"; throw error; }
    session.source = source(session.restaurant, options?.sourceType || "user_text", options);
    session.status = "review";
    return Parser.parse({ restaurantId: session.restaurant.id, restaurantName: session.restaurant.name, title: options?.title || "Imported Menu", menuType: options?.menuType, source: session.source, originalText: value, method: options?.sourceType === "manual_entry" ? "manual" : "text" });
  }
  function importManual(data) {
    const session = requireSession(), name = String(data?.name || "").trim().slice(0, 240);
    if (!name) { const error = new TypeError("Enter a dish name."); error.code = "dish_name_required"; throw error; }
    return Parser.normalizeMenu({
      restaurantId: session.restaurant.id, restaurantName: session.restaurant.name, title: data?.title || "Manual Menu",
      menuType: data?.menuType || "unknown", source: source(session.restaurant, "manual_entry", data),
      sections: [{ nameOriginal: data?.section || "Menu", items: [{ nameOriginal: name, descriptionOriginal: String(data?.description || "").slice(0, 2000), price: Parser.price(String(data?.price || "")), extraction: { method: "manual", evidenceLevel: "user_entered", warnings: [] }, userEdited: true }] }],
      reviewedByUser: true,
    });
  }
  async function finish(options) {
    const session = requireSession();
    if (!session.pages.length) { const error = new Error("Add at least one menu page before finishing."); error.code = "no_pages"; throw error; }
    if (session.status === "processing") { const error = new Error("This menu is already being processed."); error.code = "duplicate_finish"; throw error; }
    session.status = "processing";
    try {
      const results = await OCR.processPages(session.pages, options);
      const combined = results.map((result) => result.originalText).join("\n\n");
      const translation = results.map((result) => result.translatedText).filter(Boolean).join("\n\n");
      session.status = "review";
      return Parser.parse({
        restaurantId: session.restaurant.id, restaurantName: session.restaurant.name, title: session.source.title,
        menuType: session.source.menuType, source: session.source, originalText: combined, translatedText: translation,
        detectedLanguage: results[0]?.detectedLanguage, mixed: results.some((result) => result.secondaryLanguages.length),
        warnings: results.flatMap((result) => result.warnings), method: "ocr",
      });
    } catch (error) { session.status = "failed"; throw error; }
  }
  function cleanup() {
    current?.pages?.forEach((page) => { if (page.objectUrl) URL.revokeObjectURL?.(page.objectUrl); });
    current = null;
  }
  root.ROOTS_MENU_IMPORT = {
    LIMITS, begin, addPage, removePage, replacePage, reorderPages, movePage, importPdf, importText, importManual, finish, cleanup, getSession: clone,
  };
})(typeof window !== "undefined" ? window : globalThis);
