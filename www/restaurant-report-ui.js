(function (root) {
  "use strict";
  const Reports = root.ROOTS_RESTAURANT_REPORT;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const LABELS = Object.freeze({
    SAFE: "Safe", SAFE_WITH_MODIFICATION: "Safe with Modification",
    NEEDS_CONFIRMATION: "Needs Confirmation", AVOID: "Avoid",
  });
  const GROUPS = Object.freeze([
    ["bestChoices", "Best Choices"], ["canModify", "Can Modify"],
    ["needsConfirmation", "Needs Confirmation"], ["avoid", "Avoid"],
  ]);
  let initialized = false, report = null;
  function list(title, items, className) {
    return `<section class="restaurant-report-group" aria-labelledby="report-${className}">
      <h4 id="report-${className}">${esc(title)} <span>${items.length}</span></h4>
      ${items.length ? items.map((dish) => `<article class="dish-result-card verdict-${esc(dish.verdict.toLowerCase().replaceAll("_", "-"))}">
        <div class="dish-result-heading"><h5>${esc(dish.dishName)}</h5><span class="dish-verdict-label">${esc(LABELS[dish.verdict])}</span></div>
        <p>${esc(dish.summary)}</p>
        ${dish.suggestedModifications.length ? `<ul class="dish-modifications">${dish.suggestedModifications.map((item) => `<li>${esc(item.instruction)}</li>`).join("")}</ul>` : ""}
        <details class="dish-why"><summary>Why?</summary>
          <div class="dish-why-content">
            <h6>Evidence</h6><ul>${dish.evidence.map((item) => `<li><b>${esc(item.level.replaceAll("_", " "))}:</b> ${esc(item.text)}</li>`).join("") || "<li>No evidence was supplied.</li>"}</ul>
            <h6>Confirmed ingredients</h6><ul>${dish.confirmedIngredients.map((item) => `<li>${esc(item.displayName)}</li>`).join("") || "<li>None confirmed from the menu description.</li>"}</ul>
            <h6>Possible ingredients and unknowns</h6><ul>${dish.unknowns.map((item) => `<li>${esc(item.text)}</li>`).join("") || "<li>No unresolved terms.</li>"}</ul>
            <h6>Restaurant notes</h6><ul>${dish.restaurantNotes.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No restaurant notes.</li>"}</ul>
            <h6>Profile conflicts</h6><ul>${dish.profileConflicts.map((item) => `<li>${esc(item.label)}</li>`).join("") || "<li>No confirmed profile conflicts.</li>"}</ul>
          </div>
        </details>
      </article>`).join("") : `<p class="restaurant-empty-small">No dishes in this section.</p>`}
    </section>`;
  }
  function render(value) {
    report = value;
    const target = $("restaurant-menu-report");
    if (!target) return;
    target.innerHTML = GROUPS.map(([key, title]) => list(title, value.groups[key], key)).join("");
    $("restaurant-analysis-summary").textContent = `${value.dishes.length} dish${value.dishes.length === 1 ? "" : "es"} checked for ${value.profileSnapshot.name}. Results use menu evidence and your saved profile; no AI made these decisions.`;
    target.querySelector("summary")?.focus();
  }
  function analyze() {
    const menu = root.ROOTS_MENU_REVIEW?.getMenu(), profile = root.ROOTS_PROFILE?.getActiveProfile();
    if (!menu || !profile) {
      $("restaurant-analysis-summary").textContent = "Save or open a menu and dietary profile before checking dishes.";
      return null;
    }
    const button = $("restaurant-analyze-menu");
    button.disabled = true;
    $("restaurant-analysis-summary").textContent = "Checking menu evidence…";
    try {
      const value = Reports.generate(menu, profile);
      render(value); return value;
    } catch (_) {
      $("restaurant-analysis-summary").textContent = "The menu could not be checked. Review the menu evidence and try again.";
      return null;
    } finally { button.disabled = false; }
  }
  function init() {
    if (initialized || !$("restaurant-analyze-menu")) return;
    initialized = true;
    $("restaurant-analyze-menu").addEventListener("click", analyze);
  }
  root.ROOTS_RESTAURANT_REPORT_UI = { init, analyze, render, getReport: () => report, labels: LABELS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
