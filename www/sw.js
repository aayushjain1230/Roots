/* Static app-shell cache only. Provider API and personal data are network-only.
   Supersedes roots-shell-v6b-1 / roots-shell-v6a-1 / roots-shell-v5d-1 / roots-shell-v5c-1 and
   roots-features-v6a-1 / roots-features-v5d-1 / roots-features-v5a-1 after activation. */
const CACHE = "roots-shell-release-v18";
const FEATURE_CACHE = "roots-features-release-v18";
const SHELL = [
  "./",
  "./index.html",
  "./protocol-guard.js",
  "./styles.css",
  "./design-system.css",
  "./home.css",
  "./brand.js",
  "./product-metrics.js",
  "./trust-governance.js",
  "./launch-growth.js",
  "./evidence-model.js",
  "./effective-rules.js",
  "./decision-engine.js",
  "./resolution-engine.js",
  "./ask-roots-context.js",
  "./dietary-feature-availability.js",
  "./restriction-definitions.js",
  "./restriction-taxonomy.js",
  "./restriction-conflicts.js",
  "./rule-trace.js",
  "./theme.js",
  "./ui-system.js",
  "./saved-navigation.js",
  "./performance-monitor.js",
  "./connectivity.js",
  "./error-taxonomy.js",
  "./install-id.js",
  "./sync-queue.js",
  "./network-client.js",
  "./runtime-config.js",
  "./bootstrap.js",
  "./feature-loader.js",
  "./profile-definitions.js",
  "./jain/jain-profile.js",
  "./jain/jain-sources.js",
  "./jain/jain-rules.js",
  "./jain/jain-knowledge.js",
  "./jain/jain-calendar.js",
  "./jain/jain-observances.js",
  "./jain/jain-effective-profile.js",
  "./jain/jain-reliability.js",
  "./jain/jain-ingredients.js",
  "./jain/jain-search.js",
  "./jain/jain-theme.js",
  "./jain/jain-offline.js",
  "./jain/jain.js",
  "./profile.js",
  "./profile-ui.js",
  "./profile-editor.js",
  "./ingredient-knowledge.js",
  "./offline-knowledge.js",
  "./ingredient-parser.js",
  "./dietary-rules.js",
  "./formulation-tracker.js",
  "./offline-status.js",
  "./scan-pipeline.js",
  "./local-ocr-provider.js",
  "./ocr.js",
  "./foodfacts.js",
  "./online-enrichment.js",
  "./home-animation.js",
  "./camera-capture.js",
  "./image-review.js",
  "./scan-processing.js",
  "./report-actions.js",
  "./explanation-context.js",
  "./verification-questions.js",
  "./explanation-templates.js",
  "./explanation-cache.js",
  "./alternative-suggestions.js",
  "./explanation-translation.js",
  "./explanations.js",
  "./evidence-explorer.js",
  "./report-view.js",
  "./personalization-storage.js",
  "./recommendation-engine.js",
  "./smart-search.js",
  "./personalization-view.js",
  "./profile-ui-compat.js",
  "./runtime-compat.js",
  "./runtime-fixes-v2.js",
  "./script.js",
  "./zbar-wasm/index.mjs",
  "./zbar-wasm/main.mjs",
  "./zbar-wasm/zbar.wasm",
  "./manifest.webmanifest",
  "./icons/app-mark.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/home/breakfast-parfait.png",
  "./assets/home/lunch-penne.png",
  "./assets/home/dinner-thali.png",
  "./assets/restaurants/restaurant-hero.jpg",
];
const LAZY_FEATURES = [
  "./assistant.js",
  "./recipe-meal-engine.js",
  "./shopping.js",
  "./restaurant-provider.js",
  "./restaurant-storage.js",
  "./restaurant-search.js",
  "./restaurant-menu-provider.js",
  "./restaurant-menu-parser.js",
  "./restaurant-menu-storage.js",
  "./restaurant-menu-ocr.js",
  "./restaurant-menu-import.js",
  "./restaurant-menu-review.js",
  "./restaurant-cross-contact.js",
  "./restaurant-modifier-engine.js",
  "./restaurant-evidence-engine.js",
  "./restaurant-compatibility-report.js",
  "./restaurant-report-ui.js",
  "./restaurant-ranking.js",
  "./restaurant-ranking-storage.js",
  "./restaurant-comparison.js",
  "./restaurant-meal-engine.js",
  "./restaurant-meal-storage.js",
  "./restaurant-order-history.js",
  "./restaurant-memory-search.js",
  "./restaurant-order-recheck.js",
  "./restaurant-question-engine.js",
  "./restaurant-question-storage.js",
  "./restaurant-question-translation.js",
  "./restaurant-question-actions.js",
  "./restaurant-communication-view.js",
  "./restaurant-dining-assistant.js",
  "./restaurant-dining-card.js",
  "./restaurant-ingredient-explorer.js",
  "./restaurant-dining-assistant-view.js",
  "./travel-storage.js",
  "./travel-glossary.js",
  "./travel-speech.js",
  "./travel-language-packs.js",
  "./travel-mode.js",
  "./travel-card-view.js",
  "./restaurant-memory-view.js",
  "./restaurant-order-builder.js",
  "./restaurant-detail-view.js",
  "./restaurant-results-view.js",
  "./restaurant-ui.js",
];

self.addEventListener("install", event => {
  // Force a network revalidation while building a new version. Without
  // cache:"reload", an older active worker/browser cache can seed the new
  // cache with stale JavaScript even though the cache name changed.
  const freshShell = SHELL.map(path => new Request(path, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(freshShell)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![CACHE, FEATURE_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/classify") || url.pathname.startsWith("/find-food")) return;
  // Only static, same-origin GETs are eligible; private responses bypass Cache Storage.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(async cached => {
    if (cached) return cached;
    const response = await fetch(req);
    const path = `.${url.pathname}`;
    const type = response.headers.get("content-type") || "";
    const expected = path.endsWith(".js") ? "javascript" : path.endsWith(".css") ? "text/css" : "";
    if (response.ok && response.type === "basic" && LAZY_FEATURES.includes(path) && (!expected || type.includes(expected))) {
      const cache = await caches.open(FEATURE_CACHE);
      cache.put(req, response.clone());
    }
    return response;
  }));
});
