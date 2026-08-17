(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let set = null, translated = null, trigger = null, initialized = false, parentModal = null;
  const priorityLabel = (value) => `${value[0].toUpperCase()}${value.slice(1)} priority`;
  function mealContext(input) {
    const meal = input.meal, menu = input.menu || root.ROOTS_MENU_STORAGE?.get?.(meal.menuId), profile = input.profile || root.ROOTS_PROFILE?.getActiveProfile?.();
    return { restaurant: input.restaurant || meal.restaurant, dish: { id: meal.main.dishId, name: meal.main.name }, meal, dishEvidence: meal.main.evidence, selectedModifiers: meal.main.options.filter((item) => meal.selectedOptionIds.includes(item.id)), profile, menu };
  }
  function savedContext(record) {
    return {
      restaurant: { id: record.restaurant.restaurantId, name: record.restaurant.name },
      dish: { id: record.meal.mainDishId, name: record.meal.mainDishName },
      savedMealId: record.id, selectedModifiers: record.meal.selectedModifiers,
      evaluation: { unknowns: record.evaluation.unknowns, warnings: record.evaluation.warnings, crossContactConcerns: record.evaluation.crossContactConcerns, evidence: record.evaluation.evidence },
      profile: record.profile.snapshot, menu: record.menu,
    };
  }
  function displayQuestion(item) { return translated?.questions?.find((entry) => entry.id === item.id) || item; }
  function render() {
    const target = $("restaurant-communication-content"); if (!target || !set) return;
    const groups = root.ROOTS_SERVER_QUESTIONS.group(set);
    target.innerHTML = `
      <header class="communication-hero"><p class="eyebrow">Restaurant communication</p><h2>${esc(set.restaurant.name || "Questions for restaurant staff")}</h2><p>${esc(set.dish.name || "")}</p><p>Every question below comes from unresolved deterministic evidence. ROOTS has not invented additional concerns.</p></header>
      <div class="communication-toolbar" aria-label="Question actions">
        <label for="communication-language">Translate questions<select id="communication-language"><option value="">English (original)</option>${Object.entries(root.ROOTS_QUESTION_TRANSLATION.languages).map(([code, name]) => `<option value="${esc(code)}">${esc(name)}</option>`).join("")}</select></label>
        <button type="button" class="ghost-btn" data-communication-action="copy-all">Copy All</button>
        <button type="button" class="ghost-btn" data-communication-action="share">Share</button>
        <button type="button" class="ghost-btn" data-communication-action="speak-all">Speak All</button>
        <button type="button" class="ghost-btn" data-communication-action="print">Print Questions</button>
        <button type="button" class="ghost-btn" data-communication-action="travel">Travel Mode</button>
        <button type="button" class="primary-btn" data-communication-action="save">Save Question Set</button>
      </div>
      <p id="communication-status" role="status" aria-live="polite">${translated ? `Showing saved ${esc(root.ROOTS_QUESTION_TRANSLATION.languages[translated.language] || translated.language)} translation.` : ""}</p>
      <section class="printable-question-card" aria-labelledby="print-question-title"><h2 id="print-question-title">ROOTS Restaurant Questions</h2>
        ${groups.length ? groups.map((group) => `<section class="question-group" aria-labelledby="question-${esc(group.category.toLowerCase().replace(" ", "-"))}"><h3 id="question-${esc(group.category.toLowerCase().replace(" ", "-"))}">${esc(group.category)}</h3>${group.questions.map((item) => { const shown = displayQuestion(item); return `<article class="server-question-card priority-${esc(item.priority)}" data-question-id="${esc(item.id)}" aria-label="${esc(priorityLabel(item.priority))}: ${esc(shown.question)}"><p class="question-priority">${esc(priorityLabel(item.priority))}</p><h4>${esc(shown.question)}</h4><p><b>Why ask:</b> ${esc(shown.reason)}</p><div class="question-actions"><button type="button" class="text-btn" data-question-action="copy">Copy</button><button type="button" class="text-btn" data-question-action="translate">Translate</button><button type="button" class="text-btn" data-question-action="speak">Speak</button></div></article>`; }).join("")}</section>`).join("") : '<div class="communication-empty"><h3>No unresolved questions</h3><p>The available deterministic evidence did not identify an ingredient, preparation, cross-contact, or selected-modification question.</p></div>'}
        <footer>Generated from ROOTS evidence. Confirm current ingredients and preparation with restaurant staff.</footer>
      </section>`;
    const select = $("communication-language"); if (select && translated) select.value = translated.language;
  }
  function open(context, button) {
    trigger = button || document.activeElement; translated = null; set = root.ROOTS_SERVER_QUESTIONS.generate(context);
    parentModal = trigger?.closest?.(".modal.open") || null; if (parentModal) parentModal.setAttribute("aria-hidden", "true");
    const modal = $("restaurant-communication-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); render(); $("restaurant-communication-close").focus();
  }
  function openMeal(input, button) { open(mealContext(input), button); }
  function openSaved(savedMealId, button) { const record = root.ROOTS_SAVED_MEALS?.get(savedMealId); if (record) open(savedContext(record), button); }
  function openSet(setId, button) { const stored = root.ROOTS_QUESTION_STORAGE.get(setId); if (!stored) return; trigger = button || document.activeElement; set = stored; translated = null; $("restaurant-communication-modal").classList.add("open"); $("restaurant-communication-modal").setAttribute("aria-hidden", "false"); render(); $("restaurant-communication-close").focus(); }
  function close() { root.ROOTS_QUESTION_ACTIONS.stop(); $("restaurant-communication-modal").classList.remove("open"); $("restaurant-communication-modal").setAttribute("aria-hidden", "true"); if (parentModal) parentModal.setAttribute("aria-hidden", "false"); set = null; translated = null; parentModal = null; trigger?.focus?.(); }
  function renderSaved() {
    const target = $("savedQuestionSets"); if (!target) return;
    const records = root.ROOTS_QUESTION_STORAGE.list();
    target.innerHTML = records.length ? records.map((item) => `<article class="saved-question-set" data-question-set-id="${esc(item.id)}"><div><h4>${esc(item.name)}</h4><p>${esc(item.restaurant.name || "Restaurant")} · ${item.questions.length} question(s)</p></div><button type="button" class="ghost-btn" data-saved-question-action="open">Open</button><button type="button" class="text-btn" data-saved-question-action="delete">Delete</button></article>`).join("") : '<p class="empty-state">Question sets you save will appear here.</p>';
  }
  async function action(event) {
    if (!set) return;
    const questionCard = event.target.closest("[data-question-id]"), questionAction = event.target.closest("[data-question-action]")?.dataset.questionAction;
    if (questionCard && questionAction) {
      const item = set.questions.find((entry) => entry.id === questionCard.dataset.questionId), shown = displayQuestion(item);
      if (questionAction === "copy") await root.ROOTS_QUESTION_ACTIONS.copy(shown.question);
      else if (questionAction === "translate") {
        const select = $("communication-language"), status = $("communication-status");
        if (!select?.value) { status.textContent = "Choose a translation language first."; select?.focus(); return; }
        try { translated = await root.ROOTS_QUESTION_TRANSLATION.translate(set, select.value); render(); }
        catch (error) { status.textContent = error.message || "Translation could not be completed."; }
      } else root.ROOTS_QUESTION_ACTIONS.speak(shown.question, translated?.language);
      return;
    }
    const name = event.target.closest("[data-communication-action]")?.dataset.communicationAction, status = $("communication-status");
    if (!name) return;
    try {
      if (name === "copy-all") { await root.ROOTS_QUESTION_ACTIONS.copy(root.ROOTS_QUESTION_ACTIONS.text(set, translated)); status.textContent = "Questions copied."; }
      else if (name === "share") await root.ROOTS_QUESTION_ACTIONS.share(set, translated);
      else if (name === "speak-all") root.ROOTS_QUESTION_ACTIONS.speak(set.questions.map((item) => displayQuestion(item).question).join(" "), translated?.language);
      else if (name === "print") root.ROOTS_QUESTION_ACTIONS.print();
      else if (name === "travel") root.ROOTS_TRAVEL?.open({ questionSet: set, translatedQuestions: translated }, event.target);
      else if (name === "save") { const saved = root.ROOTS_QUESTION_STORAGE.save(set, `${set.dish.name || set.restaurant.name || "Restaurant"} Questions`); set = saved; status.textContent = "Question set saved on this device."; renderSaved(); }
    } catch (error) { status.textContent = error.message || "That action could not be completed."; }
  }
  function bind() {
    $("restaurant-communication-close")?.addEventListener("click", close);
    $("restaurant-communication-content")?.addEventListener("click", action);
    $("restaurant-communication-content")?.addEventListener("change", async (event) => {
      if (event.target.id !== "communication-language" || !set) return;
      const status = $("communication-status"), language = event.target.value;
      if (!language) { translated = null; render(); return; }
      status.textContent = "Translating questions…";
      try { translated = await root.ROOTS_QUESTION_TRANSLATION.translate(set, language); render(); }
      catch (error) { status.textContent = error.message || "Translation could not be completed."; event.target.value = ""; }
    });
    $("savedQuestionSets")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-question-set-id]"), actionName = event.target.closest("[data-saved-question-action]")?.dataset.savedQuestionAction;
      if (!card || !actionName) return;
      if (actionName === "open") openSet(card.dataset.questionSetId, event.target);
      else if (root.confirm?.("Delete this saved question set?")) { root.ROOTS_QUESTION_STORAGE.remove(card.dataset.questionSetId); renderSaved(); }
    });
    document.addEventListener("keydown", (event) => {
      const modal = $("restaurant-communication-modal"); if (!modal?.classList.contains("open")) return;
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...modal.querySelectorAll("button:not([disabled]), select:not([disabled])")]; if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
  }
  function init() { if (initialized) return; initialized = true; bind(); renderSaved(); }
  root.ROOTS_RESTAURANT_COMMUNICATION = { init, open, openMeal, openSaved, openSet, close, renderSaved, getSet: () => set };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
