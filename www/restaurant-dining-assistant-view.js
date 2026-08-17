(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const list = (value) => Array.isArray(value) ? value : [];
  let initialized = false, context = null, session = null, trigger = null, parentModal = null, mode = "standard", card = null;
  function tree(dish) {
    if (!dish) return "";
    const unknownIds = new Set(list(dish.unknowns).map((item) => item.id));
    return `<section class="decision-tree" aria-labelledby="decision-tree-title"><h3 id="decision-tree-title">Decision Tree</h3><p>Follow the evidence ROOTS used. Expand any branch for its source and server question.</p>
      <ul>${list(dish.evidence).map((item) => `<li><details><summary><span>${esc(item.text)}</span><b>${esc(unknownIds.has(item.id) || ["unknown", "needs_confirmation"].includes(item.level) ? "Unknown" : item.level.replaceAll("_", " "))}</b></summary><p><b>Source:</b> ${esc(item.source.replaceAll("_", " "))}</p><p><b>Effect:</b> ${esc(item.effect || "Evidence only")}</p>${unknownIds.has(item.id) ? "<p>This uncertainty prevents a fully compatible result until restaurant staff confirm it.</p>" : ""}</details></li>`).join("") || "<li>No component evidence is available.</li>"}
      <li class="decision-tree-verdict"><span>Verdict</span><b>${esc(dish.verdict.replaceAll("_", " "))}</b></li></ul></section>`;
  }
  function technical(dish) {
    return `<section class="technical-explanation"><h3>Technical Explanation</h3><p>Unknown evidence propagates to Needs Confirmation. Confirmed conflicts propagate to Avoid. Gemini cannot change these results.</p>
      <h4>Rule trace</h4><ol>${list(dish?.ruleTrace).map((item) => `<li><code>${esc(item.ruleId || "rule")}</code> from evidence <code>${esc(item.evidenceId || "unknown")}</code> → ${esc(item.effect || "contributes")}</li>`).join("") || "<li>No rule trace was recorded.</li>"}</ol></section>`;
  }
  function askPanel() {
    const dish = session.context.dish, suggestions = [
      dish ? "Why does this dish have this verdict?" : "Why does this restaurant have this ranking?",
      ...(dish?.unknowns.length ? ["What is still unknown?", "What should I ask my server?"] : []),
      ...(dish?.modifications.length ? ["Can I remove something?"] : []), "Explain simply.",
    ];
    const serverQuestions = root.ROOTS_SERVER_QUESTIONS.generate({ ...context, dishEvidence: context?.dish || context?.evaluation });
    return `<section class="dining-assistant-panel"><div class="assistant-mode-switch" aria-label="Explanation mode"><button type="button" class="${mode === "simple" ? "active" : ""}" data-explain-mode="simple">Explain Like I'm 12</button><button type="button" class="${mode === "standard" ? "active" : ""}" data-explain-mode="standard">Clear Explanation</button><button type="button" class="${mode === "technical" ? "active" : ""}" data-explain-mode="technical">Technical</button></div>
      ${tree(dish)}${mode === "technical" ? technical(dish) : ""}
      <section class="assistant-conversation" aria-labelledby="ask-roots-title"><h3 id="ask-roots-title">Ask ROOTS</h3><p>ROOTS can explain current evidence, but it cannot change the deterministic verdict.</p>
        <div class="assistant-suggestions">${suggestions.map((item) => `<button type="button" class="chip" data-assistant-question="${esc(item)}">${esc(item)}</button>`).join("")}</div>
        <div id="dining-conversation" class="dining-conversation" role="log" aria-live="polite">${session.messages.map((item) => `<article class="assistant-message ${esc(item.role)}"><b>${item.role === "user" ? "You" : "ROOTS"}</b><p>${esc(item.text)}</p></article>`).join("")}</div>
        <form id="dining-assistant-form"><label for="dining-assistant-input">Ask about this ${dish ? "dish" : "restaurant"}</label><div><input id="dining-assistant-input" maxlength="800" required autocomplete="off"><button class="primary-btn" type="submit">Ask ROOTS</button></div></form>
        <p id="dining-assistant-status" role="status" aria-live="polite"></p></section>
      <section class="restaurant-conversation" aria-labelledby="restaurant-conversation-title"><h3 id="restaurant-conversation-title">Restaurant Conversation</h3><p>Try a possible staff response. ROOTS records it as evidence and requires deterministic reevaluation before any verdict can change.</p>
        ${serverQuestions.questions.length ? serverQuestions.questions.map((item) => `<div class="server-response-row" data-server-question-id="${esc(item.id)}"><p>${esc(item.question)}</p><label>Possible staff response<select><option value="not_sure">They are not sure</option><option value="confirmed_yes">Yes</option><option value="confirmed_no">No</option></select></label><button type="button" class="ghost-btn" data-server-response>Use response</button></div>`).join("") : "<p>No unresolved evidence generated a server conversation.</p>"}
        <p id="server-response-status" role="status" aria-live="polite"></p></section></section>`;
  }
  function cardPanel() {
    if (!card) card = root.ROOTS_DINING_CARD.generate({ ...context, questionSet: context.questionSet || root.ROOTS_SERVER_QUESTIONS.generate({ ...context, dishEvidence: context?.dish || context?.evaluation }) });
    return `<section class="dining-assistant-panel"><div class="dining-card-controls"><label>Card layout<select id="dining-card-layout"><option value="phone">Phone</option><option value="small">Small</option><option value="portrait">Printable portrait</option><option value="landscape">Printable landscape</option></select></label><label>Card theme<select id="dining-card-theme"><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Translation<select id="dining-card-language"><option value="">English</option>${Object.entries(root.ROOTS_QUESTION_TRANSLATION?.languages || {}).map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`).join("")}</select></label><button type="button" class="ghost-btn" data-card-action="copy">Copy</button><button type="button" class="ghost-btn" data-card-action="speak">Speak</button><button type="button" class="primary-btn" data-card-action="print">Print Card</button></div>
      <article id="roots-dining-card" class="roots-dining-card layout-phone theme-light"><p class="eyebrow">${esc(card.title)}</p><h3>${esc(card.restaurant.name || "Restaurant communication")}</h3><p>${esc(card.introduction)}</p><h4>Important restrictions</h4><ul>${card.restrictions.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Please review the server questions below.</li>"}</ul><h4>Could you please check?</h4><ul>${card.questions.map((item) => `<li>${esc(item.text)}</li>`).join("") || "<li>No unresolved questions were generated from current evidence.</li>"}</ul><p class="dining-card-thanks">${esc(card.thanks)}</p></article><p id="dining-card-status" role="status" aria-live="polite"></p></section>`;
  }
  function ingredientDetail(item) {
    return `<article class="ingredient-explorer-detail"><h3>${esc(item.label)}</h3><p>${esc(item.explanation)}</p><dl><div><dt>Common names and aliases</dt><dd>${esc(item.aliases.join(", ") || "No aliases recorded")}</dd></div><div><dt>Why it matters</dt><dd>${esc(item.conflicts.join(", ") || "No direct profile conflict is encoded for this ingredient alone")}</dd></div><div><dt>Possible sources</dt><dd>${esc(item.possibleSources.join(", ") || "No source variants recorded")}</dd></div><div><dt>Known uncertainty</dt><dd>${esc(item.uncertainty || "No source-dependent uncertainty recorded")}</dd></div></dl><p class="muted">Ingredient information is educational. A dish verdict still comes from the deterministic evidence engine and your profile.</p></article>`;
  }
  function ingredientPanel() {
    return `<section class="dining-assistant-panel"><h3>Restaurant Glossary & Ingredient Explorer</h3><p>Search ROOTS' local ingredient knowledge. This does not classify a dish by itself.</p><form id="ingredient-explorer-form"><label for="ingredient-explorer-input">Ingredient or restaurant term</label><div><input id="ingredient-explorer-input" type="search" maxlength="120" placeholder="Paneer, ghee, mirin, rennet…"><button type="submit" class="primary-btn">Search</button></div></form><div id="ingredient-explorer-results" aria-live="polite"></div></section>`;
  }
  function render(panel = "ask") {
    const target = $("dining-assistant-content"); if (!target || !session) return;
    target.innerHTML = `<header class="dining-assistant-hero"><p class="eyebrow">Evidence-bound restaurant guide</p><h2>${esc(session.context.dish?.name || session.context.restaurant.name || "Dining Assistant")}</h2><p>AI explains. ROOTS' deterministic engine decides.</p></header><nav class="dining-assistant-tabs" aria-label="Dining Assistant sections"><button type="button" data-assistant-tab="ask" ${panel === "ask" ? 'aria-current="page"' : ""}>Ask ROOTS</button><button type="button" data-assistant-tab="card" ${panel === "card" ? 'aria-current="page"' : ""}>Dining Card</button><button type="button" data-assistant-tab="ingredients" ${panel === "ingredients" ? 'aria-current="page"' : ""}>Ingredients</button></nav>${panel === "card" ? cardPanel() : panel === "ingredients" ? ingredientPanel() : askPanel()}`;
  }
  function open(input, button, panel) {
    context = input; session = root.ROOTS_DINING_ASSISTANT.session(input); trigger = button || document.activeElement; card = null;
    parentModal = trigger?.closest?.(".modal.open") || null; if (parentModal) parentModal.setAttribute("aria-hidden", "true");
    const modal = $("dining-assistant-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); render(panel); $("dining-assistant-close").focus();
  }
  function close() { root.ROOTS_QUESTION_ACTIONS?.stop(); $("dining-assistant-modal").classList.remove("open"); $("dining-assistant-modal").setAttribute("aria-hidden", "true"); if (parentModal) parentModal.setAttribute("aria-hidden", "false"); session?.clear(); session = context = card = null; parentModal = null; trigger?.focus?.(); }
  async function ask(text) {
    const status = $("dining-assistant-status"); status.textContent = root.navigator?.onLine === false ? "Showing the available offline evidence explanation." : "Reviewing existing evidence…";
    const result = await session.ask(text, { mode }); render("ask");
    $("dining-assistant-status").textContent = result.offline ? "This explanation used local deterministic evidence." : "Explanation generated from the cited ROOTS evidence.";
  }
  function bind() {
    $("dining-assistant-close")?.addEventListener("click", close);
    $("dining-assistant-content")?.addEventListener("click", async (event) => {
      const tab = event.target.closest("[data-assistant-tab]")?.dataset.assistantTab; if (tab) { render(tab); return; }
      const explainMode = event.target.closest("[data-explain-mode]")?.dataset.explainMode; if (explainMode) { mode = explainMode; render("ask"); return; }
      const question = event.target.closest("[data-assistant-question]")?.dataset.assistantQuestion; if (question) { await ask(question); return; }
      const responseRow = event.target.closest("[data-server-question-id]");
      if (responseRow && event.target.closest("[data-server-response]")) {
        const set = root.ROOTS_SERVER_QUESTIONS.generate({ ...context, dishEvidence: context?.dish || context?.evaluation });
        const questionItem = set.questions.find((item) => item.id === responseRow.dataset.serverQuestionId);
        const response = root.ROOTS_DINING_ASSISTANT.serverResponse(questionItem, responseRow.querySelector("select").value, context?.reEvaluate);
        $("server-response-status").textContent = response.evaluation ? `Deterministic reevaluation: ${response.evaluation.verdict || "updated evidence available"}.` : response.message;
        return;
      }
      const resultButton = event.target.closest("[data-ingredient-id]"); if (resultButton) { $("ingredient-explorer-results").innerHTML = ingredientDetail(root.ROOTS_INGREDIENT_EXPLORER.get(resultButton.dataset.ingredientId)); return; }
      const action = event.target.closest("[data-card-action]")?.dataset.cardAction; if (!action) return;
      const text = [card.introduction, ...card.restrictions, ...card.questions.map((item) => item.text), card.thanks].join("\n");
      if (action === "copy") await root.ROOTS_QUESTION_ACTIONS.copy(text);
      else if (action === "speak") root.ROOTS_QUESTION_ACTIONS.speak(text, card.language);
      else root.print();
    });
    $("dining-assistant-content")?.addEventListener("change", async (event) => {
      if (event.target.id === "dining-card-layout") $("roots-dining-card").className = `roots-dining-card layout-${event.target.value} theme-${$("dining-card-theme").value}`;
      else if (event.target.id === "dining-card-theme") $("roots-dining-card").className = `roots-dining-card layout-${$("dining-card-layout").value} theme-${event.target.value}`;
      else if (event.target.id === "dining-card-language" && event.target.value) {
        const status = $("dining-card-status"); status.textContent = "Translating card…";
        try { card = await root.ROOTS_DINING_CARD.translate(card, event.target.value); render("card"); } catch (error) { status.textContent = error.message; }
      }
    });
    $("dining-assistant-content")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (event.target.id === "dining-assistant-form") await ask($("dining-assistant-input").value);
      else if (event.target.id === "ingredient-explorer-form") {
        const results = root.ROOTS_INGREDIENT_EXPLORER.search($("ingredient-explorer-input").value);
        $("ingredient-explorer-results").innerHTML = results.length ? `<ul class="ingredient-search-results">${results.map((item) => `<li><button type="button" data-ingredient-id="${esc(item.id)}"><b>${esc(item.label)}</b><span>${esc(item.aliases.slice(0, 3).join(", ") || item.categories.join(", "))}</span></button></li>`).join("")}</ul>` : "<p>No matching term is in the local ROOTS knowledge base.</p>";
      }
    });
    document.addEventListener("keydown", (event) => {
      const modal = $("dining-assistant-modal"); if (!modal?.classList.contains("open")) return;
      if (event.key === "Escape") { close(); return; } if (event.key !== "Tab") return;
      const controls = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), summary")];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
  }
  function init() { if (initialized || !$("dining-assistant-modal")) return; initialized = true; bind(); }
  root.ROOTS_DINING_ASSISTANT_VIEW = { init, open, close, getSession: () => session };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
