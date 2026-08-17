(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const Engine = root.ROOTS_MEAL_ENGINE;
  let state = null, trigger = null, initialized = false, view = "detail";
  const list = (value) => Array.isArray(value) ? value : [];
  const safeImage = (value) => { try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; } catch (_) { return ""; } };
  const verdictLabel = (value) => ({ SAFE: "Safe", SAFE_WITH_MODIFICATION: "Safe with Modification", NEEDS_CONFIRMATION: "Needs Confirmation", AVOID: "Avoid", BEST_CHOICE: "Best Choice", COMPATIBLE: "Compatible" }[value] || value);
  function menuFor(summary) { return root.ROOTS_MENU_STORAGE?.get(summary?.report?.menu?.id) || null; }
  function detailEvidence(evidence) {
    return `<details class="meal-why"><summary>Why?</summary>
      <h3>Ingredient evidence</h3><ul>${list(evidence.evidence).map((item) => `<li><b>${esc(String(item.level || "unknown").replaceAll("_", " "))}:</b> ${esc(item.text)}</li>`).join("") || "<li>No ingredient evidence was published.</li>"}</ul>
      <h3>Cross-contact and warnings</h3><ul>${list(evidence.warnings).map((item) => `<li>${esc(item.text || item.message || item)}</li>`).join("") || "<li>No cross-contact warning is documented.</li>"}</ul>
      <h3>Restaurant notes</h3><ul>${list(evidence.restaurantNotes).map((item) => `<li>${esc(item.text || item)}</li>`).join("") || "<li>No additional restaurant notes.</li>"}</ul>
    </details>`;
  }
  function renderDetail() {
    const { dish, section } = Engine.findDish(state.menu, state.dishId), evidence = Engine.reportDish(state.summary.report, state.dishId);
    const freshness = root.ROOTS_MENU_STORAGE?.getFreshness(state.menu);
    const image = safeImage(dish.imageUrl || dish.image?.url);
    $("order-builder-title").textContent = dish.nameOriginal;
    $("order-builder-content").innerHTML = `
      <section class="dish-detail-hero">
        ${image ? `<img class="dish-detail-image" src="${esc(image)}" alt="${esc(dish.nameOriginal)}" loading="lazy">` : '<div class="dish-image-placeholder" role="img" aria-label="No dish image available">Dish image unavailable</div>'}
        <p class="meal-verdict verdict-${esc(evidence.verdict.toLowerCase().replaceAll("_", "-"))}">${esc(verdictLabel(evidence.verdict))}</p>
        <h2>${esc(dish.nameOriginal)}</h2>
        <p>${esc(dish.descriptionOriginal || "The menu does not provide a description.")}</p>
        <p><b>${esc(dish.price?.display || "Price not listed")}</b> · ${esc(section.nameOriginal)}</p>
        <p class="muted">${esc(evidence.summary)}</p>
      </section>
      ${detailEvidence(evidence)}
      <section class="dish-source-freshness"><h3>Source freshness</h3><p>${esc(freshness?.label || "Source date unavailable")}</p></section>
      <div class="meal-builder-actions">
        <button type="button" class="ghost-btn" data-order-action="explain-dish">Explain</button>
        <button type="button" class="ghost-btn" data-order-action="ask-roots">Ask ROOTS</button>
        ${["SAFE", "SAFE_WITH_MODIFICATION"].includes(evidence.verdict) ? '<button type="button" class="primary-btn" data-order-action="build">Build My Order</button>' : ""}
        ${["SAFE", "SAFE_WITH_MODIFICATION"].includes(evidence.verdict) ? '<button type="button" class="ghost-btn" data-order-action="save-dish">Save Dish</button>' : ""}
        <button type="button" class="ghost-btn" data-order-action="compare">Compare Dishes</button>
      </div>`;
  }
  function choiceGroup(title, role, choices) {
    if (!choices.length) return "";
    return `<fieldset class="meal-choice-group"><legend>${esc(title)}</legend>${choices.map((item) => `<label><input type="checkbox" data-meal-role="${role}" value="${esc(item.dishId)}" ${list(state.meal[role]).some((selected) => selected.dishId === item.dishId) ? "checked" : ""}><span><b>${esc(item.name)}</b><small>${esc(verdictLabel(item.verdict))}${item.price?.display ? ` · ${esc(item.price.display)}` : ""}</small></span></label>`).join("")}</fieldset>`;
  }
  function summaryPanel() {
    const a = state.meal.analysis;
    return `<aside class="meal-live-summary" aria-labelledby="meal-current-verdict">
      <p class="eyebrow">Current verdict</p><h3 id="meal-current-verdict">${esc(a.label)}</h3>
      <p>${esc(a.portionAwareness)}</p>
      <dl><div><dt>Selected changes</dt><dd>${esc(a.selectedModifications.join(", ") || "None")}</dd></div><div><dt>Warnings</dt><dd>${esc(a.warnings.join("; ") || "None documented")}</dd></div><div><dt>Unknowns</dt><dd>${esc(a.unknowns.join("; ") || "None")}</dd></div></dl>
      ${a.conflicts.length ? `<div class="meal-conflicts"><b>Conflicts</b><ul>${a.conflicts.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>` : ""}
      ${a.alternatives.length ? `<div class="meal-alternatives"><b>Menu-supported alternatives</b>${a.alternatives.map((item) => `<button type="button" class="text-btn" data-alternative="${esc(item.optionId)}">${esc(item.label)}</button>`).join("")}</div>` : ""}
    </aside>`;
  }
  function renderBuilder() {
    view = "builder";
    const available = Engine.availableComponents(state.menu, state.summary.report);
    const main = state.meal.main;
    $("order-builder-title").textContent = "Build My Order";
    $("order-builder-content").innerHTML = `<div class="meal-builder-layout"><div class="meal-builder-form">
      <section><p class="eyebrow">Main</p><h2>${esc(main.name)}</h2><p>${esc(main.evidence.summary)}</p></section>
      ${main.options.length ? `<fieldset class="meal-choice-group"><legend>Menu-supported modifications</legend>${main.options.map((item) => `<label><input type="checkbox" data-meal-option value="${esc(item.id)}" ${state.meal.selectedOptionIds.includes(item.id) ? "checked" : ""}><span><b>${esc(item.label)}</b><small>${esc(item.group)}</small></span></label>`).join("")}</fieldset>` : '<p class="muted">No selectable modifications are published for this dish.</p>'}
      <label class="meal-portion">Portion <select id="meal-portion"><option value="standard">Standard portion</option>${list(Engine.findDish(state.menu, state.dishId)?.dish?.sizes).map((size, index) => `<option value="size-${index}">${esc(size.nameOriginal || size.label || size.text || size)}${size.price?.display ? ` · ${esc(size.price.display)}` : ""}</option>`).join("")}</select></label>
      ${choiceGroup("Add a side", "sides", available.sides)}
      ${choiceGroup("Add a drink", "drinks", available.drinks)}
      ${choiceGroup("Add a dessert", "desserts", available.desserts)}
      <div class="meal-builder-actions"><button type="button" class="primary-btn" data-order-action="review">Review Order</button><button type="button" class="ghost-btn" data-order-action="detail">Back to Dish</button></div>
    </div>${summaryPanel()}</div>`;
    const portion = $("meal-portion");
    if (portion) portion.value = state.meal.portion.id;
  }
  function renderReview() {
    view = "review";
    const meal = state.meal, a = meal.analysis;
    const components = [meal.main, ...meal.sides, ...meal.drinks, ...meal.desserts];
    $("order-builder-title").textContent = "Review Order";
    $("order-builder-content").innerHTML = `
      <section class="order-review">
        <p class="meal-verdict verdict-${esc(a.verdict.toLowerCase().replaceAll("_", "-"))}">${esc(a.label)}</p>
        <h2>Meal Summary</h2><ul class="order-component-list">${components.map((item) => `<li><b>${esc(item.name)}</b><span>${esc(item.role)}</span></li>`).join("")}</ul>
        <h3>Selected modifications</h3><p>${esc(a.selectedModifications.join(", ") || "None")}</p>
        <h3>Evidence</h3><ul>${a.evidence.slice(0, 20).map((item) => `<li>${esc(item.component)}: ${esc(item.text)}</li>`).join("") || "<li>No additional evidence.</li>"}</ul>
        <h3>Warnings and unknowns</h3><ul>${[...a.conflicts, ...a.warnings, ...a.unknowns].map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No unresolved warning is documented.</li>"}</ul>
        <h3>Restaurant notes</h3><ul>${a.restaurantNotes.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No additional restaurant notes.</li>"}</ul>
        <section class="order-memory-form" aria-labelledby="order-memory-heading"><h3 id="order-memory-heading">Save or record this order</h3>
          <label for="order-meal-name">Meal name</label><input id="order-meal-name" maxlength="120" value="${esc(state.savedName || `${meal.main.name} at ${meal.restaurant.name}`)}">
          <label for="order-personal-note">Personal preparation note (optional)</label><textarea id="order-personal-note" maxlength="2000" placeholder="Example: Ask for sauce on the side"></textarea>
          <label for="order-ordered-at">Ordered date and time<input id="order-ordered-at" type="datetime-local"></label>
          <div class="order-outcome-grid"><label for="order-confirmed">Restaurant confirmed modifications<select id="order-confirmed"><option value="not_asked">Not asked</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label for="order-arrived">Meal arrived as requested<select id="order-arrived"><option value="unsure">Unsure</option><option value="yes">Yes</option><option value="no">No</option></select></label></div>
        </section>
        <div class="meal-builder-actions"><button type="button" class="ghost-btn" data-order-action="explain-meal">Explain Meal</button><button type="button" class="primary-btn" data-order-action="questions">Questions for Staff</button><button type="button" class="ghost-btn" data-order-action="save">Save Meal</button><button type="button" class="ghost-btn" data-order-action="ordered">Mark as Ordered</button><button type="button" class="ghost-btn" data-order-action="copy">Copy Order</button><button type="button" class="ghost-btn" data-order-action="build">Edit Order</button></div>
        <p id="meal-save-status" role="status" aria-live="polite"></p>
      </section>`;
  }
  function renderCompare() {
    view = "compare";
    const dishes = state.summary.report.dishes.filter((item) => ["SAFE", "SAFE_WITH_MODIFICATION", "NEEDS_CONFIRMATION"].includes(item.verdict)).slice(0, 12);
    $("order-builder-title").textContent = "Compare Dishes";
    $("order-builder-content").innerHTML = `<p>Select up to three menu dishes. Comparisons use the existing deterministic dish evidence.</p>
      <fieldset class="meal-compare-choices"><legend>Dishes</legend>${dishes.map((item) => `<label><input type="checkbox" data-compare-dish value="${esc(item.dishId)}" ${item.dishId === state.dishId ? "checked" : ""}><span>${esc(item.dishName)}</span></label>`).join("")}</fieldset>
      <div id="meal-comparison-result"></div><button type="button" class="ghost-btn" data-order-action="detail">Back to Dish</button>`;
    updateComparison();
  }
  function updateComparison() {
    const target = $("meal-comparison-result");
    if (!target) return;
    const selected = [...document.querySelectorAll("[data-compare-dish]:checked")].map((item) => item.value).slice(0, 3);
    document.querySelectorAll("[data-compare-dish]:not(:checked)").forEach((item) => { item.disabled = selected.length >= 3; });
    const rows = Engine.compare(state.summary.report, selected);
    target.innerHTML = rows.length ? `<div class="comparison-scroll"><table><thead><tr><th>Dish</th><th>Verdict</th><th>Why</th></tr></thead><tbody>${rows.map((item) => `<tr><th>${esc(item.name)}</th><td>${esc(verdictLabel(item.verdict))}</td><td>${esc(item.summary)}</td></tr>`).join("")}</tbody></table></div>` : "<p>Select a dish to compare.</p>";
  }
  function open(input, button) {
    const menu = menuFor(input.summary);
    if (!menu) return root.alert?.("This menu is no longer stored on this device. Reopen or import the menu to build an order.");
    trigger = button || document.activeElement;
    state = { summary: input.summary, restaurant: input.restaurant, dishId: input.dishId, menu };
    state.meal = Engine.update(Engine.newMeal(menu, input.summary.report, input.dishId, input.restaurant), {});
    view = input.mode === "build" ? "builder" : "detail";
    const modal = $("order-builder-modal");
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
    if (view === "builder") renderBuilder(); else renderDetail();
    $("order-builder-close").focus();
  }
  function openSaved(savedMealId, button) {
    const result = root.ROOTS_ORDER_RECHECK?.inspect(savedMealId);
    if (!result?.current) return root.alert?.("The current menu cannot rebuild this saved meal. Keep the saved record or review the current menu.");
    const record = result.original;
    trigger = button || document.activeElement;
    state = { summary: { report: result.inspection.report }, restaurant: record.restaurant, dishId: record.meal.mainDishId, menu: result.inspection.menu, meal: result.current, savedMealId: record.id, savedName: record.name };
    view = "review";
    const modal = $("order-builder-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); renderReview(); $("order-builder-close").focus();
  }
  function close() {
    const modal = $("order-builder-modal");
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    state = null; trigger?.focus?.();
  }
  function handleChange(event) {
    if (!state) return;
    if (event.target.matches("[data-meal-option]")) state.meal = Engine.selectOption(state.meal, event.target.value, event.target.checked);
    else if (event.target.matches("[data-meal-role]")) state.meal = event.target.checked ? Engine.addComponent(state.meal, state.menu, state.summary.report, event.target.value, event.target.dataset.mealRole) : Engine.removeComponent(state.meal, event.target.value, event.target.dataset.mealRole);
    else if (event.target.id === "meal-portion") {
      const option = event.target.selectedOptions[0];
      state.meal = Engine.update(state.meal, { portion: { id: event.target.value, label: option.textContent, menuSupported: true } });
    } else if (event.target.matches("[data-compare-dish]")) { updateComparison(); return; }
    renderBuilder();
  }
  function handleClick(event) {
    const action = event.target.closest("[data-order-action]")?.dataset.orderAction;
    if (action === "build") renderBuilder();
    else if (action === "explain-dish") {
      const evidence = Engine.reportDish(state.summary.report, state.dishId);
      const context = root.ROOTS_EXPLANATION_CONTEXT?.buildContext?.(evidence, root.ROOTS_PROFILE?.getActiveProfile?.(), state.summary.report, { contextType: "dish", sourceFreshness: root.ROOTS_MENU_STORAGE?.getFreshness?.(state.menu)?.status });
      if (context) root.ROOTS_EVIDENCE_EXPLORER?.open?.(context, event.target);
    }
    else if (action === "explain-meal") {
      const analysis = state.meal.analysis;
      const subject = {
        id: state.meal.id, displayName: state.savedName || `${state.meal.main.name} meal`,
        rawName: state.meal.main.name, verdict: analysis.verdict,
        evidence: analysis.evidence,
        reasons: [...analysis.conflicts, ...analysis.warnings, ...analysis.unknowns].map((text, index) => ({
          id: `meal-reason-${index}`, profileRuleId: "meal_evidence", category: analysis.conflicts.includes(text) ? "conflict" : "restaurant_evidence",
          severity: analysis.conflicts.includes(text) ? "avoid" : "caution", label: text,
          evidenceType: "meal_component", evidenceLevel: analysis.unknowns.includes(text) ? "needs_confirmation" : "confirmed",
        })),
      };
      const context = root.ROOTS_EXPLANATION_CONTEXT?.buildContext?.(subject, root.ROOTS_PROFILE?.getActiveProfile?.(), { engineVersion: state.meal.engineVersion }, { contextType: "meal" });
      if (context) root.ROOTS_EVIDENCE_EXPLORER?.open?.(context, event.target);
    }
    else if (action === "ask-roots") {
      const evidence = Engine.reportDish(state.summary.report, state.dishId);
      root.ROOTS_DINING_ASSISTANT_VIEW?.open({ dish: evidence, summary: state.summary, restaurant: state.restaurant, profile: root.ROOTS_PROFILE?.getActiveProfile?.(), menu: state.menu }, event.target);
    }
    else if (action === "detail") renderDetail();
    else if (action === "review") renderReview();
    else if (action === "compare") renderCompare();
    else if (action === "save") {
      const target = $("meal-save-status");
      try {
        const name = $("order-meal-name")?.value;
        const note = $("order-personal-note")?.value;
        const record = state.savedMealId
          ? root.ROOTS_SAVED_MEALS.update(state.savedMealId, { name, personalNotes: note })
          : root.ROOTS_SAVED_MEALS.save(state.meal, { name, personalNotes: note, menu: state.menu, restaurant: state.restaurant });
        state.savedMealId = record.id; state.savedName = record.name; target.textContent = "Meal saved.";
        root.ROOTS_RESTAURANT_MEMORY?.render?.();
      }
      catch (error) { target.textContent = error.message || "Meal could not be saved."; }
    }
    else if (action === "ordered") {
      const target = $("meal-save-status");
      try {
        const name = $("order-meal-name")?.value, note = $("order-personal-note")?.value;
        const source = state.savedMealId || root.ROOTS_SAVED_MEALS.create(state.meal, { name, personalNotes: note, menu: state.menu, restaurant: state.restaurant });
        root.ROOTS_ORDER_HISTORY.markOrdered(source, { orderedAt: $("order-ordered-at")?.value, notes: note, restaurantConfirmed: $("order-confirmed")?.value, mealReceivedAsRequested: $("order-arrived")?.value });
        target.textContent = "Order recorded. No order was sent to the restaurant."; root.ROOTS_RESTAURANT_MEMORY?.render?.();
      } catch (error) { target.textContent = error.message || "Order could not be recorded."; }
    }
    else if (action === "copy") {
      const target = $("meal-save-status");
      try {
        const record = state.savedMealId ? root.ROOTS_SAVED_MEALS.get(state.savedMealId) : root.ROOTS_SAVED_MEALS.create(state.meal, { name: $("order-meal-name")?.value, menu: state.menu, restaurant: state.restaurant });
        const text = root.ROOTS_RESTAURANT_MEMORY.copyText(record, false);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text); else root.prompt?.("Copy this order:", text);
        target.textContent = "Order copied.";
      } catch (_) { target.textContent = "Order could not be copied."; }
    }
    else if (action === "save-dish") {
      try {
        const record = root.ROOTS_SAVED_MEALS.save(state.meal, { name: `${state.meal.main.name} at ${state.meal.restaurant.name}`, menu: state.menu, restaurant: state.restaurant });
        state.savedMealId = record.id; root.alert?.("Dish saved for future review."); root.ROOTS_RESTAURANT_MEMORY?.render?.();
      } catch (error) { root.alert?.(error.message || "Dish could not be saved."); }
    }
    else if (action === "questions") {
      root.ROOTS_RESTAURANT_COMMUNICATION?.openMeal?.({ meal: state.meal, menu: state.menu, restaurant: state.restaurant }, event.target);
    }
    const alternative = event.target.closest("[data-alternative]")?.dataset.alternative;
    if (alternative) { state.meal = Engine.selectOption(state.meal, alternative, true); renderBuilder(); }
  }
  function init() {
    if (initialized || !$("order-builder-modal")) return; initialized = true;
    $("order-builder-close").addEventListener("click", close);
    $("order-builder-modal").addEventListener("click", (event) => { if (event.target.id === "order-builder-modal") close(); });
    $("order-builder-content").addEventListener("click", handleClick);
    $("order-builder-content").addEventListener("change", handleChange);
    document.addEventListener("keydown", (event) => {
      const modal = $("order-builder-modal");
      if (!modal?.classList.contains("open")) return;
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), summary")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
  }
  root.ROOTS_ORDER_BUILDER = { init, open, openSaved, close, getState: () => state, getView: () => view };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
