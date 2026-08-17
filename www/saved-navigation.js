(function (root) {
  "use strict";
  const KEY = "roots-saved-category-v1";
  const categories = ["products", "restaurants", "meals", "activity"];
  let current = "products";

  function normalize(value) { return categories.includes(value) ? value : "products"; }
  function select(category, options = {}) {
    current = normalize(category);
    document.querySelectorAll("[data-saved-category]").forEach((tab) => {
      const active = tab.dataset.savedCategory === current;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-saved-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.savedPanel !== current;
    });
    if (options.remember !== false) sessionStorage.setItem(KEY, current);
    if (options.focus) document.querySelector(`[data-saved-category="${current}"]`)?.focus();
    document.dispatchEvent(new CustomEvent("roots:savedcategorychange", { detail: { category: current } }));
  }
  function move(tab, delta) {
    const index = categories.indexOf(tab.dataset.savedCategory);
    select(categories[(index + delta + categories.length) % categories.length], { focus: true });
  }
  function init() {
    const tabs = document.querySelector(".saved-category-tabs");
    if (!tabs) return;
    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-saved-category]");
      if (tab) select(tab.dataset.savedCategory);
    });
    tabs.addEventListener("keydown", (event) => {
      const tab = event.target.closest("[data-saved-category]");
      if (!tab) return;
      if (event.key === "ArrowRight") { event.preventDefault(); move(tab, 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); move(tab, -1); }
      if (event.key === "Home") { event.preventDefault(); select("products", { focus: true }); }
      if (event.key === "End") { event.preventDefault(); select("activity", { focus: true }); }
    });
    document.getElementById("savedView")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-empty-view]");
      if (action) document.querySelector(`.dock-btn[data-view="${action.dataset.emptyView}"]`)?.click();
    });
    document.addEventListener("roots:viewchange", (event) => {
      if (event.detail?.viewId === "savedView") select(sessionStorage.getItem(KEY), { remember: false });
    });
    select(sessionStorage.getItem(KEY), { remember: false });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  root.ROOTS_SAVED_NAVIGATION = Object.freeze({ select, getCurrent: () => current, categories: categories.slice() });
})(window);
