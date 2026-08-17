(function (root) {
  "use strict";
  const Importer = root.ROOTS_MENU_IMPORT, Storage = root.ROOTS_MENU_STORAGE, Parser = root.ROOTS_MENU_PARSER, MenuProvider = root.ROOTS_MENU_PROVIDER;
  const $ = (id) => typeof document === "undefined" ? null : document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let restaurant = null, menu = null, returnFocus = null, initialized = false, discoveredSources = [];
  function modal(open) {
    const element = $("menu-import-modal");
    if (!element) return;
    element.setAttribute("aria-hidden", open ? "false" : "true");
    element.classList.toggle("open", open);
    if (!open) {
      Importer.cleanup();
      returnFocus?.focus?.();
    }
  }
  function announce(message) { const el = $("menu-import-status"); if (el) el.textContent = message || ""; }
  function start(type) {
    Importer.begin(restaurant, type, { title: `${restaurant.name} Menu`, menuType: $("menu-type")?.value || "unknown" });
  }
  function renderPages() {
    const target = $("menu-page-list"), session = Importer.getSession();
    if (!target) return;
    target.innerHTML = session?.pages?.length ? session.pages.map((page, index) => `<li class="menu-page-card" data-menu-page="${esc(page.id)}">
      <span class="menu-page-number">Page ${index + 1}</span>
      <span class="menu-page-name">${esc(page.hasFile ? "Menu image ready" : "Menu page")}</span>
      <span class="menu-page-actions">
        <button type="button" data-page-action="up" aria-label="Move page ${index + 1} up" ${index === 0 ? "disabled" : ""}>Up</button>
        <button type="button" data-page-action="down" aria-label="Move page ${index + 1} down" ${index === session.pages.length - 1 ? "disabled" : ""}>Down</button>
        <button type="button" data-page-action="delete" aria-label="Delete page ${index + 1}">Delete</button>
      </span></li>`).join("") : `<li class="restaurant-empty-small">No menu pages selected.</li>`;
    announce(`${session?.pages?.length || 0} menu page${session?.pages?.length === 1 ? "" : "s"} ready.`);
  }
  function issueCount(value) {
    return (value?.warnings?.length || 0) + (value?.sections || []).reduce((sum, section) => sum + section.items.filter((dish) => dish.extraction?.warnings?.length).length, 0);
  }
  function renderEditor() {
    const target = $("menu-review-editor");
    if (!target || !menu) return;
    const freshness = Storage.getFreshness(menu);
    $("menu-review-title").textContent = menu.title;
    $("menu-source-summary").textContent = `${menu.source.official ? "Official" : "User-provided"} ${menu.source.type.replaceAll("_", " ")} · ${freshness.label}`;
    $("menu-review-issues").textContent = `${issueCount(menu)} review issue${issueCount(menu) === 1 ? "" : "s"}. Menu labels are preserved as unverified source evidence.`;
    target.innerHTML = menu.sections.map((section, sectionIndex) => `<section class="menu-editor-section" data-section-id="${esc(section.id)}">
      <div class="menu-editor-section-head">
        <label>Section name<input data-field="section-name" value="${esc(section.nameOriginal)}" maxlength="240"></label>
        <button type="button" data-editor-action="add-dish">Add dish</button>
      </div>
      <div class="menu-editor-dishes">${section.items.map((dish) => `<article class="menu-editor-dish" data-dish-id="${esc(dish.id)}">
        <label>Dish name<input data-field="dish-name" value="${esc(dish.nameOriginal)}" maxlength="240"></label>
        <label>Description<textarea data-field="dish-description" maxlength="2000">${esc(dish.descriptionOriginal || "")}</textarea></label>
        <label>Price<input data-field="dish-price" value="${esc(dish.price?.display || "")}" maxlength="80"></label>
        <div class="menu-evidence-row"><span>Extraction: ${esc(dish.extraction?.evidenceLevel || "likely")}</span>${dish.dietaryLabels?.length ? `<span>Menu label: ${esc(dish.dietaryLabels.join(", "))} (unverified)</span>` : ""}</div>
        <div class="menu-editor-actions">
          <button type="button" data-editor-action="dish-up">Move up</button>
          <button type="button" data-editor-action="dish-down">Move down</button>
          <button type="button" data-editor-action="restore">Restore extracted</button>
          <button type="button" data-editor-action="delete-dish">Delete</button>
        </div></article>`).join("")}</div>
      ${sectionIndex === menu.sections.length - 1 ? `<button type="button" class="secondary-btn" data-editor-action="add-section">Add section</button>` : ""}
    </section>`).join("");
  }
  async function open(value, trigger) {
    restaurant = { id: String(value?.id || ""), name: String(value?.name || "Restaurant").slice(0, 160) };
    if (!restaurant.id) return;
    returnFocus = trigger || document.activeElement;
    const saved = Storage.getByRestaurant(restaurant.id);
    menu = saved[0] || null;
    discoveredSources = [];
    $("menu-import-heading").textContent = menu ? `Menu for ${restaurant.name}` : `Add menu for ${restaurant.name}`;
    $("menu-source-actions").hidden = !!menu;
    $("menu-capture-panel").hidden = true;
    $("menu-text-panel").hidden = true;
    $("menu-manual-panel").hidden = true;
    $("menu-review-panel").hidden = !menu;
    if (menu) renderEditor();
    modal(true);
    $("menu-modal-close")?.focus();
    if (!menu) {
      announce("Checking for an available menu source…");
      try {
        discoveredSources = await MenuProvider.findSources(restaurant);
        const best = discoveredSources[0];
        announce(best ? `${best.official ? "Official" : "Provider"} source found: ${best.title}. Choose Try Online Menu Again to retrieve it, or import your copy.` : "No online menu source was found. Choose an import option.");
      } catch (error) {
        announce(error.code === "requires_backend_proxy" ? "The online menu requires the future secure backend proxy. Choose an import option." : "Online menu discovery is unavailable. Choose an import option.");
      }
    }
  }
  function review(value) {
    menu = Parser.normalizeMenu(value);
    $("menu-source-actions").hidden = true;
    $("menu-capture-panel").hidden = true;
    $("menu-text-panel").hidden = true;
    $("menu-manual-panel").hidden = true;
    $("menu-review-panel").hidden = false;
    renderEditor();
    $("menu-review-title")?.focus();
  }
  function updateField(input) {
    const sectionEl = input.closest("[data-section-id]"), dishEl = input.closest("[data-dish-id]");
    const section = menu.sections.find((item) => item.id === sectionEl?.dataset.sectionId);
    const dish = section?.items.find((item) => item.id === dishEl?.dataset.dishId);
    if (input.dataset.field === "section-name" && section) section.nameOriginal = input.value.trim() || "Menu";
    if (!dish) return;
    if (!dish.originalExtracted) dish.originalExtracted = { nameOriginal: dish.nameOriginal, descriptionOriginal: dish.descriptionOriginal, price: { ...dish.price } };
    if (input.dataset.field === "dish-name") dish.nameOriginal = input.value.trim() || "Untitled dish";
    if (input.dataset.field === "dish-description") dish.descriptionOriginal = input.value.trim() || null;
    if (input.dataset.field === "dish-price") dish.price = Parser.price(input.value);
    dish.userEdited = true;
  }
  function addDish(sectionId, data) {
    const section = menu.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const fresh = Parser.normalizeMenu({ restaurantId: menu.restaurantId, source: menu.source, sections: [{ nameOriginal: section.nameOriginal, items: [{ nameOriginal: data?.nameOriginal || "New dish", userEdited: true, extraction: { method: "manual", evidenceLevel: "user_entered", warnings: [] } }] }] }).sections[0].items[0];
    fresh.sectionId = section.id; fresh.order = section.items.length; section.items.push(fresh); renderEditor();
  }
  function deleteDish(dishId) {
    menu.sections.forEach((section) => { section.items = section.items.filter((dish) => dish.id !== dishId); section.items.forEach((dish, index) => { dish.order = index; }); });
    renderEditor();
  }
  function restoreField(dishId) {
    menu.sections.forEach((section) => section.items.forEach((dish) => {
      if (dish.id === dishId && dish.originalExtracted) Object.assign(dish, dish.originalExtracted, { originalExtracted: null, userEdited: false });
    }));
    renderEditor();
  }
  function mergeDuplicates(ids) {
    if (!Array.isArray(ids) || ids.length < 2) return false;
    const keep = ids[0], remove = new Set(ids.slice(1));
    menu.sections.forEach((section) => { section.items = section.items.filter((dish) => !remove.has(dish.id)); });
    menu.warnings = menu.warnings.filter((warning) => !warning.dishIds?.includes(keep));
    renderEditor(); return true;
  }
  function editorAction(button) {
    const sectionEl = button.closest("[data-section-id]"), dishEl = button.closest("[data-dish-id]");
    const section = menu.sections.find((item) => item.id === sectionEl?.dataset.sectionId), dishId = dishEl?.dataset.dishId;
    const action = button.dataset.editorAction;
    if (action === "add-dish") addDish(section.id);
    if (action === "delete-dish") deleteDish(dishId);
    if (action === "restore") restoreField(dishId);
    if (["dish-up", "dish-down"].includes(action) && section) {
      const index = section.items.findIndex((dish) => dish.id === dishId), target = action === "dish-up" ? index - 1 : index + 1;
      if (target >= 0 && target < section.items.length) [section.items[index], section.items[target]] = [section.items[target], section.items[index]];
      section.items.forEach((dish, order) => { dish.order = order; }); renderEditor();
    }
    if (action === "add-section") {
      const normalized = Parser.normalizeMenu({ restaurantId: menu.restaurantId, source: menu.source, sections: [{ nameOriginal: "New section", items: [] }] }).sections[0];
      normalized.order = menu.sections.length; menu.sections.push(normalized); renderEditor();
    }
  }
  function saveChanges() {
    menu.reviewedByUser = true; menu.savedByUser = true;
    menu = Storage.save(menu);
    announce("Menu saved on this device.");
    modal(false); return menu;
  }
  function bind() {
    $("menu-modal-close")?.addEventListener("click", () => modal(false));
    $("menu-import-modal")?.addEventListener("click", (event) => { if (event.target.id === "menu-import-modal") modal(false); });
    document.addEventListener("keydown", (event) => {
      const openModal = $("menu-import-modal")?.classList.contains("open");
      if (event.key === "Escape" && openModal) { modal(false); return; }
      if (event.key === "Tab" && openModal) {
        const controls = [...$("menu-import-modal").querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")].filter((item) => !item.closest("[hidden]"));
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
      }
    });
    $("menu-source-actions")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-menu-import]")?.dataset.menuImport;
      if (!action) return;
      if (["images", "camera", "screenshot"].includes(action)) {
        start(action === "camera" ? "user_camera" : action === "screenshot" ? "user_screenshot" : "user_image");
        $("menu-capture-panel").hidden = false; $("menu-source-actions").hidden = true;
        if (action === "camera") $("menu-camera-input").click(); else $("menu-image-input").click();
      }
      if (action === "pdf") { start("user_pdf"); $("menu-pdf-input").click(); }
      if (action === "text") { start("user_text"); $("menu-text-panel").hidden = false; $("menu-source-actions").hidden = true; $("menu-text-input").focus(); }
      if (action === "manual") { start("manual_entry"); $("menu-manual-panel").hidden = false; $("menu-source-actions").hidden = true; $("menu-manual-name").focus(); }
      if (action === "online") {
        const best = discoveredSources[0];
        if (!best) { announce("No directly accessible menu source was found. A blocked website may require the future secure backend proxy; choose another import option."); return; }
        announce(`Retrieving ${best.title}…`);
        MenuProvider.fetchSource(best).then((result) => {
          if (result?.schemaVersion || result?.sections) review(Parser.normalizeMenu({ ...result, restaurantId: restaurant.id, restaurantName: restaurant.name, source: best }));
          else review(Parser.parse({ restaurantId: restaurant.id, restaurantName: restaurant.name, title: best.title, menuType: best.menuType, source: best, originalText: result?.extractedText || result?.text || result?.rawContent || "", method: best.type.endsWith("_structured") ? "provider" : "remote_text" }));
        }).catch((error) => announce(error.code === "requires_backend_proxy" ? "This source requires the future secure backend proxy. Choose images, PDF, text, or manual entry." : "The online menu could not be retrieved. Retry or choose another import option."));
      }
    });
    const addFiles = (files, sourceType) => {
      const queue = [...files];
      const next = () => {
        const file = queue.shift();
        if (!file) { renderPages(); return; }
        if (!root.ROOTS_IMAGE_REVIEW?.open) {
          try { Importer.addPage(file, { sourceType }); next(); } catch (error) { announce(error.message); }
          return;
        }
        root.ROOTS_IMAGE_REVIEW.open(file, {
          mode: "menu", sourceType,
          onUse(workingFile, metadata) {
            try { Importer.addPage(workingFile, { sourceType, rotation: metadata?.rotation, crop: metadata?.crop }); next(); }
            catch (error) { announce(error.message); }
          },
          onCancel() { announce("Menu page review canceled. You can add it again or continue with the current pages."); renderPages(); },
          onReplace() { announce("Choose a replacement menu page."); $("menu-image-input").click(); },
          onRetake() { announce("Retake the menu page."); $("menu-camera-input").click(); },
        });
      };
      next();
    };
    $("menu-image-input")?.addEventListener("change", (event) => { addFiles(event.target.files, "image"); event.target.value = ""; });
    $("menu-camera-input")?.addEventListener("change", (event) => { addFiles(event.target.files, "camera"); event.target.value = ""; });
    $("menu-add-page")?.addEventListener("click", () => $("menu-image-input").click());
    $("menu-pdf-input")?.addEventListener("change", async (event) => {
      try { review(await Importer.importPdf(event.target.files[0])); }
      catch (error) { announce(error.message); }
      event.target.value = "";
    });
    $("menu-page-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page-action]"), card = button?.closest("[data-menu-page]");
      if (!button || !card) return;
      if (button.dataset.pageAction === "delete") Importer.removePage(card.dataset.menuPage);
      else Importer.movePage(card.dataset.menuPage, button.dataset.pageAction);
      renderPages();
    });
    $("menu-finish-pages")?.addEventListener("click", async () => {
      const button = $("menu-finish-pages"); button.disabled = true;
      try { review(await Importer.finish({ onProgress: ({ current, total }) => announce(`Reading menu page ${current} of ${total}.`) })); }
      catch (error) { announce(`${error.message} You can retry, remove the page, or cancel.`); }
      finally { button.disabled = false; }
    });
    $("menu-use-text")?.addEventListener("click", () => { try { review(Importer.importText($("menu-text-input").value, { menuType: $("menu-type").value })); } catch (error) { announce(error.message); } });
    $("menu-use-manual")?.addEventListener("click", () => { try { review(Importer.importManual({ name: $("menu-manual-name").value, description: $("menu-manual-description").value, price: $("menu-manual-price").value, menuType: $("menu-type").value })); } catch (error) { announce(error.message); } });
    $("menu-review-editor")?.addEventListener("input", (event) => { if (event.target.dataset.field) updateField(event.target); });
    $("menu-review-editor")?.addEventListener("click", (event) => { const button = event.target.closest("[data-editor-action]"); if (button) editorAction(button); });
    $("menu-save")?.addEventListener("click", saveChanges);
    $("menu-delete")?.addEventListener("click", () => { if (menu) Storage.remove(menu.id); menu = null; modal(false); });
  }
  function init() { if (initialized || !$("menu-import-modal")) return; initialized = true; bind(); }
  root.ROOTS_MENU_REVIEW = { init, open, review, saveChanges, restoreField, deleteDish, addDish, mergeDuplicates, issueCount, getMenu: () => menu };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
