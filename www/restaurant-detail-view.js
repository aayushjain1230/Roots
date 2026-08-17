(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const LABEL = { EXCELLENT_MATCH: "Excellent Match", GOOD_MATCH: "Good Match", LIMITED_OPTIONS: "Limited Options", NEEDS_MORE_INFORMATION: "Needs More Information", POOR_MATCH: "Poor Match" };
  let current = null, trigger = null, initialized = false;
  const dishSection = (title, dishes, id) => dishes?.length ? `<section class="restaurant-detail-dishes" aria-labelledby="detail-${id}"><h3 id="detail-${id}">${esc(title)}</h3>${dishes.map((dish) => `<article><h4>${esc(dish.dishName)}</h4><p>${esc(dish.summary)}</p><details><summary>View evidence</summary><ul>${dish.evidence.map((item) => `<li><b>${esc(item.level.replaceAll("_", " "))}:</b> ${esc(item.text)}</li>`).join("")}</ul></details><div class="dish-card-actions"><button type="button" class="ghost-btn" data-dish-detail="${esc(dish.dishId)}">View Dish</button><button type="button" class="text-btn" data-explain-dish="${esc(dish.dishId)}">Explain</button><button type="button" class="text-btn" data-favorite-dish="${esc(dish.dishId)}" aria-pressed="${root.ROOTS_PERSONALIZATION?.isFavorite?.("dishes", `${current?.restaurantId}:${dish.dishId}`) ? "true" : "false"}">${root.ROOTS_PERSONALIZATION?.isFavorite?.("dishes", `${current?.restaurantId}:${dish.dishId}`) ? "Favorited" : "Favorite dish"}</button>${["SAFE", "SAFE_WITH_MODIFICATION"].includes(dish.verdict) ? `<button type="button" class="primary-btn" data-build-order="${esc(dish.dishId)}">Build My Order</button>` : ""}</div></article>`).join("")}</section>` : "";
  function open(summary, restaurant, button) {
    current = summary; trigger = button || document.activeElement;
    const dialog = $("restaurant-detail-modal"), report = summary.report;
    $("restaurant-detail-name").textContent = summary.restaurantName;
    $("restaurant-detail-content").innerHTML = `
      <section class="restaurant-match-hero category-${esc(summary.matchCategory.toLowerCase().replaceAll("_", "-"))}">
        <p class="match-category">${esc(LABEL[summary.matchCategory])}</p>
        <h2>${summary.dishCounts.bestChoice} Best Choice${summary.dishCounts.bestChoice === 1 ? "" : "s"}</h2>
        <p>${summary.dishCounts.canModify} Can Be Modified · ${summary.dishCounts.needsConfirmation} Need Confirmation</p>
        <p>${esc(summary.evidence.level[0] + summary.evidence.level.slice(1).toLowerCase())} menu evidence</p>
      </section>
      <section class="restaurant-detail-identity"><p>${esc(restaurant?.cuisine || "Cuisine not provided")}${restaurant?.distanceMiles != null ? ` · ${esc(restaurant.distanceMiles.toFixed(1))} mi` : ""} · ${esc(restaurant?.openStatus || "Hours unavailable")}</p><p>${esc(summary.freshness.status.replaceAll("_", " "))}</p></section>
      <details class="restaurant-match-why"><summary>Why this match?</summary><div><h3>Positive factors</h3><ul>${summary.topReasons.map((reason) => `<li>${esc(reason)}</li>`).join("") || "<li>No strong positive factor is confirmed yet.</li>"}</ul><h3>Limitations</h3><ul>${summary.limitations.map((reason) => `<li>${esc(reason)}</li>`).join("") || "<li>No major limitations identified.</li>"}</ul></div></details>
      <button type="button" class="text-btn" data-detail-action="explain-ranking">Explain Restaurant Match</button>
      ${report ? dishSection("Best Choices", report.groups.bestChoices, "best") : ""}
      ${report ? dishSection("Can Be Modified", report.groups.canModify, "modify") : ""}
      ${report ? dishSection("Needs Confirmation", report.groups.needsConfirmation, "confirm") : ""}
      ${report ? dishSection("Avoid", report.groups.avoid, "avoid") : ""}
      ${root.ROOTS_SAVED_MEALS ? `<section class="restaurant-memory-summary"><h3>Your restaurant memory</h3><p>${root.ROOTS_SAVED_MEALS.list({ restaurantId: summary.restaurantId }).length} saved meal(s) · ${(root.ROOTS_ORDER_HISTORY?.list({ restaurantId: summary.restaurantId }) || []).length} previous order(s)</p><button type="button" class="ghost-btn" data-detail-action="saved-memory">View in Saved</button></section>` : ""}
      <section class="restaurant-source-detail"><h3>Menu evidence</h3><p>${esc(summary.evidence.officialMenu ? "Official menu source" : "User or provider menu source")} · ${esc(summary.freshness.status.replaceAll("_", " "))}</p></section>
      <button type="button" class="primary-btn" data-detail-action="ask-roots">Ask ROOTS</button>
      <button type="button" class="text-btn" data-detail-action="report-issue">Report Match Issue</button>`;
    dialog.classList.add("open"); dialog.setAttribute("aria-hidden", "false"); $("restaurant-detail-close").focus();
  }
  function close() { const dialog = $("restaurant-detail-modal"); dialog.classList.remove("open"); dialog.setAttribute("aria-hidden", "true"); trigger?.focus?.(); }
  function bind() {
    $("restaurant-detail-close")?.addEventListener("click", close);
    $("restaurant-detail-modal")?.addEventListener("click", (event) => { if (event.target.id === "restaurant-detail-modal") close(); });
    $("restaurant-detail-content")?.addEventListener("click", (event) => {
      const explainDish = event.target.closest("[data-explain-dish]");
      if (explainDish) {
        const dish = current?.report?.dishes?.find((item) => item.dishId === explainDish.dataset.explainDish);
        if (dish && root.ROOTS_EXPLANATION_CONTEXT && root.ROOTS_EVIDENCE_EXPLORER) {
          const context = root.ROOTS_EXPLANATION_CONTEXT.buildContext(dish, root.ROOTS_PROFILE?.getActiveProfile?.(), current.report, { contextType: "dish", sourceFreshness: current.freshness?.status });
          root.ROOTS_EVIDENCE_EXPLORER.open(context, explainDish);
        }
        return;
      }
      const favoriteDish = event.target.closest("[data-favorite-dish]");
      if (favoriteDish && root.ROOTS_PERSONALIZATION) {
        const dishes = Object.values(current?.report?.groups || {}).flat();
        const dish = dishes.find((item) => item.dishId === favoriteDish.dataset.favoriteDish);
        if (dish) {
          const id = `${current.restaurantId}:${dish.dishId}`;
          const active = root.ROOTS_PERSONALIZATION.toggle("dishes", {
            id, name: dish.dishName, detail: current.restaurantName,
            metadata: { restaurantId: current.restaurantId, dishId: dish.dishId, verdict: dish.verdict },
          });
          favoriteDish.textContent = active ? "Favorited" : "Favorite dish";
          favoriteDish.setAttribute("aria-pressed", String(active));
        }
        return;
      }
      const dishButton = event.target.closest("[data-dish-detail], [data-build-order]");
      if (dishButton && root.ROOTS_ORDER_BUILDER) {
        root.ROOTS_ORDER_BUILDER.open({
          summary: current, restaurant: current?.restaurantMetadata,
          dishId: dishButton.dataset.dishDetail || dishButton.dataset.buildOrder,
          mode: dishButton.dataset.buildOrder ? "build" : "detail",
        }, dishButton);
        return;
      }
      if (event.target.closest("[data-detail-action='saved-memory']")) {
        close(); document.querySelector("[data-view='savedView']")?.click(); return;
      }
      if (event.target.closest("[data-detail-action='explain-ranking']")) {
        const subject = {
          id: current.restaurantId, displayName: current.restaurantName, verdict: current.matchCategory,
          reasons: [...(current.topReasons || []).map((text, index) => ({ id: `ranking-positive-${index}`, profileRuleId: "restaurant_ranking", category: "restaurant_ranking", severity: "safe", label: text, evidenceType: "restaurant_evidence", evidenceLevel: current.evidence?.level === "HIGH" ? "confirmed" : "likely" })),
            ...(current.limitations || []).map((text, index) => ({ id: `ranking-limitation-${index}`, profileRuleId: "restaurant_ranking", category: "restaurant_ranking", severity: "caution", label: text, evidenceType: "restaurant_evidence", evidenceLevel: "needs_confirmation" }))],
        };
        const context = root.ROOTS_EXPLANATION_CONTEXT?.buildContext?.(subject, root.ROOTS_PROFILE?.getActiveProfile?.(), { engineVersion: current.rankingVersion }, { contextType: "restaurant_ranking", sourceFreshness: current.freshness?.status });
        if (context) root.ROOTS_EVIDENCE_EXPLORER?.open?.(context, event.target);
        return;
      }
      if (event.target.closest("[data-detail-action='ask-roots']")) {
        root.ROOTS_DINING_ASSISTANT_VIEW?.open({ summary: current, restaurant: current?.restaurantMetadata, profile: root.ROOTS_PROFILE?.getActiveProfile?.() }, event.target);
        return;
      }
      if (event.target.closest("[data-detail-action='report-issue']")) {
        const reason = root.prompt?.("Report Match Issue: ranked too high, ranked too low, menu outdated, dish category incorrect, cross-contact missing, or other.");
        if (reason) {
          try {
            const key = "roots-restaurant-ranking-feedback-v1", records = JSON.parse(localStorage.getItem(key) || "[]");
            localStorage.setItem(key, JSON.stringify([{ restaurantId: current.restaurantId, reason: String(reason).slice(0, 500), createdAt: new Date().toISOString() }, ...records].slice(0, 50)));
          } catch (_) { /* feedback remains optional */ }
        }
      }
    });
    document.addEventListener("keydown", (event) => {
      const dialog = $("restaurant-detail-modal"), open = dialog?.classList.contains("open");
      if (event.key === "Escape" && open) { close(); return; }
      if (event.key === "Tab" && open) {
        const controls = [...dialog.querySelectorAll("button:not([disabled]), summary, a[href]")];
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
      }
    });
  }
  function init() { if (initialized || !$("restaurant-detail-modal")) return; initialized = true; bind(); }
  root.ROOTS_RESTAURANT_DETAIL = { init, open, close, getCurrent: () => current };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
