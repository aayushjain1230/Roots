/* ============================================================
   ROOTS — AI tools

   Three tools, all powered by Gemini text (window.BIJ_OCR.generateText),
   always grounded in the user's diet profile (describeDiet / getDietProfile):
     - Ask:    food/ingredient/diet Q&A (multi-turn chat)
     - Recipe: convert a recipe to fit the diet (with substitutions)
     - Meals:  suggest compliant meal/snack ideas
   Depends on globals from script.js: escapeHtml, getDietProfile, describeDiet.
   ============================================================ */
(function () {
  "use strict";

  const CHAT_KEY = "bij-chat-v1";
  const CHAT_LIMIT = 40;

  const $ = (id) => document.getElementById(id);

  // Minimal, safe markdown: escape first, then **bold**. Newlines preserved by CSS pre-wrap.
  function mdLite(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function aiGuidance() {
    return "You are ROOTS, a food assistant. Be concise, practical, and friendly. Follow every supplied " +
      "religious diet, lifestyle restriction, allergy, and custom rule. The deterministic scan result is " +
      "authoritative: never override, recompute, or change Avoid to Safe. Separate confirmed facts from " +
      "uncertainty, recommend checking the label or manufacturer when evidence is incomplete, and never " +
      "claim guaranteed allergy safety or invent ingredients, preparation details, or certifications.";
  }
  function profileText() {
    try {
      const profile = window.ROOTS_PROFILE.getActiveProfile();
      return profile ? window.ROOTS_PROFILE.getProfileForAI(profile) : "";
    } catch (_) { return ""; }
  }
  function recentScansContext() {
    try {
      return [window.ROOTS_SCAN_PIPELINE?.getAIContext() || "", window.ROOTS_REPORT_AI_CONTEXT || ""]
        .filter(Boolean).join("\n\n");
    } catch (_) { return ""; }
  }

  /* ---------- Ask (chat) ---------- */
  function loadChat() {
    try { const h = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); return Array.isArray(h) ? h : []; } catch (_) { return []; }
  }
  function saveChat(history) {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-CHAT_LIMIT))); } catch (_) {}
  }
  let chatHistory = loadChat();

  function renderChat(thinking) {
    const log = $("chatLog");
    if (!log) return;
    // Empty chat = no placeholder box (the "e.g." hint above already covers it); CSS collapses it.
    let html = chatHistory.map((m) =>
      `<div class="chat-msg ${m.role === "user" ? "me" : "bot"}">${mdLite(m.text)}</div>`
    ).join("");
    if (thinking) html += `<div class="chat-msg bot thinking">Thinking…</div>`;
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    const clear = $("chatClear");
    if (clear) clear.style.display = chatHistory.length ? "" : "none";
  }

  async function sendChat() {
    const input = $("chatInput");
    const q = (input.value || "").trim();
    if (!q) return;
    input.value = "";
    chatHistory.push({ role: "user", text: q });
    renderChat(true);
    try {
      const priorTurns = chatHistory.slice(0, -1).slice(-8);
      const structured = window.ROOTS_ASK_CONTEXT?.build?.({}) || null;
      const ctx = recentScansContext();
      const prompt = `${aiGuidance()}\n\n${profileText()}${ctx ? "\n\n" + ctx : ""}\n\nStructured trusted context:\n${JSON.stringify(structured)}\n\n` +
        `Answer only from that context. If it is insufficient, say so. Return JSON {"answer":"...","usedEvidenceIds":[],"unknownsAcknowledged":true}. ` +
        `Every used evidence ID must come from allowedEvidenceIds. User question: ${q}`;
      const raw = await window.BIJ_OCR.generateText(prompt, { history: priorTurns, temperature: 0.2, json: true, task: "ask" });
      const validated = window.ROOTS_ASK_CONTEXT?.validateResponse?.(raw, structured);
      chatHistory.push({ role: "assistant", text: validated?.answer || window.ROOTS_ASK_CONTEXT?.fallback?.(structured) || "I don't know based on the available evidence." });
    } catch (err) {
      chatHistory.push({ role: "assistant", text: (err && err.message) || "Sorry, something went wrong." });
    }
    saveChat(chatHistory);
    renderChat(false);
  }
  if ($("chatSend")) $("chatSend").addEventListener("click", sendChat);
  if ($("chatInput")) $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } });
  if ($("chatClear")) $("chatClear").addEventListener("click", () => { chatHistory = []; saveChat(chatHistory); renderChat(false); });
  renderChat(false);

  /* ---------- Shared run helper for Recipe & Meals ---------- */
  async function runInto(btn, outEl, buildPrompt, emptyMsg, finalize) {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "Working…";
    outEl.innerHTML = `<div class="spinner"></div>`;
    try {
      const text = await window.BIJ_OCR.generateText(buildPrompt(), { temperature: 0.6, task: "recipe" });
      outEl.innerHTML = finalize ? finalize(text) : `<div class="assistant-answer">${mdLite(text)}</div>`;
    } catch (err) {
      outEl.innerHTML = `<p class="empty-state">${escapeHtml((err && err.message) || emptyMsg)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  }

  /* ---------- Recipe converter ---------- */
  if ($("recipeBtn")) $("recipeBtn").addEventListener("click", () => {
    const recipe = ($("recipeInput").value || "").trim();
    if (!recipe) { $("recipeOut").innerHTML = `<p class="empty-state">Paste a recipe first.</p>`; return; }
    runInto($("recipeBtn"), $("recipeOut"), () =>
      `${profileText()}\n\nSuggest a transformed version of this recipe for the user's profile. Replace known conflicts, but do not claim the result is verified or safe. ` +
      `ingredient with a good substitution. Respond with: a **Title**, an **Ingredients** list, **Steps**, ` +
      `and a short **Swaps made** note. Keep it practical.\n\nRecipe:\n${recipe}`,
      "Couldn't convert that recipe.",
      (text) => {
        const check = window.ROOTS_RECIPE_MEAL_ENGINE?.analyzeIngredients?.(text, getDietProfile());
        const label = check?.status === "MATCH" ? "No known conflicts in the generated ingredient text" : check?.status === "CONFLICT" ? "Generated recipe still has a conflict" : "Generated recipe needs verification";
        return `<div class="assistant-answer"><p><strong>${escapeHtml(label)}</strong></p><p>${escapeHtml(check?.reason || "Review every ingredient before using this suggestion.")}</p>${mdLite(text)}</div>`;
      });
  });

  /* ---------- Meal builder ---------- */
  // Structured (JSON) rather than free-text, specifically so each idea's ingredient list is
  // available to add straight to the Shopping List tab (see window.BIJ_SHOPPING.addItems).
  let lastMeals = [];
  function renderMeals(meals) {
    const el = $("mealOut");
    if (!meals.length) { el.innerHTML = `<p class="empty-state">No meal ideas right now — try again.</p>`; return; }
    lastMeals = meals;
    el.innerHTML = meals.map((m, i) => {
      const ingredients = Array.isArray(m.ingredients) ? m.ingredients.filter(Boolean) : [];
      return `
        <div class="meal-card">
          <b>${escapeHtml(m.name || "Meal idea")}</b>
          ${m.reason ? `<p>${escapeHtml(m.reason)}</p>` : ""}
          ${m.modification ? `<p class="meal-mod">Tip: ${escapeHtml(m.modification)}</p>` : ""}
          <p class="meal-validation"><strong>${escapeHtml(m.deterministicStatus === "MATCH" ? "No known conflicts" : m.deterministicStatus === "CONFLICT" ? "Conflict found" : "Needs verification")}</strong> Â· ${escapeHtml(m.deterministicReason || "Review the ingredients.")}</p>
          ${ingredients.length ? `
            <div class="meal-ingredients">${ingredients.map(escapeHtml).join(" · ")}</div>
            <button type="button" class="add-to-shop-btn" data-idx="${i}">+ Add ingredients to Shopping List</button>
          ` : ""}
        </div>`;
    }).join("");
  }
  if ($("mealOut")) $("mealOut").addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-shop-btn");
    if (!btn) return;
    const meal = lastMeals[+btn.dataset.idx];
    if (!meal || !window.BIJ_SHOPPING) return;
    window.BIJ_SHOPPING.addItems(
      (meal.ingredients || []).filter(Boolean).map((name) => ({ name, note: `For ${meal.name || "a meal idea"}` }))
    );
    btn.disabled = true;
    btn.textContent = "✓ Added to Shopping List";
  });
  if ($("mealBtn")) $("mealBtn").addEventListener("click", async () => {
    const btn = $("mealBtn");
    const outEl = $("mealOut");
    const req = ($("mealInput").value || "").trim() || "anything that fits my diet";
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "Working…";
    outEl.innerHTML = `<div class="spinner"></div>`;
    try {
      const prompt = `${profileText()}\n\nSuggest 3 meal or snack candidates for deterministic checking for this ` +
        `request: "${req}". Respond ONLY with a JSON array of exactly 3 objects: ` +
        `{"name","reason","modification","ingredients"} — "reason" is a one-line reason it fits, ` +
        `"modification" is any quick tweak needed to keep it compliant (empty string if none), and ` +
        `"ingredients" is an array of short, shopping-list-ready ingredient names needed to make it. ` +
        `No other text.`;
      const text = await window.BIJ_OCR.generateText(prompt, { json: true, temperature: 0.6, task: "meals" });
      let meals = [];
      try { meals = JSON.parse(text); } catch (_) { meals = []; }
      const validated = window.ROOTS_RECIPE_MEAL_ENGINE?.validateMealIdeas?.(meals, getDietProfile()) || [];
      renderMeals(validated);
    } catch (err) {
      outEl.innerHTML = `<p class="empty-state">${escapeHtml((err && err.message) || "Couldn't suggest meals right now.")}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });
})();
