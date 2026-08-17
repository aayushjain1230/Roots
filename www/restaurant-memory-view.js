(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const clean = (value, limit = 2000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const NOTES_INDEX = "roots-restaurant-note-index-v1", NOTES_PREFIX = "roots-restaurant-note-v1:";
  let query = "", filters = {}, sortId = "recently_saved", trigger = null, initialized = false, timer = null, currentId = null;
  const noteIds = () => { try { const value = JSON.parse(localStorage.getItem(NOTES_INDEX)); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const notes = (restaurantId, dishId) => noteIds().map((id) => { try { return JSON.parse(localStorage.getItem(NOTES_PREFIX + id)); } catch (_) { return null; } }).filter((item) => item && (!restaurantId || item.restaurantLocationId === restaurantId) && (!dishId || item.dishId === dishId));
  function saveNote(input) {
    const id = input.id || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { schemaVersion: 1, id, restaurantLocationId: clean(input.restaurantLocationId, 180), dishId: clean(input.dishId, 180) || null, type: input.type === "staff_confirmation" ? "staff_confirmation" : "personal_note", statement: clean(input.statement, 2000), source: "user_note", scope: "personal", confirmedAt: input.confirmedAt || new Date().toISOString(), userVerified: true };
    if (!record.restaurantLocationId || !record.statement) throw new TypeError("A location-specific note is required.");
    localStorage.setItem(NOTES_PREFIX + id, JSON.stringify(record)); localStorage.setItem(NOTES_INDEX, JSON.stringify([id, ...noteIds().filter((item) => item !== id)].slice(0, 500))); return record;
  }
  function removeNote(id) { localStorage.removeItem(NOTES_PREFIX + id); localStorage.setItem(NOTES_INDEX, JSON.stringify(noteIds().filter((item) => item !== id))); }
  const verdict = (value) => String(value || "Unknown").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const recheckCopy = (value) => ({ current: "Checked recently", recommended: "Recheck recommended", required: "Review before ordering", unavailable: "Dish no longer available" }[value] || "Review status unavailable");
  function card(record) {
    return `<article class="saved-meal-card" data-meal-id="${esc(record.id)}" aria-label="${esc(record.name)} at ${esc(record.restaurant.name)}">
      <div><p class="saved-meal-favorite">${record.favorite ? "Favorite meal" : "Saved meal"}</p><h4>${esc(record.name)}</h4><p>${esc(record.restaurant.name)}</p>
      <p><b>${esc(verdict(record.evaluation.verdict))} when saved</b> · ${esc(recheckCopy(record.recheckStatus))}</p>
      <small>Saved for ${esc(record.profile.profileName)} · Checked ${esc(new Date(record.lastCheckedAt).toLocaleDateString())}${record.timesUsed ? ` · Used ${record.timesUsed} time${record.timesUsed === 1 ? "" : "s"}` : ""}</small></div>
      <div class="saved-meal-card-actions"><button type="button" class="primary-btn" data-memory-action="again">Order Again</button><button type="button" class="ghost-btn" data-memory-action="open">Details</button><button type="button" class="text-btn" data-memory-action="favorite" aria-pressed="${record.favorite ? "true" : "false"}">${record.favorite ? "Unfavorite" : "Favorite"}</button><button type="button" class="text-btn" data-memory-action="archive">${record.status === "archived" ? "Restore" : "Archive"}</button><button type="button" class="text-btn" data-memory-action="delete">Delete</button></div>
    </article>`;
  }
  function render() {
    const target = $("savedMealsList"), historyTarget = $("restaurantOrderHistory"), restaurantTarget = $("savedRestaurantsList");
    if (!target || !root.ROOTS_SAVED_MEALS) return;
    const records = root.ROOTS_MEMORY_SEARCH.query(root.ROOTS_SAVED_MEALS.list({ includeArchived: true }), { query, filters, sort: sortId });
    target.innerHTML = records.length ? records.slice(0, 250).map(card).join("") : `<div class="memory-empty"><h4>${query ? "No saved meals found" : "No saved meals yet"}</h4><p>${query ? "Clear search or change the filters." : "Build an order at a restaurant and save it for next time."}</p>${query ? '<button type="button" class="text-btn" data-memory-action="clear-search">Clear Search</button>' : '<button type="button" class="primary-btn" data-memory-action="find-restaurants">Find Restaurants</button>'}</div>`;
    const restaurants = [...new Map(root.ROOTS_SAVED_MEALS.list().map((item) => [item.restaurant.restaurantId, item.restaurant])).values()];
    if (restaurantTarget) restaurantTarget.innerHTML = restaurants.length ? restaurants.map((item) => `<article class="saved-restaurant-card"><h4>${esc(item.name)}</h4><p>${esc(item.address || "Address not stored")} · ${root.ROOTS_SAVED_MEALS.list({ restaurantId: item.restaurantId }).length} saved meal(s)</p></article>`).join("") : '<p class="empty-state">Restaurants with saved meals will appear here.</p>';
    const orders = root.ROOTS_ORDER_HISTORY?.list() || [];
    historyTarget.innerHTML = orders.length ? orders.slice(0, 100).map((item) => `<article class="order-history-card" data-order-id="${esc(item.id)}"><h4>${esc(item.mealName)}</h4><p>${esc(item.restaurantName)} · ${esc(new Date(item.orderedAt).toLocaleDateString())}</p><p>${esc(verdict(item.evaluationSnapshot.verdict))} when checked · Modifications confirmed: ${esc(item.userOutcome.restaurantConfirmed.replaceAll("_", " "))}</p><button type="button" class="text-btn" data-memory-action="delete-order">Delete record</button></article>`).join("") : '<div class="memory-empty"><h4>No restaurant orders yet</h4><p>Orders you mark as completed will appear here.</p></div>';
  }
  function comparison(result) {
    const changes = result.inspection.changes;
    return `<section class="memory-comparison"><div><p class="eyebrow">When saved</p><h3>${esc(verdict(result.original.evaluation.verdict))}</h3><p>${esc(result.original.meal.mainDishName)}</p><p>Checked ${esc(new Date(result.original.evaluation.evaluatedAt).toLocaleDateString())}</p></div>
      <div><p class="eyebrow">Current check</p><h3>${esc(result.current ? verdict(result.current.analysis.verdict) : "Unavailable")}</h3><p>${esc(result.inspection.state === "UNCHANGED" ? "The meal still matches your current profile. Review it before ordering." : "Review this meal before ordering again.")}</p></div></section>
      <section aria-labelledby="memory-change-title"><h3 id="memory-change-title">Review Changes</h3><ul>${changes.map((item) => `<li><b>${esc(item.section)}:</b> ${esc(item.message)}</li>`).join("") || "<li>No relevant profile, menu, dish, modifier, or engine change was detected.</li>"}</ul>
      ${result.inspection.missingModifiers?.length ? `<h4>Unavailable saved options</h4><ul>${result.inspection.missingModifiers.map((item) => `<li>${esc(item.label)}</li>`).join("")}</ul>` : ""}
      ${result.inspection.supportedAlternatives?.length ? `<h4>Current menu-supported alternatives</h4><ul>${result.inspection.supportedAlternatives.map((item) => `<li>${esc(item.label)} — review before selecting</li>`).join("")}</ul>` : ""}
      ${result.similarDishes?.length ? `<h4>Possible alternatives</h4><ul>${result.similarDishes.map((item) => `<li>${esc(item.dishName)} — ${esc(verdict(item.verdict))}</li>`).join("")}</ul>` : ""}</section>`;
  }
  function open(recordId, action, button) {
    const record = root.ROOTS_SAVED_MEALS.get(recordId); if (!record) return;
    trigger = button || document.activeElement; currentId = recordId;
    const modal = $("restaurant-memory-modal"), content = $("restaurant-memory-content");
    $("restaurant-memory-title").textContent = record.name;
    if (action === "again") {
      let result; try { result = root.ROOTS_ORDER_RECHECK.inspect(recordId); } catch (_) { result = null; }
      content.innerHTML = result ? `${comparison(result)}<div class="memory-actions"><button type="button" class="primary-btn" data-memory-detail-action="review">Review Order</button><button type="button" class="ghost-btn" data-memory-detail-action="copy">Copy Order</button><button type="button" class="text-btn" data-memory-detail-action="keep">Keep Saved Version</button></div>` : '<p role="alert">The current check could not be completed. The historical record is still available.</p>';
    } else {
      const personal = notes(record.restaurant.locationId, record.meal.mainDishId);
      content.innerHTML = `<p><b>${esc(verdict(record.evaluation.verdict))} when saved.</b> This is a historical result, not permanent proof.</p>
        <dl class="memory-details"><div><dt>Restaurant</dt><dd>${esc(record.restaurant.name)}</dd></div><div><dt>Main dish</dt><dd>${esc(record.meal.mainDishName)}</dd></div><div><dt>Selected changes</dt><dd>${esc(record.meal.selectedModifiers.map((item) => item.label).join(", ") || "None")}</dd></div></dl>
        <label for="memory-meal-name">Meal name</label><input id="memory-meal-name" maxlength="120" value="${esc(record.name)}">
        <label for="memory-personal-note">Personal note (local only)</label><textarea id="memory-personal-note" maxlength="2000">${esc(record.personalNotes)}</textarea>
        <label for="memory-confirmation-note">Add a private restaurant or dish note</label><textarea id="memory-confirmation-note" maxlength="2000" placeholder="What did you note or what did staff confirm?"></textarea>
        <label for="memory-note-type">Note type</label><select id="memory-note-type"><option value="personal_note">Your note</option><option value="staff_confirmation">Staff confirmation recorded by you</option></select>
        <label for="memory-note-scope">Applies to</label><select id="memory-note-scope"><option value="dish">This dish at this location</option><option value="restaurant">This restaurant location</option></select>
        <label class="memory-share-notes"><input id="memory-share-notes" type="checkbox"> Include personal notes when sharing</label>
        <div class="memory-actions"><button type="button" class="primary-btn" data-memory-detail-action="questions">Questions for Staff</button><button type="button" class="ghost-btn" data-memory-detail-action="save-edit">Save Changes</button><button type="button" class="ghost-btn" data-memory-detail-action="add-confirmation">Save Personal Note</button><button type="button" class="ghost-btn" data-memory-detail-action="duplicate">Duplicate</button><button type="button" class="ghost-btn" data-memory-detail-action="copy">Copy Order</button><button type="button" class="ghost-btn" data-memory-detail-action="share">Share</button></div>
        <h3>Your notes</h3>${personal.length ? `<ul>${personal.map((item) => { const age = root.ROOTS_ORDER_RECHECK.confirmationAge(item); return `<li><b>${esc(item.type === "staff_confirmation" ? age.label : "Your note")}:</b> ${esc(item.statement)} <button type="button" class="text-btn" data-delete-note="${esc(item.id)}">Delete</button></li>`; }).join("")}</ul>` : "<p>No personal notes for this dish and location.</p>"}`;
    }
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); $("restaurant-memory-close").focus();
  }
  function close() { $("restaurant-memory-modal").classList.remove("open"); $("restaurant-memory-modal").setAttribute("aria-hidden", "true"); currentId = null; trigger?.focus?.(); }
  function copyText(record, includeNotes) {
    return [record.restaurant.name, "", record.name, "", "Order:", `- ${record.meal.mainDishName}`, ...record.meal.selectedComponents.map((item) => `- ${item.name}`), ...record.meal.selectedModifiers.map((item) => `- ${item.label}`), "", `ROOTS result: ${verdict(record.evaluation.verdict)} when checked`, `Checked: ${new Date(record.evaluation.evaluatedAt).toLocaleDateString()}`, ...(includeNotes && record.personalNotes ? ["", `Personal note: ${record.personalNotes}`] : [])].join("\n");
  }
  async function copy(record) { const text = copyText(record, false); if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text); else root.prompt?.("Copy this order:", text); return text; }
  async function share(record, includeNotes) { const text = copyText(record, includeNotes); if (navigator.share) { try { await navigator.share({ title: record.name, text }); } catch (error) { if (error.name !== "AbortError") throw error; } } else await copy(record); }
  function bind() {
    $("saved-meal-search")?.addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(() => { query = event.target.value; render(); }, 180); });
    $("saved-meal-sort")?.addEventListener("change", (event) => { sortId = event.target.value; render(); });
    $("saved-meal-filter")?.addEventListener("change", (event) => { filters = event.target.value === "needs_recheck" ? { needsRecheck: true } : event.target.value === "archived" ? { archived: true } : event.target.value ? { verdict: event.target.value } : {}; render(); });
    $("savedMealsList")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-memory-action]")?.dataset.memoryAction;
      if (action === "clear-search") { query = ""; $("saved-meal-search").value = ""; render(); return; }
      if (action === "find-restaurants") { document.querySelector('[data-view="restaurantsView"]')?.click(); return; }
      const card = event.target.closest("[data-meal-id]"); if (!card || !action) return;
      if (["again", "open"].includes(action)) open(card.dataset.mealId, action, event.target);
      else if (action === "archive") { const record = root.ROOTS_SAVED_MEALS.get(card.dataset.mealId); record.status === "archived" ? root.ROOTS_SAVED_MEALS.restore(record.id) : root.ROOTS_SAVED_MEALS.archive(record.id); render(); }
      else if (action === "favorite") { const record = root.ROOTS_SAVED_MEALS.get(card.dataset.mealId); root.ROOTS_SAVED_MEALS.update(record.id, { favorite: !record.favorite }); render(); }
      else if (action === "delete" && root.confirm?.("Delete this saved meal permanently? Order history will remain.")) { root.ROOTS_SAVED_MEALS.remove(card.dataset.mealId); render(); }
    });
    $("restaurantOrderHistory")?.addEventListener("click", (event) => { const card = event.target.closest("[data-order-id]"); if (card && event.target.closest("[data-memory-action='delete-order']") && root.confirm?.("Delete this order record?")) { root.ROOTS_ORDER_HISTORY.remove(card.dataset.orderId); render(); } });
    $("restaurant-memory-close")?.addEventListener("click", close);
    $("restaurant-memory-content")?.addEventListener("click", async (event) => {
      const record = root.ROOTS_SAVED_MEALS.get(currentId); if (!record) return;
      const action = event.target.closest("[data-memory-detail-action]")?.dataset.memoryDetailAction;
      if (action === "save-edit") { root.ROOTS_SAVED_MEALS.update(record.id, { name: $("memory-meal-name").value, personalNotes: $("memory-personal-note").value }); open(record.id, "open", trigger); render(); }
      else if (action === "add-confirmation") { saveNote({ restaurantLocationId: record.restaurant.locationId, dishId: $("memory-note-scope").value === "dish" ? record.meal.mainDishId : null, statement: $("memory-confirmation-note").value, type: $("memory-note-type").value }); open(record.id, "open", trigger); }
      else if (action === "duplicate") { const copy = root.ROOTS_SAVED_MEALS.duplicate(record.id, { name: `${record.name} Copy` }); close(); open(copy.id, "open", trigger); render(); }
      else if (action === "copy") await copy(record);
      else if (action === "share") await share(record, $("memory-share-notes")?.checked === true);
      else if (action === "questions") { const button = event.target; close(); root.ROOTS_RESTAURANT_COMMUNICATION?.openSaved?.(record.id, button); }
      else if (action === "review") { close(); root.ROOTS_ORDER_BUILDER?.openSaved?.(record.id, trigger); }
      const noteId = event.target.closest("[data-delete-note]")?.dataset.deleteNote; if (noteId) { removeNote(noteId); open(record.id, "open", trigger); }
    });
    document.addEventListener("keydown", (event) => {
      const modal = $("restaurant-memory-modal"); if (!modal?.classList.contains("open")) return;
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
    $("clear-order-history")?.addEventListener("click", () => { if (root.confirm?.("Delete all restaurant order history? Saved meals will remain.")) { root.ROOTS_ORDER_HISTORY.clear({ confirmed: true }); render(); } });
    $("delete-saved-meals")?.addEventListener("click", () => { if (root.confirm?.("Delete all saved restaurant meals permanently? Order history will remain.")) { root.ROOTS_SAVED_MEALS.list({ includeArchived: true }).forEach((item) => root.ROOTS_SAVED_MEALS.remove(item.id)); render(); } });
    $("delete-restaurant-notes")?.addEventListener("click", () => { if (root.confirm?.("Delete all personal restaurant notes and confirmations?")) { noteIds().forEach(removeNote); render(); } });
    $("clear-restaurant-cache")?.addEventListener("click", () => { if (root.confirm?.("Clear disposable restaurant and ranking caches? Saved meals and order history will remain.")) { localStorage.removeItem("roots-restaurant-ranking-cache-v1"); localStorage.removeItem("roots-restaurant-search-cache-v1"); } });
  }
  function init() { if (initialized) return; initialized = true; bind(); render(); }
  root.ROOTS_RESTAURANT_MEMORY = { init, render, openSavedMeals: render, openMeal: open, openRestaurantHistory: (restaurantId) => root.ROOTS_ORDER_HISTORY.list({ restaurantId }), search: (value) => { query = value; render(); }, setFilters: (value) => { filters = value; render(); }, setSort: (value) => { sortId = value; render(); }, saveNote, notes, removeNote, copyText, destroy: () => { clearTimeout(timer); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
