(function (root) {
  "use strict";
  const R = root.ROOTS_RESTRICTIONS;
  const P = root.ROOTS_PROFILE;
  const C = root.ROOTS_RESTRICTION_CONFLICTS;
  if (!R || !P) return;
  const $ = (id) => document.getElementById(id);
  const modal = $("restrictionEditorModal");
  const body = $("restriction-editor-body");
  const title = $("restriction-editor-title");
  const back = $("restriction-editor-back");
  const status = $("restriction-editor-status");
  let draft = null;
  let page = { type: "home" };
  let returnFocus = null;
  let openedFromSettings = false;
  const settingOptions = {
    mode: ["elimination", "reintroduction", "personalized"],
    tolerance: ["unknown", "low", "moderate"],
    traceHandling: ["caution", "avoid", "ignore"],
    sharedEquipment: ["avoid", "caution", "ignore"],
    sharedFacility: ["avoid", "caution", "ignore"],
  };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const selectedIds = () => new Set(R.getSelected(draft).map((item) => item.id));
  const explicitSelected = (id) => draft.restrictions?.some((item) => item.id === id && item.enabled !== false);
  const legacySelected = (id) => R.getSelected(draft).some((item) => item.id === id && item.source === "legacy_profile");
  function summary() {
    const selected = R.getSelected(draft).map((item) => R.getRestriction(item.id)).filter(Boolean);
    const byCategory = new Map();
    selected.forEach((item) => {
      if (!byCategory.has(item.categoryId)) byCategory.set(item.categoryId, []);
      byCategory.get(item.categoryId).push(item.shortLabel);
    });
    return [...byCategory.entries()].map(([categoryId, labels]) => {
      const category = R.getCategories().find((item) => item.id === categoryId);
      return `<div><span>${esc(category.label)}</span><b>${esc(labels.slice(0, 3).join(", "))}${labels.length > 3 ? ` +${labels.length - 3}` : ""}</b></div>`;
    }).join("") || "<p>No restrictions selected yet.</p>";
  }
  function homePage() {
    const categories = R.getCategories();
    body.innerHTML = `<label class="restriction-search-label" for="restriction-search">Search restrictions</label>
      <input id="restriction-search" class="restriction-search" type="search" maxlength="100" autocomplete="off" placeholder="Try garlic, groundnut, lactose, or IBS">
      <div id="restriction-search-results" class="restriction-search-results" hidden></div>
      <section class="restriction-summary" aria-labelledby="restriction-summary-title"><h3 id="restriction-summary-title">Your profile</h3>${summary()}</section>
      <section class="restriction-categories" aria-labelledby="restriction-categories-title"><h3 id="restriction-categories-title">Categories</h3>
      ${categories.map((category) => {
        const count = R.getSelected(draft).filter((item) => R.getRestriction(item.id)?.categoryId === category.id).length;
        return `<button type="button" data-category="${esc(category.id)}"><span><b>${esc(category.label)}</b><small>${esc(category.description)}</small></span><span aria-label="${count} selected">${count || ""} ›</span></button>`;
      }).join("")}</section>`;
    $("restriction-search").focus();
  }
  function restrictionRow(item) {
    const selected = selectedIds().has(item.id);
    const inherited = legacySelected(item.id) && !explicitSelected(item.id);
    return `<button type="button" class="restriction-row" data-restriction="${esc(item.id)}" aria-pressed="${selected}">
      <span><b>${esc(item.label)}</b><small>${esc(item.description)}</small>${inherited ? '<em>Managed by your existing profile setting</em>' : ""}</span>
      <span>${selected ? "Selected" : "Add"} ›</span></button>`;
  }
  function categoryPage(categoryId) {
    const category = R.getCategories().find((item) => item.id === categoryId);
    const items = R.getRestrictions(categoryId);
    const selected = selectedIds();
    const ordered = [...items].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.subgroup.localeCompare(b.subgroup) || a.label.localeCompare(b.label));
    const groups = new Map();
    ordered.forEach((item) => {
      const group = selected.has(item.id) ? "Selected" : item.subgroup || "Available";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    });
    title.textContent = category.label;
    body.innerHTML = `<p class="restriction-category-description">${esc(category.description)}</p>
      <label class="restriction-search-label" for="restriction-category-search">Search in ${esc(category.label)}</label>
      <input id="restriction-category-search" class="restriction-search" type="search" maxlength="100">
      <div class="restriction-category-groups">${[...groups.entries()].map(([group, rows]) => `<section><h3>${esc(group)}</h3>${rows.map(restrictionRow).join("")}</section>`).join("")}</div>`;
  }
  function settingControl(key, value) {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    if (typeof value === "boolean") return `<label class="restriction-setting"><span>${esc(label)}</span><input type="checkbox" data-setting="${esc(key)}" ${value ? "checked" : ""}></label>`;
    if (typeof value === "number") return `<label class="restriction-setting"><span>${esc(label)}</span><input type="number" data-setting="${esc(key)}" value="${value}" min="0" max="10000"></label>`;
    if (Array.isArray(value)) {
      const available = key === "selectedTreeNuts"
        ? ["almond", "cashew", "walnut", "pistachio", "pecan", "hazelnut", "brazil_nut", "macadamia"]
        : [...new Set(value)];
      return `<fieldset class="restriction-setting restriction-setting-list"><legend>${esc(label)}</legend>${available.map((option) => `<label><input type="checkbox" data-array-setting="${esc(key)}" value="${esc(option)}" ${value.includes(option) ? "checked" : ""}> ${esc(option.replace(/_/g, " "))}</label>`).join("") || "<p>No options available.</p>"}</fieldset>`;
    }
    if (typeof value === "string") {
      const options = settingOptions[key] || [value];
      return `<label class="restriction-setting"><span>${esc(label)}</span><select data-setting="${esc(key)}">${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option.replace(/_/g, " "))}</option>`).join("")}</select></label>`;
    }
    return "";
  }
  function detailPage(id) {
    const item = R.getRestriction(id);
    const selected = explicitSelected(id);
    const inherited = legacySelected(id) && !selected;
    const current = draft.restrictions?.find((entry) => entry.id === id);
    const settings = { ...item.defaultSettings, ...(current?.settings || {}) };
    title.textContent = item.label;
    body.innerHTML = `<article class="restriction-detail"><p>${esc(item.description)}</p>
      <dl><div><dt>Type</dt><dd>${esc(item.type)}</dd></div><div><dt>Evidence</dt><dd>${item.quantitySensitive ? "Quantity dependent" : item.preparationSensitive ? "Preparation dependent" : item.certificationRelevant ? "Certification may be required" : "Ingredient and source evidence"}</dd></div></dl>
      ${inherited ? '<p class="restriction-inherited">This is already enabled through your existing profile controls. Use Edit basics to change that setting.</p>' : `<label class="restriction-toggle"><span>Use this restriction</span><input id="restriction-enabled" type="checkbox" ${selected ? "checked" : ""}></label>`}
      ${selected ? `<section class="restriction-settings"><h3>Settings</h3>${Object.entries(settings).map(([key, value]) => settingControl(key, value)).join("") || "<p>No additional settings.</p>"}</section>` : ""}
      <p class="restriction-safety-note">ROOTS uses deterministic rules. Unknown source, quantity, preparation, or certification evidence will not become Safe.</p></article>`;
  }
  function render() {
    back.hidden = page.type === "home";
    if (page.type === "home") { title.textContent = "Dietary Profile"; homePage(); }
    else if (page.type === "category") categoryPage(page.id);
    else detailPage(page.id);
    title.focus();
  }
  function renderSearch(query, categoryId) {
    const target = categoryId ? body.querySelector(".restriction-category-groups") : $("restriction-search-results");
    const results = R.search(query, categoryId ? { categoryId } : {});
    if (!query.trim()) {
      if (!categoryId) target.hidden = true;
      else categoryPage(categoryId);
      return;
    }
    target.hidden = false;
    target.innerHTML = results.length ? results.map(restrictionRow).join("") : '<p class="empty-state">No matching supported restrictions.</p>';
  }
  function open() {
    draft = P.clone(P.getActiveProfile() || P.createDefaultProfile({ onboardingComplete: true }));
    page = { type: "home" };
    returnFocus = document.activeElement;
    openedFromSettings = $("profileModal").style.display === "flex";
    $("profileModal").style.display = "none";
    $("profileModal").setAttribute("aria-hidden", "true");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("full-page-modal-open");
    document.querySelector(".app-main")?.setAttribute("inert", "");
    document.querySelector(".bottom-dock")?.setAttribute("inert", "");
    render();
  }
  function close(saved) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    if (saved) root.ROOTS_PROFILE_UI?.renderAppSummaries?.();
    if (openedFromSettings) {
      $("profileModal").style.display = "flex";
      $("profileModal").setAttribute("aria-hidden", "false");
    } else {
      document.body.classList.remove("full-page-modal-open");
      document.querySelector(".app-main")?.removeAttribute("inert");
      document.querySelector(".bottom-dock")?.removeAttribute("inert");
    }
    returnFocus?.focus?.();
  }
  body.addEventListener("input", (event) => {
    if (event.target.id === "restriction-search") renderSearch(event.target.value);
    if (event.target.id === "restriction-category-search") renderSearch(event.target.value, page.id);
  });
  body.addEventListener("change", (event) => {
    if (event.target.id === "restriction-enabled") {
      P.setRestriction(draft, page.id, event.target.checked);
      detailPage(page.id);
    }
    if (event.target.dataset.setting) {
      const current = draft.restrictions.find((item) => item.id === page.id);
      if (current) current.settings[event.target.dataset.setting] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "number" ? Number(event.target.value) : event.target.value;
    }
    if (event.target.dataset.arraySetting) {
      const current = draft.restrictions.find((item) => item.id === page.id);
      if (current) {
        current.settings[event.target.dataset.arraySetting] = [...body.querySelectorAll(`[data-array-setting="${event.target.dataset.arraySetting}"]:checked`)].map((input) => input.value);
      }
    }
  });
  body.addEventListener("click", (event) => {
    const category = event.target.closest("[data-category]");
    if (category) { page = { type: "category", id: category.dataset.category }; render(); return; }
    const restriction = event.target.closest("[data-restriction]");
    if (restriction) { page = { type: "restriction", id: restriction.dataset.restriction }; render(); }
  });
  back.addEventListener("click", () => {
    page = page.type === "restriction" ? { type: "category", id: R.getRestriction(page.id).categoryId } : { type: "home" };
    render();
  });
  $("restriction-editor-close").addEventListener("click", () => close(false));
  $("restriction-editor-cancel").addEventListener("click", () => close(false));
  $("restriction-editor-save").addEventListener("click", () => {
    const conflicts = C?.detectConflicts(draft) || [];
    draft = P.saveActiveProfile(draft);
    localStorage.setItem("roots-restriction-review-v1", new Date().toISOString());
    status.textContent = conflicts.length ? `Saved. ${conflicts.length} overlapping selection${conflicts.length === 1 ? "" : "s"} will remain active and visible in results.` : "Profile saved.";
    close(true);
  });
  $("open-restriction-editor")?.addEventListener("click", open);
  root.ROOTS_PROFILE_EDITOR = {
    open,
    openCategory(categoryId) { open(); page = { type: "category", id: categoryId }; render(); },
    openRestriction(restrictionId) { open(); page = { type: "restriction", id: restrictionId }; render(); },
    search: (query) => R.search(query),
    add(id) { P.setRestriction(draft, id, true); },
    remove(id) { P.setRestriction(draft, id, false); },
    updateSettings(id, settings) { P.setRestriction(draft, id, true, settings); },
    save() { draft = P.saveActiveProfile(draft); return P.clone(draft); },
    cancel() { close(false); },
  };
})(typeof window !== "undefined" ? window : globalThis);
