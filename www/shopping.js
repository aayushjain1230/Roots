/* ============================================================
   ROOTS — Shopping List tab

   A saved shopping list (localStorage) plus AI suggestions of diet-compliant
   products/snacks (via window.BIJ_OCR.generateText, grounded in the profile).
   Depends on globals from script.js: escapeHtml, getDietProfile, describeDiet.
   ============================================================ */
(function () {
  "use strict";

  const KEY = "bij-shopping-v1";
  const $ = (id) => document.getElementById(id);

  function load() {
    try { const l = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (_) { return []; }
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {} }
  let items = load();

  function render() {
    const el = $("shoppingList");
    if (!el) return;
    if (!items.length) {
      el.innerHTML = `<p class="empty-state">Your list is empty. Add items below, or tap “Suggest products”.</p>`;
      return;
    }
    el.innerHTML = items.map((it, i) => `
      <div class="shop-row ${it.done ? "done" : ""}">
        <label class="shop-check"><input type="checkbox" data-idx="${i}" ${it.done ? "checked" : ""}><span></span></label>
        <div class="shop-text"><b>${escapeHtml(it.name)}</b>${it.note ? `<span>${escapeHtml(it.note)}</span>` : ""}</div>
        <button class="shop-del" data-del="${i}" type="button" aria-label="Remove">&times;</button>
      </div>`).join("");
  }

  function addItem(name, note) {
    name = (name || "").trim();
    if (!name) return;
    if (items.some((it) => it.name.toLowerCase() === name.toLowerCase())) return; // dedupe
    items.unshift({ name, note: note || "", done: false });
    save(items); render();
  }

  // Manual add
  if ($("shopAdd")) $("shopAdd").addEventListener("click", () => { addItem($("shopInput").value); $("shopInput").value = ""; $("shopInput").focus(); });
  if ($("shopInput")) $("shopInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addItem($("shopInput").value); $("shopInput").value = ""; } });

  // List interactions (toggle done / delete)
  if ($("shoppingList")) $("shoppingList").addEventListener("click", (e) => {
    const cb = e.target.closest("input[type=checkbox][data-idx]");
    if (cb) { const i = +cb.dataset.idx; if (items[i]) { items[i].done = cb.checked; save(items); render(); } return; }
    const del = e.target.closest("button[data-del]");
    if (del) { items.splice(+del.dataset.del, 1); save(items); render(); }
  });

  if ($("shopClear")) $("shopClear").addEventListener("click", () => { items = []; save(items); render(); });

  // AI suggestions of compliant products
  function renderSuggestions(list) {
    const el = $("shopSuggestions");
    if (!el) return;
    if (!list.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<h4>Tap to add</h4>` + list.map((s) =>
      `<button class="suggest-chip" type="button" data-name="${escapeHtml(s.name)}" data-note="${escapeHtml(s.note || "")}">+ ${escapeHtml(s.name)}</button>`
    ).join("");
  }
  if ($("shopSuggestions")) $("shopSuggestions").addEventListener("click", (e) => {
    const chip = e.target.closest(".suggest-chip");
    if (!chip) return;
    addItem(chip.dataset.name, chip.dataset.note);
    chip.disabled = true; chip.textContent = "✓ " + chip.dataset.name;
  });

  if ($("shopSuggest")) $("shopSuggest").addEventListener("click", async () => {
    const btn = $("shopSuggest");
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "Thinking…";
    try {
      const profile = window.ROOTS_PROFILE.getActiveProfile();
      const profileContext = profile ? window.ROOTS_PROFILE.getProfileForAI(profile) : "";
      const prompt = `${profileContext}\n\nSuggest up to 8 widely-available packaged grocery ` +
        `products or snacks that fit this diet (think brands/categories a shopper could look for). ` +
        `Respond ONLY with a JSON array of objects {"name","note"} where note is a short reason or tip. No other text.`;
      const text = await window.BIJ_OCR.generateText(prompt, { json: true, temperature: 0.7 });
      let list = [];
      try { list = JSON.parse(text); } catch (_) { list = []; }
      if (!Array.isArray(list)) list = [];
      list = list.filter((s) => s && s.name).slice(0, 8);
      if (!list.length) { $("shopSuggestions").innerHTML = `<p class="empty-state">No suggestions right now — try again.</p>`; }
      else renderSuggestions(list);
    } catch (err) {
      $("shopSuggestions").innerHTML = `<p class="empty-state">${escapeHtml((err && err.message) || "Couldn't get suggestions.")}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  render();

  // Cross-module API (matches the window.BIJ_OCR / window.BIJ_FOODFACTS pattern) so other
  // tabs — e.g. the Assistant's Meal Ideas "add ingredients" button — can add items without
  // reaching into this closure's private state directly (which wouldn't re-render/persist).
  window.BIJ_SHOPPING = {
    addItems(list) {
      (list || []).forEach((it) => addItem(it && it.name, it && it.note));
    },
  };
})();
