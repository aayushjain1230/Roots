(function (root) {
  "use strict";
  const loaded = new Set(), inflight = new Map();
  const GROUPS = Object.freeze({
    assistant: ["recipe-meal-engine.js", "assistant.js"],
    saved: ["shopping.js"],
    restaurants: [
      "restaurant-provider.js", "restaurant-storage.js", "restaurant-search.js", "restaurant-menu-provider.js",
      "restaurant-menu-parser.js", "restaurant-menu-storage.js", "restaurant-menu-ocr.js", "restaurant-menu-import.js",
      "restaurant-menu-review.js", "restaurant-modifier-engine.js", "restaurant-cross-contact.js", "restaurant-evidence-engine.js",
      "restaurant-compatibility-report.js", "restaurant-report-ui.js", "restaurant-ranking.js",
      "restaurant-ranking-storage.js", "restaurant-comparison.js", "restaurant-meal-engine.js",
      "restaurant-meal-storage.js", "restaurant-order-history.js", "restaurant-memory-search.js",
      "restaurant-order-recheck.js", "restaurant-question-engine.js", "restaurant-question-storage.js",
      "restaurant-question-translation.js", "restaurant-question-actions.js", "restaurant-communication-view.js",
      "restaurant-dining-assistant.js", "restaurant-dining-card.js", "restaurant-ingredient-explorer.js",
      "restaurant-dining-assistant-view.js", "restaurant-memory-view.js", "restaurant-order-builder.js",
      "restaurant-detail-view.js", "restaurant-results-view.js", "restaurant-ui.js",
    ],
    travel: ["travel-storage.js", "travel-glossary.js", "travel-speech.js", "travel-language-packs.js", "travel-mode.js", "travel-card-view.js"],
  });
  document.querySelectorAll("script[src]").forEach((node) => loaded.add(new URL(node.src, location.href).pathname.split("/").pop()));
  function loadScript(file) {
    if (loaded.has(file)) return Promise.resolve(file);
    if (inflight.has(file)) return inflight.get(file);
    const task = root.ROOTS_PERFORMANCE?.startTask?.("feature_script", { source: file });
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = file; script.async = false;
      script.onload = () => { loaded.add(file); root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "loaded" }); resolve(file); };
      script.onerror = () => { root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "error" }); reject(Object.assign(new Error(`Could not load ${file}.`), { code: "FEATURE_LOAD_FAILED" })); };
      document.head.appendChild(script);
    }).finally(() => inflight.delete(file));
    inflight.set(file, promise);
    return promise;
  }
  async function loadGroup(name) {
    const files = GROUPS[name];
    if (!files) throw new TypeError("Unknown feature group.");
    for (const file of files) await loadScript(file);
    document.documentElement.dataset[`feature${name[0].toUpperCase()}${name.slice(1)}`] = "loaded";
    return files.slice();
  }
  async function ensureForView(viewId) {
    if (["assistantView", "askRootsView", "recipeView", "mealsView"].includes(viewId)) return loadGroup("assistant");
    if (viewId === "restaurantsView") return loadGroup("restaurants");
    if (viewId === "savedView") { await loadGroup("restaurants"); return loadGroup("saved"); }
    return [];
  }
  function preload(name) {
    const schedule = root.requestIdleCallback || ((callback) => setTimeout(callback, 250));
    schedule(() => loadGroup(name).catch(() => {}), { timeout: 2500 });
  }
  document.addEventListener("pointerover", (event) => {
    const view = event.target.closest?.("[data-view]")?.dataset.view;
    if (view === "restaurantsView") preload("restaurants");
    else if (view === "savedView") preload("saved");
    else if (view === "assistantView") preload("assistant");
  }, { passive: true });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-open-travel-mode]");
    if (!button || root.ROOTS_TRAVEL_VIEW) return;
    event.preventDefault(); event.stopImmediatePropagation();
    button.disabled = true;
    try {
      await loadGroup("restaurants");
      await loadGroup("travel");
      root.ROOTS_TRAVEL_VIEW?.open?.(button, {});
    } finally { button.disabled = false; }
  }, true);
  root.ROOTS_FEATURES = { groups: GROUPS, loadScript, loadGroup, ensureForView, preload, loaded: () => [...loaded], inflightCount: () => inflight.size };
  document.documentElement.dataset.featureLoader = "ready";
})(typeof window !== "undefined" ? window : globalThis);
