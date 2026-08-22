(function (root) {
  "use strict";
  const MAX_REASONS = 5;
  const SEARCH_THRESHOLD = 13;
  const DESCRIPTIONS = Object.freeze({
    gelatin: "An animal-derived protein commonly made from collagen.",
    carmine: "A red coloring made from cochineal insects.",
    whey: "A milk-derived protein.",
    natural_flavors: "A general label for flavoring substances whose exact source may not be listed.",
    milk: "A dairy ingredient and a source of milk proteins.",
    pork: "Meat derived from pigs.",
    garlic: "A bulb vegetable used for flavoring.",
  });
  const EVIDENCE = Object.freeze({
    confirmed: ["Confirmed", "confirmed"],
    likely: ["Likely", "likely"],
    needs_confirmation: ["Needs confirmation", "needs-confirmation"],
  });
  let state = null;
  let rootEl = null;
  let modalReturnFocus = null;
  let rootClick = null;
  let rootInput = null;
  let keyHandler = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const jainDisplay = (value) => clean(value)
    .replace(/\bStrict Jain\b/gi, "Jain")
    .replace(/\bCustom Jain\b/gi, "Jain")
    .replace(/\bnot compatible with Jain\b/gi, "not compatible with your Jain settings");
  const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ingredient";
  const unique = (values) => [...new Set(values.filter(Boolean))];
  function titleCaseIngredient(value) {
    const text = clean(value);
    if (!text) return "";
    if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
    return text.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }
  const itemName = (item) => titleCaseIngredient(item?.displayName || knowledge(item)?.name || item?.normalizedName || item?.rawName) || "Unknown ingredient";
  const reasonText = (item) => jainDisplay(item?.reasons?.[0]?.label) || (
    item?.status === "SAFE" ? "" : item?.matchedIngredientId ? "ROOTS identified this ingredient for your selected profile." :
      "ROOTS could not confidently identify this ingredient."
  );
  const allItems = (scan) => {
    const evaluation = scan?.evaluation || {};
    return [
      ...(evaluation.avoidItems || []).map((item) => ({ item, section: "avoid" })),
      ...(evaluation.cautionItems || []).map((item) => ({ item, section: "caution" })),
      ...(evaluation.preferenceItems || []).map((item) => ({ item, section: "preference" })),
      ...(evaluation.safeItems || []).map((item) => ({ item, section: "safe" })),
    ];
  };
  function knowledge(item) {
    return item?.matchedIngredientId
      ? root.ROOTS_INGREDIENT_KNOWLEDGE?.byId?.get(item.matchedIngredientId) || null
      : null;
  }
  function evidence(item) {
    return EVIDENCE[item?.evidenceLevel] || EVIDENCE.needs_confirmation;
  }
  function readableRule(value) {
    if (["strict_jain", "custom_jain"].includes(clean(value).toLowerCase())) return "Jain";
    return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  function reasonPriority(reason) {
    const category = clean(reason?.category);
    return category === "allergy" || category === "declared_contains" ? 0
      : category === "cross_contact" ? 1
      : category === "religious" ? 2
      : category === "lifestyle" ? 3
      : category.startsWith("custom") ? 4 : 5;
  }
  function mainReasons(scan) {
    const seen = new Set();
    return [...(scan?.evaluation?.summaryReasons || [])]
      .sort((a, b) => reasonPriority(a) - reasonPriority(b))
      .filter((reason) => {
        const key = jainDisplay(reason.label).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, MAX_REASONS);
  }
  function verdictModel(verdict, reason) {
    if (verdict === "MATCH" || verdict === "SAFE") return {
      className: "safe", heading: "Matches your profile",
      detail: "No known conflicts were found in the available evidence.",
      announcement: "Result: Matches your profile. No known conflicts were found in the available evidence.",
      icon: '<path d="m7 12.5 3.2 3.2L17.5 8.5"/>',
    };
    if (verdict === "CONFLICT" || verdict === "AVOID") return {
      className: "avoid", heading: "Conflict found",
      detail: clean(reason) || "This product conflicts with your selected profile.",
      announcement: "Result: Avoid. Review the listed conflicts.",
      icon: '<path d="m8 8 8 8M16 8l-8 8"/>',
    };
    return {
      className: "caution", heading: "Needs verification",
      detail: clean(reason) || "Material information is still unresolved.",
      announcement: "Result: Needs verification. Review the unresolved information.",
      icon: '<path d="M12 7v6m0 4h.01"/><path d="M10.3 3.7 2.1 18a2 2 0 0 0 1.8 3h16.2a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/>',
    };
  }

  function trustHtml(scan) {
    const attempts = scan?.resolution?.attempts || [];
    if (!attempts.length) return "";
    const symbol = { available: "✓", partial: "○", unavailable: "—" };
    return `<section class="report-trust" aria-labelledby="report-trust-heading">
      <h2 id="report-trust-heading">How Roots checked this</h2>
      <ul>${attempts.map((item) => `<li><span aria-hidden="true">${symbol[item.status] || "—"}</span><b>${esc(item.label)}</b><small>${esc(item.status === "available" ? "Available" : item.status === "partial" ? "Partial" : "Unavailable")}</small></li>`).join("")}</ul>
      ${scan.decision?.status === "VERIFY" ? '<button type="button" class="secondary-btn" data-action="resolve">Resolve this</button>' : ""}
    </section>`;
  }
  function productHtml(scan) {
    const product = scan.product || {};
    const name = clean(product.productName || product.name) || "Scanned Product";
    const image = root.ROOTS_REPORT_ACTIONS.safeImageUrl(product.image);
    return `<section class="report-product">
      ${image ? `<img class="report-product-image" src="${esc(image)}" alt="${esc(name)}">` : ""}
      <span class="report-product-placeholder" aria-hidden="true" ${image ? "hidden" : ""}>
        <svg viewBox="0 0 24 24"><path d="M6 3h12l2 4-2 14H6L4 7zM4 7h16M9 11h6"/></svg>
      </span>
      <div><h1>${esc(name)}</h1>${product.brand ? `<p>${esc(product.brand)}</p>` : ""}</div>
    </section>`;
  }
  function reasonChipsHtml(scan) {
    const items = allItems(scan);
    const chips = mainReasons(scan);
    if (!chips.length || scan.evaluation.verdict === "SAFE") return "";
    return `<nav class="reason-chips" aria-label="Main reasons">${chips.map((reason, index) => {
      const target = items.find(({ item }) => (item.reasons || []).some((entry) => entry.id === reason.id || entry.label === reason.label));
      const targetId = target ? ingredientId(target.item, target.section, items.indexOf(target)) : "";
      return `<button type="button" class="reason-chip reason-${esc(reason.category)}" data-scroll-ingredient="${esc(targetId)}" aria-label="View reason: ${esc(jainDisplay(reason.label))}">
        <span aria-hidden="true">●</span>${esc(jainDisplay(reason.label))}
      </button>`;
    }).join("")}</nav>`;
  }
  function warningHtml(scan) {
    const warnings = scan.warnings || [];
    if (!warnings.length) return "";
    const first = warnings[0];
    return `<aside class="report-warning"><strong>Needs attention</strong><p>${esc(first.message || first.code || first)}</p>
      <div><button type="button" data-action="review">Review Ingredients</button><button type="button" data-action="original">View Original</button></div>
    </aside>`;
  }
  function ingredientId(item, section, index) {
    return `report-${section}-${slug(item.matchedIngredientId || item.normalizedName || itemName(item))}-${index}`;
  }
  function description(item, record) {
    if (!record) return "ROOTS could not confidently identify this ingredient. Review the original label text before relying on it.";
    return clean(record.notes) || DESCRIPTIONS[record.id] || "ROOTS identified this ingredient as relevant to your selected profile.";
  }
  function nextStep(item) {
    const record = knowledge(item);
    if (item.evidenceLevel !== "needs_confirmation" && !item.sourceDependent) return "Check the current package label before making your decision.";
    if (record?.id === "natural_flavors") return "Ask the manufacturer whether the flavor contains animal-derived ingredients or alcohol carriers.";
    if (record?.sourceDependent) return "Check certification details or contact the manufacturer to confirm the ingredient source.";
    return "Review the original text and verify this ingredient with the manufacturer if needed.";
  }
  function childrenHtml(children, depth) {
    if (!children?.length || depth > 2) return "";
    return `<div class="report-children"><h4>Subingredients</h4>${children.map((child) =>
      `<div class="report-child status-${esc(child.status.toLowerCase())}"><span>${statusMiniIcon(child.status)}<b>${esc(itemName(child))}</b></span><small>${esc(reasonText(child))}</small>
      ${childrenHtml(child.subingredientResults, depth + 1)}</div>`
    ).join("")}</div>`;
  }
  function statusMiniIcon(status) {
    const path = status === "SAFE" ? '<path d="m5 9 3 3 6-7"/>'
      : status === "AVOID" ? '<path d="m5 5 8 8m0-8-8 8"/>'
      : '<path d="M9 3.5 16 15H2L9 3.5Z"/><path d="M9 7.5v3.25M9 13.5h.01"/>';
    return `<svg class="mini-status" viewBox="0 0 18 18" aria-hidden="true">${path}</svg>`;
  }
  function itemMatches(item, query) {
    if (!query) return true;
    const record = knowledge(item);
    const haystack = [
      itemName(item), item.rawName, ...(item.matchedAliases || []), ...(record?.aliases || []),
      ...(item.reasons || []).map((reason) => reason.label),
    ].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  }
  function ingredientCardHtml(item, section, index) {
    const id = ingredientId(item, section, index);
    const record = knowledge(item);
    const ev = evidence(item);
    const unknown = !item.matchedIngredientId;
    const aliases = unique([...(item.matchedAliases || []), ...(record?.aliases || [])]).slice(0, 6);
    const sources = (record?.possibleSources || []).slice(0, 6);
    const rules = unique((item.triggeredRules || []).map(readableRule));
    return `<article class="report-ingredient status-${esc(section)}${unknown ? " is-unknown" : ""}" id="${esc(id)}" data-search="${esc([
      itemName(item), ...aliases, ...(item.reasons || []).map((reason) => jainDisplay(reason.label)),
    ].join(" ").toLowerCase())}">
      <div class="ingredient-summary">
        ${statusMiniIcon(item.status)}
        <button type="button" class="ingredient-toggle" aria-expanded="false" aria-controls="${esc(id)}-details">
          <span><b>${esc(itemName(item))}</b><small>${esc(reasonText(item))}</small></span><span aria-hidden="true">⌄</span>
        </button>
        <button type="button" class="evidence-badge evidence-${ev[1]}" data-evidence="${esc(id)}" aria-label="View evidence for ${esc(itemName(item))}: ${ev[0]}">${ev[0]}</button>
      </div>
      <div class="ingredient-details" id="${esc(id)}-details" hidden>
        ${unknown ? `<p class="unknown-note"><b>Unknown ingredient.</b> ROOTS could not confidently identify this ingredient.</p>` : ""}
        <h4>What it is</h4><p>${esc(description(item, record))}</p>
        <h4>Why ROOTS flagged it</h4><ul>${(item.reasons || []).map((reason) => `<li>${esc(jainDisplay(reason.label))}</li>`).join("") || "<li>Review this ingredient against your selected profile.</li>"}</ul>
        ${rules.length ? `<h4>Triggered profile rules</h4><ul>${rules.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ul>` : ""}
        ${aliases.length ? `<h4>Also called</h4><p>${aliases.map(esc).join(", ")}</p>` : ""}
        ${sources.length ? `<h4>Possible sources</h4><p>${sources.map((source) => esc(readableRule(source))).join(", ")}</p>` : ""}
        ${unknown && item.matchType && item.matchType !== "none" ? `<p><b>Possible match:</b> ${esc(readableRule(item.matchType))}</p>` : ""}
        ${childrenHtml(item.subingredientResults, 1)}
        <h4>Suggested next step</h4><p>${esc(nextStep(item))}</p>
        <div class="ingredient-actions">
          <button type="button" data-explain-ingredient="${esc(id)}">Explain</button>
          <button type="button" data-ask-ingredient="${esc(id)}">Ask ROOTS about this</button>
          <button type="button" data-copy-ingredient="${esc(itemName(item))}">Copy ingredient name</button>
          ${unknown ? `<button type="button" data-action="review">Review Ingredients</button><button type="button" data-action="issue" data-issue-ingredient="${esc(itemName(item))}">Report an Issue</button>` : ""}
        </div>
      </div>
    </article>`;
  }
  function sectionHtml(title, items, section, expanded, startIndex) {
    if (!items?.length) return "";
    const displayTitle = ({ avoid: "NOT SAFE", caution: "UNCERTAIN", preference: "PREFERENCE", safe: "SAFE" })[section] || title;
    return `<section class="report-section section-${section}" data-section="${section}">
      <h2><button type="button" class="section-toggle" aria-expanded="${expanded}" aria-controls="section-${section}-content">
        <span>${esc(title)} <span>(${items.length})</span></span><span aria-hidden="true">⌄</span>
      </button></h2>
      <div id="section-${section}-content" class="section-content" ${expanded ? "" : "hidden"}>
        ${items.map((item, index) => ingredientCardHtml(item, section, startIndex + index)).join("")}
      </div>
    </section>`;
  }
  function originalHtml(scan) {
    const product = scan.product || {};
    const text = product.rawText || {};
    const hasTranslated = !!clean(text.translated);
    const hasEdited = !!clean(text.edited);
    return `<section class="report-original"><h2>Original Label</h2><p>View the extracted text used for this result.</p>
      <button type="button" class="ghost-btn" data-action="original">View Extracted Text</button>
      ${hasTranslated ? '<span class="source-note">Translation available</span>' : ""}
      ${hasEdited ? '<span class="source-note">Ingredient text edited by you</span>' : ""}
    </section>`;
  }
  function sourceHtml(scan) {
    const product = scan.product || {};
    const meta = product.sourceMetadata || {};
    const source = product.sourceType === "label_photo" ? "Product label" : "Open Food Facts";
    return `<details class="report-source"><summary>Source Details</summary><dl>
      <div><dt>Scan type</dt><dd>${esc(product.sourceType === "label_photo" ? "Label photo" : "Barcode")}</dd></div>
      <div><dt>Source</dt><dd>${esc(source)}</dd></div>
      ${product.barcode ? `<div><dt>Barcode</dt><dd>${esc(product.barcode)}</dd></div>` : ""}
      <div><dt>Original language</dt><dd>${esc(product.originalLanguage || "Not specified")}</dd></div>
      <div><dt>Translation used</dt><dd>${product.rawText?.translated ? "Yes" : "No"}</dd></div>
      <div><dt>Data</dt><dd>${meta.fromCache ? "Cached" : "Live"}</dd></div>
      <div><dt>Profile</dt><dd>${esc(scan.profile?.name || "My Profile")}</dd></div>
      <div><dt>Scanned</dt><dd>${esc(new Date(scan.evaluation?.evaluatedAt || Date.now()).toLocaleString())}</dd></div>
      <div><dt>Region</dt><dd>${esc(product.region || "US")}</dd></div>
      <div><dt>Engine</dt><dd>${esc(scan.evaluation?.engineVersion || "")}</dd></div>
      <div><dt>Ingredient knowledge</dt><dd>${esc(scan.evaluation?.ingredientKnowledgeVersion || "")}</dd></div>
    </dl></details>`;
  }
  function actionsHtml(scan) {
    const saved = root.ROOTS_REPORT_ACTIONS.isSaved(scan);
    const productId = root.ROOTS_REPORT_ACTIONS.productId(scan);
    const favorite = root.ROOTS_PERSONALIZATION?.isFavorite?.("products", productId);
    const canRecheck = typeof state.options.onRecheck === "function";
    return `<section class="report-actions-final" aria-label="Report actions">
      <div class="report-primary-actions">
        <button type="button" class="primary-btn" data-action="save">${saved ? "Saved" : "Save Product"}</button>
        <button type="button" class="secondary-btn" data-action="favorite" aria-pressed="${favorite ? "true" : "false"}">${favorite ? "Favorited" : "Favorite"}</button>
        <button type="button" class="primary-btn" data-action="ask">Ask ROOTS</button>
      </div>
      <div class="report-secondary-actions">
        <button type="button" data-action="share">Share Result</button>
        <button type="button" data-action="copy">Copy Ingredients</button>
        <button type="button" data-action="review">Review Ingredients</button>
        <button type="button" data-action="issue">Report an Issue</button>
        <button type="button" data-action="scan-again">Scan another product</button>
        ${canRecheck ? '<button type="button" data-action="recheck">Check with Current Profile</button>' : ""}
      </div>
      ${canRecheck ? '<p id="report-recheck-status" class="report-recheck-status" role="status"></p>' : ""}
    </section>`;
  }
  function alternativesHtml(scan) {
    if (scan?.evaluation?.verdict !== "AVOID" || !root.ROOTS_RECOMMENDATIONS || !root.ROOTS_REPORT_ACTIONS) return "";
    const alternatives = root.ROOTS_RECOMMENDATIONS.alternatives(scan, root.ROOTS_REPORT_ACTIONS.getSavedProducts(), 5);
    if (!alternatives.length) return "";
    return `<section class="report-alternatives"><h2>Known safe alternatives</h2><p>Ranked only from compatible products already stored on this device.</p><ul>${alternatives.map((item) => `<li><b>${esc(item.name)}</b>${item.brand ? ` · ${esc(item.brand)}` : ""}<span>${esc(item.similarity)}</span><small>${esc(item.reason)}</small></li>`).join("")}</ul></section>`;
  }
  function modalShell() {
    return `<div id="report-modal" class="report-modal" hidden aria-hidden="true">
      <div class="report-modal-card" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <button type="button" class="report-modal-close" data-modal-close aria-label="Close details">×</button>
        <h2 id="report-modal-title" tabindex="-1"></h2><div id="report-modal-body"></div>
      </div>
    </div>`;
  }
  function render() {
    if (!state?.scan || !rootEl) return;
    const renderTask = root.ROOTS_PERFORMANCE?.startTask?.("product_report_render", { count: allItems(state.scan).length });
    const scan = state.scan;
    const evaluation = scan.evaluation;
    const items = allItems(scan);
    const reason = mainReasons(scan)[0]?.label;
    const verdict = verdictModel(scan.decision?.status || evaluation.verdict, scan.decision?.reason || reason);
    const offlineLabel = scan.product?.sourceType === "label_photo" && scan.product?.sourceMetadata?.offline;
    const offlineCachedProduct = scan.product?.sourceType === "barcode" && scan.product?.sourceMetadata?.fromCache && scan.product?.sourceMetadata?.offline;
    const enrichedOnline = scan.enrichment?.applied === true;
    let offset = 0;
    const avoid = sectionHtml("Ingredients to Avoid", evaluation.avoidItems, "avoid", state.expandedSections.avoid, offset); offset += evaluation.avoidItems.length;
    const caution = sectionHtml("Eat with Caution", evaluation.cautionItems, "caution", state.expandedSections.caution, offset); offset += evaluation.cautionItems.length;
    const preference = sectionHtml("Personal Preferences", evaluation.preferenceItems, "preference", state.expandedSections.preference, offset); offset += evaluation.preferenceItems.length;
    const safe = sectionHtml("Safe Ingredients", evaluation.safeItems, "safe", state.expandedSections.safe, offset);
    rootEl.innerHTML = `<div class="report-view">
      <main class="report-main">
        ${productHtml(scan)}
        <p class="report-question sr-only">Can you eat this?</p>
        <section class="final-verdict verdict-${verdict.className}" aria-labelledby="report-verdict-heading">
          <svg class="verdict-symbol" viewBox="0 0 24 24" aria-hidden="true">${verdict.icon}</svg>
          <div><span class="verdict-label">${esc(scan.decision?.status || (evaluation.verdict === "CAUTION" ? "Verify" : evaluation.verdict))}</span>
          <h2 id="report-verdict-heading" tabindex="-1">${esc(verdict.heading)}</h2><p>${esc(verdict.detail)}</p>
          <button type="button" class="text-btn report-explain-primary" data-action="explain-report">Explain in Detail</button></div>
        </section>
        ${offlineLabel ? '<aside class="report-offline-scope" role="note"><b>Offline label check</b><p>Based on the ingredient label scanned on this device. Online manufacturer and certification verification was unavailable.</p></aside>' : ""}
        ${offlineCachedProduct ? `<aside class="report-offline-scope" role="note"><b>Cached product information</b><p>This snapshot was last checked ${scan.product.sourceMetadata?.sourceUpdatedAt ? esc(new Date(scan.product.sourceMetadata.sourceUpdatedAt).toLocaleDateString()) : "on an unknown date"}. It may not match the package currently in front of you.</p><button type="button" class="secondary-btn" data-action="verify-current-label">Scan Current Ingredient Label</button></aside>` : ""}
        ${enrichedOnline ? `<aside class="report-enrichment-scope" role="status"><b>Online evidence added</b><p>${scan.enrichment.decisionChanged ? "Stronger evidence changed this result. Review the updated reasons below." : "The result now includes available structured product evidence; the physical label remains the primary ingredient source."}</p></aside>` : ""}
        <p id="report-announcement" class="sr-only" aria-live="polite">${esc(verdict.announcement)}</p>
        ${reasonChipsHtml(scan)}${warningHtml(scan)}
        ${items.length >= SEARCH_THRESHOLD ? `<div class="report-search"><label for="report-search-input">Search ingredients</label><div><input id="report-search-input" type="search" placeholder="Search ingredients" value="${esc(state.searchQuery)}" maxlength="120"><button type="button" data-action="clear-search">Clear</button></div><p id="report-search-count" aria-live="polite"></p></div>` : ""}
        <section class="ingredient-analysis-heading" aria-labelledby="ingredient-analysis-title">
          <h2 id="ingredient-analysis-title">Ingredient analysis</h2>
          <p>${items.length} ingredients checked</p>
        </section>
        <div id="report-sections">${avoid}${caution}${preference}${safe}</div>
        <p id="report-no-results" class="empty-state" hidden>No ingredients found.</p>
        ${trustHtml(scan)}${originalHtml(scan)}${sourceHtml(scan)}${alternativesHtml(scan)}${actionsHtml(scan)}
        <p class="result-disclaimer">Always check the current package label, especially for allergies.</p>
      </main>${modalShell()}<div id="report-action-status" class="sr-only" aria-live="polite"></div>
    </div>`;
    document.body.classList.add("report-view-active");
    rootEl.style.display = "block";
    normalizeSectionLabels();
    applySearch(state.searchQuery);
    const heading = rootEl.querySelector("#report-verdict-heading");
    heading?.focus();
    root.ROOTS_PERFORMANCE?.endTask?.(renderTask, { count: items.length, status: evaluation.verdict });
  }
  function getItemById(id) {
    const entries = allItems(state.scan);
    return entries.find(({ item, section }, index) => ingredientId(item, section, index) === id)?.item || null;
  }
  function applySearch(query) {
    if (!state || !rootEl) return 0;
    state.searchQuery = clean(query);
    let visible = 0;
    rootEl.querySelectorAll(".report-ingredient").forEach((card) => {
      const show = !state.searchQuery || String(card.dataset.search || "").includes(state.searchQuery.toLowerCase());
      card.hidden = !show;
      if (show) visible += 1;
    });
    rootEl.querySelectorAll(".report-section").forEach((section) => {
      const cards = [...section.querySelectorAll(".report-ingredient")];
      section.hidden = !!state.searchQuery && !cards.some((card) => !card.hidden);
    });
    const noResults = rootEl.querySelector("#report-no-results");
    if (noResults) noResults.hidden = visible !== 0;
    const count = rootEl.querySelector("#report-search-count");
    if (count) count.textContent = `${visible} ingredient${visible === 1 ? "" : "s"} found`;
    return visible;
  }
  function normalizeSectionLabels() {
    const labels = { avoid: "Not safe", caution: "Uncertain", preference: "Preference", safe: "Safe" };
    rootEl?.querySelectorAll(".report-section").forEach((section) => {
      const label = labels[section.dataset.section];
      const button = section.querySelector(".section-toggle");
      if (!label || !button) return;
      button.innerHTML = `<span>${esc(label)}</span><span>${section.querySelectorAll(".report-ingredient").length}</span>`;
    });
  }
  function openModal(title, html, trigger) {
    const modal = rootEl.querySelector("#report-modal");
    modalReturnFocus = trigger || document.activeElement;
    rootEl.querySelector("#report-modal-title").textContent = title;
    rootEl.querySelector("#report-modal-body").innerHTML = html;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    state.activeModal = title;
    rootEl.querySelector("#report-modal-title").focus();
  }
  function closeModal() {
    const modal = rootEl?.querySelector("#report-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    state.activeModal = null;
    modalReturnFocus?.focus?.();
    modalReturnFocus = null;
  }
  function evidenceHtml(item) {
    const ev = evidence(item);
    const rules = unique((item.triggeredRules || []).map(readableRule));
    const product = state.scan.product || {};
    return `<dl class="evidence-grid">
      <div><dt>Ingredient</dt><dd>${esc(itemName(item))}</dd></div>
      <div><dt>Result</dt><dd>${esc(item.status === "CAUTION" ? "Eat with caution" : readableRule(item.status))}</dd></div>
      <div><dt>Matched label text</dt><dd>${esc(item.rawName || itemName(item))}</dd></div>
      <div><dt>Evidence type</dt><dd>${esc(readableRule(item.reasons?.[0]?.evidenceType || "direct ingredient"))}</dd></div>
      <div><dt>Evidence level</dt><dd>${esc(ev[0])}</dd></div>
      <div><dt>Triggered rules</dt><dd>${rules.length ? rules.map(esc).join(", ") : "No specific rule ID available"}</dd></div>
      <div><dt>Source</dt><dd>${product.sourceType === "label_photo" ? "Current product label" : "Open Food Facts"}</dd></div>
    </dl><h3>Engine explanation</h3><p>${esc(reasonText(item))}</p><h3>Suggested verification</h3><p>${esc(nextStep(item))}</p>`;
  }
  function originalTextHtml() {
    const text = state.scan.product?.rawText || {};
    const tabs = [
      ["original", "Original", text.original],
      ...(text.translated ? [["translated", "Translated", text.translated]] : []),
      ...(text.edited ? [["edited", "Edited by you", text.edited]] : []),
    ];
    return `<div class="label-tabs" role="tablist" aria-label="Label text versions">${tabs.map((tab, index) =>
      `<button type="button" role="tab" aria-selected="${index === 0}" data-label-tab="${tab[0]}">${esc(tab[1])}</button>`
    ).join("")}</div>${tabs.map((tab, index) =>
      `<pre class="label-text-panel" data-label-panel="${tab[0]}" ${index ? "hidden" : ""}>${esc(tab[2])}</pre>`
    ).join("")}<button type="button" data-action="copy-label">Copy label text</button>
    ${(state.scan.warnings || []).length ? `<div class="modal-warnings"><b>Extraction warnings</b><ul>${state.scan.warnings.map((warning) => `<li>${esc(warning.message || warning.code || warning)}</li>`).join("")}</ul></div>` : ""}`;
  }
  function issueHtml(ingredient) {
    return `<form id="report-issue-form"><label for="issue-type">What needs attention?</label><select id="issue-type">
      <option value="wrong_ingredient">Wrong ingredient</option><option value="incorrect_classification">Incorrect classification</option>
      <option value="missing_allergen">Missing allergen</option><option value="translation_issue">Translation issue</option>
      <option value="product_outdated">Product information outdated</option><option value="other">Other</option>
    </select><label for="issue-note">Optional note</label><textarea id="issue-note" maxlength="500">${esc(ingredient ? `Ingredient: ${ingredient}` : "")}</textarea>
    <button type="submit" class="primary-btn">Save report locally</button></form>`;
  }
  function announce(message) {
    const status = rootEl?.querySelector("#report-action-status");
    if (status) status.textContent = message;
  }
  async function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !state) return;
    const action = button.dataset.action;
    if (button.matches(".ingredient-toggle")) {
      const details = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      if (details) details.hidden = !expanded;
      return;
    }
    if (button.matches(".section-toggle")) {
      const content = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      if (content) content.hidden = !expanded;
      state.expandedSections[button.closest("[data-section]").dataset.section] = expanded;
      return;
    }
    if (button.dataset.scrollIngredient) {
      const target = document.getElementById(button.dataset.scrollIngredient);
      target?.scrollIntoView?.({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      target?.querySelector(".ingredient-toggle")?.focus();
      return;
    }
    if (button.dataset.evidence) {
      const item = getItemById(button.dataset.evidence);
      if (item) openModal(`Evidence: ${itemName(item)}`, evidenceHtml(item), button);
      return;
    }
    if (button.dataset.explainIngredient) {
      const item = getItemById(button.dataset.explainIngredient);
      if (item && root.ROOTS_EXPLANATION_CONTEXT && root.ROOTS_EVIDENCE_EXPLORER) {
        const context = root.ROOTS_EXPLANATION_CONTEXT.buildContext(item, state.scan.profile || root.ROOTS_PROFILE?.getActiveProfile?.(), state.scan.evaluation, { contextType: "ingredient", evaluatedAt: state.scan.evaluation?.evaluatedAt });
        root.ROOTS_EVIDENCE_EXPLORER.open(context, button);
      }
      return;
    }
    if (button.dataset.askIngredient) {
      const item = getItemById(button.dataset.askIngredient);
      state.options.onAsk?.(root.ROOTS_REPORT_ACTIONS.askRootsContext(state.scan, item), item);
      return;
    }
    if (button.dataset.copyIngredient) {
      await root.ROOTS_REPORT_ACTIONS.copyText(button.dataset.copyIngredient);
      announce("Ingredient name copied");
      return;
    }
    if (button.dataset.labelTab) {
      rootEl.querySelectorAll("[data-label-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
      rootEl.querySelectorAll("[data-label-panel]").forEach((panel) => { panel.hidden = panel.dataset.labelPanel !== button.dataset.labelTab; });
      return;
    }
    if (button.hasAttribute("data-modal-close")) { closeModal(); return; }
    if (action === "close") { close(); return; }
    if (action === "explain-report") {
      const context = root.ROOTS_EXPLANATION_CONTEXT?.forProduct?.(state.scan);
      if (context) root.ROOTS_EVIDENCE_EXPLORER?.open?.(context, button);
      return;
    }
    if (action === "resolve") {
      root.ROOTS_METRICS?.track?.("resolution_attempted", { decision: state.scan?.decision?.status || "VERIFY" });
      const questions = state.scan?.resolution?.questions || [];
      const attempts = state.scan?.resolution?.attempts || [];
      openModal("Resolve this result", `<p>Roots checked the available sources without turning missing information into a match.</p>
        <h3>Source checks</h3><ul>${attempts.map((item) => `<li><b>${esc(item.label)}:</b> ${esc(item.status)}</li>`).join("")}</ul>
        ${questions.length ? `<h3>What to verify</h3><ul>${questions.map((item) => `<li>${esc(item.question)}<small>${esc(item.reason)}</small></li>`).join("")}</ul>` : "<p>No additional deterministic question is available.</p>"}`, button);
      return;
    }
    if (action === "original") { openModal("Original Label", originalTextHtml(), button); return; }
    if (action === "verify-current-label") {
      root.ROOTS_FORMULATION_TRACKER?.begin?.({
        code: state.scan.product?.barcode,
        name: state.scan.product?.productName,
        rawIngredientText: state.scan.product?.ingredientText?.original || state.scan.product?.rawText?.original,
        verifiedAt: state.scan.product?.sourceMetadata?.sourceUpdatedAt,
      });
      const callback = state.options.onScanCurrentLabel;
      close(false); callback?.(); return;
    }
    if (action === "copy-label") {
      const selected = rootEl.querySelector('[data-label-panel]:not([hidden])');
      await root.ROOTS_REPORT_ACTIONS.copyText(selected?.textContent || "");
      announce("Label text copied"); return;
    }
    if (action === "save") {
      if (root.ROOTS_REPORT_ACTIONS.isSaved(state.scan)) {
        root.ROOTS_REPORT_ACTIONS.removeSavedProduct(root.ROOTS_REPORT_ACTIONS.productId(state.scan));
        button.textContent = "Save Product"; state.saved = false; announce("Product removed from Saved");
      } else {
        root.ROOTS_REPORT_ACTIONS.saveProduct(state.scan, { historyRecordId: state.historyRecordId });
        button.textContent = "Saved"; state.saved = true; announce("Product saved");
      }
      return;
    }
    if (action === "favorite") {
      if (!root.ROOTS_PERSONALIZATION) return;
      let saved = root.ROOTS_REPORT_ACTIONS.getSavedProducts().find((item) => item.id === root.ROOTS_REPORT_ACTIONS.productId(state.scan));
      if (!saved) saved = root.ROOTS_REPORT_ACTIONS.saveProduct(state.scan, { historyRecordId: state.historyRecordId });
      if (!saved) { announce("Product could not be saved on this device"); return; }
      const active = root.ROOTS_PERSONALIZATION.toggle("products", {
        id: saved.id, name: saved.product?.name, detail: saved.product?.brand,
        image: saved.product?.image, metadata: {
          verdict: saved.verdict,
          groceryStore: root.ROOTS_PERSONALIZATION.getState().preferences.groceryStore || "",
        },
      });
      button.textContent = active ? "Favorited" : "Favorite";
      button.setAttribute("aria-pressed", String(active));
      announce(active ? "Product added to favorites" : "Product removed from favorites");
      return;
    }
    if (action === "copy") { announce(await root.ROOTS_REPORT_ACTIONS.copyIngredients(state.scan)); return; }
    if (action === "share") { announce(await root.ROOTS_REPORT_ACTIONS.shareResult(state.scan)); return; }
    if (action === "ask") { state.options.onAsk?.(root.ROOTS_REPORT_ACTIONS.askRootsContext(state.scan)); return; }
    if (action === "review") { state.options.onReview?.(); return; }
    if (action === "scan-again") {
      const callback = state.options.onScanAgain;
      close();
      callback?.();
      return;
    }
    if (action === "recheck") {
      const status = document.getElementById("report-recheck-status");
      try {
        const result = await state.options.onRecheck?.();
        if (status && result) {
          const model = verdictModel(result.evaluation?.verdict, result.evaluation?.summaryReasons?.[0]?.label);
          status.textContent = `Current profile: ${model.heading}. ${model.detail}`;
        }
      } catch {
        if (status) status.textContent = "The current-profile check could not be completed.";
      }
      return;
    }
    if (action === "clear-search") {
      const input = rootEl.querySelector("#report-search-input"); if (input) input.value = ""; applySearch(""); return;
    }
    if (action === "issue" || button.dataset.issueIngredient != null) {
      openModal("Report an Issue", issueHtml(button.dataset.issueIngredient), button);
    }
  }
  function handleInput(event) {
    if (event.target.id === "report-search-input") applySearch(event.target.value);
  }
  function handleSubmit(event) {
    if (event.target.id !== "report-issue-form") return;
    event.preventDefault();
    const type = rootEl.querySelector("#issue-type").value;
    const note = rootEl.querySelector("#issue-note").value;
    root.ROOTS_REPORT_ACTIONS.reportIssue(state.scan, type, note);
    closeModal();
    announce("Issue saved locally for review");
  }
  function handleKey(event) {
    if (event.key === "Escape" && state?.activeModal) { event.preventDefault(); closeModal(); return; }
    if (state?.activeModal && event.target?.matches?.("[data-label-tab]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...rootEl.querySelectorAll("[data-label-tab]")];
      const current = tabs.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next]?.click();
      tabs[next]?.focus();
      return;
    }
    if (event.key !== "Tab" || !state?.activeModal) return;
    const modal = rootEl.querySelector(".report-modal-card");
    const focusable = [...modal.querySelectorAll('button:not([hidden]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function handleImageError(event) {
    if (!event.target?.classList?.contains("report-product-image")) return;
    event.target.hidden = true;
    if (event.target.nextElementSibling) event.target.nextElementSibling.hidden = false;
  }
  function bind() {
    rootClick = handleClick;
    rootInput = handleInput;
    keyHandler = handleKey;
    rootEl.addEventListener("click", rootClick);
    rootEl.addEventListener("input", rootInput);
    rootEl.addEventListener("submit", handleSubmit);
    rootEl.addEventListener("error", handleImageError, true);
    document.addEventListener("keydown", keyHandler);
  }
  function unbind() {
    rootEl?.removeEventListener("click", rootClick);
    rootEl?.removeEventListener("input", rootInput);
    rootEl?.removeEventListener("submit", handleSubmit);
    rootEl?.removeEventListener("error", handleImageError, true);
    document.removeEventListener("keydown", keyHandler);
    rootClick = rootInput = keyHandler = null;
  }
  function open(scan, options) {
    if (!scan?.evaluation || !["SAFE", "CAUTION", "AVOID"].includes(scan.evaluation.verdict)) return false;
    close(false);
    rootEl = options?.root || document.getElementById("result_desc");
    state = {
      scan, options: options || {}, historyRecordId: options?.historyRecordId || "",
      searchQuery: "", expandedSections: {
        avoid: true, caution: true,
        preference: (scan.evaluation.preferenceItems || []).length <= 5,
        safe: (scan.evaluation.safeItems || []).length <= 7,
      },
      expandedIngredientIds: new Set(), activeModal: null,
      saved: root.ROOTS_REPORT_ACTIONS.isSaved(scan),
    };
    bind();
    render();
    return true;
  }
  function close(callCallback = true) {
    if (!state) return;
    const callback = state.options?.onClose;
    closeModal();
    unbind();
    document.body.classList.remove("report-view-active");
    if (rootEl) {
      rootEl.innerHTML = "";
      rootEl.style.display = "none";
    }
    state = null; rootEl = null;
    if (callCallback) callback?.();
  }
  function toggleSection(sectionId) {
    if (!state || !(sectionId in state.expandedSections)) return false;
    state.expandedSections[sectionId] = !state.expandedSections[sectionId];
    render(); return state.expandedSections[sectionId];
  }
  function toggleIngredient(id) {
    const button = document.getElementById(id)?.querySelector(".ingredient-toggle");
    button?.click(); return button?.getAttribute("aria-expanded") === "true";
  }
  function openEvidence(id) {
    const item = getItemById(id);
    if (!item) return false;
    openModal(`Evidence: ${itemName(item)}`, evidenceHtml(item), document.getElementById(id)?.querySelector("[data-evidence]"));
    return true;
  }
  function openOriginalText() { if (!state) return false; openModal("Original Label", originalTextHtml()); return true; }
  function destroy() { close(false); }

  root.ROOTS_REPORT = {
    open, close, renderVerdict: verdictModel, searchIngredients: applySearch,
    toggleSection, toggleIngredient, openEvidence, openOriginalText, destroy,
    getState: () => state ? {
      historyRecordId: state.historyRecordId, searchQuery: state.searchQuery,
      expandedSections: { ...state.expandedSections }, activeModal: state.activeModal,
      saved: state.saved,
    } : null,
    helpers: { esc, mainReasons, evidence, itemMatches, ingredientId, description, nextStep, verdictModel },
  };
})(typeof window !== "undefined" ? window : globalThis);
