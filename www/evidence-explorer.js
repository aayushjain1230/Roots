(function (root) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const readable = (value) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  let context = null, mode = "quick", trigger = null, requestId = "", generated = {};
  function shell() {
    let modal = document.getElementById("explanation-explorer");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "explanation-explorer";
    modal.className = "explanation-explorer";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `<div class="explanation-panel" role="dialog" aria-modal="true" aria-labelledby="explanation-title">
      <header><button type="button" data-explanation-close aria-label="Back to report">Back</button><h2 id="explanation-title" tabindex="-1">Explanation</h2></header>
      <section class="explanation-subject"><b id="explanation-subject"></b><span id="explanation-verdict"></span></section>
      <div class="explanation-modes" role="tablist" aria-label="Explanation mode">
        <button type="button" role="tab" data-explanation-mode="quick">Quick</button>
        <button type="button" role="tab" data-explanation-mode="detailed">Detailed</button>
        <button type="button" role="tab" data-explanation-mode="simple">Simple</button>
        <button type="button" role="tab" data-explanation-mode="technical">Evidence</button>
      </div>
      <p id="explanation-status" role="status" aria-live="polite"></p>
      <div id="explanation-content" tabindex="-1"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return modal;
  }
  function warningList(values) {
    return values?.length ? `<section class="explanation-warnings"><h3>Important warnings</h3><ul>${values.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>` : "";
  }
  function renderStandard(value) {
    return `<article><h3>${esc(value.title)}</h3><p>${esc(value.summary)}</p>${value.evidence ? `<p class="explanation-evidence-line"><b>Evidence:</b> ${esc(value.evidence)}</p>` : ""}
      ${value.reasons?.length > 1 ? `<section><h3>Each reason</h3>${value.reasons.map((reason) => `<article class="explanation-reason"><h4>${esc(reason.title)}</h4><p>${esc(reason.body)}</p><small>${esc(readable(reason.evidenceLevel))}</small></article>`).join("")}</section>` : ""}
      ${(value.sections || []).map((section) => `<section><h3>${esc(section.title)}</h3><p>${esc(section.body)}</p></section>`).join("")}
      ${warningList(value.importantWarnings)}
      ${value.suggestedActions?.length ? `<section><h3>What you can do next</h3><ul>${value.suggestedActions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>` : ""}
      ${value.machineTranslated ? '<p class="muted">Machine-translated explanation. The original English evidence remains available.</p>' : ""}
      ${value.offline ? '<p class="muted">Using the saved evidence explanation. Connect to generate a longer explanation.</p>' : ""}</article>`;
  }
  function renderTechnical(value) {
    const fields = value.fields || {};
    const scalar = Object.entries(fields).filter(([, item]) => !Array.isArray(item) && typeof item !== "object");
    return `<article><h3>${esc(value.title)}</h3><dl class="technical-evidence">${scalar.map(([key, item]) => `<div><dt>${esc(readable(key))}</dt><dd>${esc(item || "Not listed")}</dd></div>`).join("")}</dl>
      <section><h3>Restriction reasons</h3>${context.reasons.map((reason) => `<article class="explanation-reason"><h4>${esc(reason.restrictionLabel)}</h4><p>${esc(reason.text)}</p><dl><div><dt>Rule ID</dt><dd>${esc(reason.id)}</dd></div><div><dt>Evidence</dt><dd>${esc(readable(reason.evidenceLevel))} · ${esc(readable(reason.evidenceType))}</dd></div></dl></article>`).join("") || "<p>No conflicts recorded.</p>"}</section>
      <details><summary>Rule trace</summary><pre>${esc(JSON.stringify(fields.ruleTrace || [], null, 2))}</pre></details>
      <details><summary>Engine versions</summary><pre>${esc(JSON.stringify(fields.engineVersions || {}, null, 2))}</pre></details></article>`;
  }
  function paint(value) {
    const modal = shell();
    modal.querySelector("#explanation-content").innerHTML = value.mode === "technical" ? renderTechnical(value) : renderStandard(value);
    modal.querySelectorAll("[data-explanation-mode]").forEach((button) => {
      const selected = button.dataset.explanationMode === mode;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }
  async function selectMode(next) {
    if (!context || !["quick", "detailed", "simple", "technical"].includes(next)) return;
    mode = next;
    const modal = shell(), status = modal.querySelector("#explanation-status");
    if (next === "quick") { status.textContent = ""; generated.quick ||= root.ROOTS_EXPLANATIONS.getQuick(context); paint(generated.quick); return; }
    if (next === "technical") { status.textContent = ""; generated.technical ||= root.ROOTS_EXPLANATIONS.getTechnical(context); paint(generated.technical); return; }
    const local = next === "simple" ? root.ROOTS_EXPLANATION_TEMPLATES.simple(context) : root.ROOTS_EXPLANATION_TEMPLATES.detailedFallback(context);
    paint(local);
    status.textContent = next === "simple" ? "Preparing a simple explanation" : "Preparing a detailed explanation";
    requestId = `explorer-${Date.now().toString(36)}`;
    const result = next === "simple"
      ? await root.ROOTS_EXPLANATIONS.getSimple(context, { requestId })
      : await root.ROOTS_EXPLANATIONS.getDetailed(context, { requestId });
    generated[next] = result;
    if (mode !== next) return;
    status.textContent = result.fallbackReason || (result.cached ? "Using a saved explanation" : "");
    paint(result);
  }
  function open(nextContext, source) {
    if (!nextContext) return false;
    close(false);
    context = nextContext; trigger = source || document.activeElement; generated = {}; mode = "quick";
    const modal = shell();
    modal.hidden = false; modal.setAttribute("aria-hidden", "false");
    document.querySelector(".app-main")?.setAttribute("inert", "");
    document.querySelector(".bottom-dock")?.setAttribute("inert", "");
    modal.querySelector("#explanation-subject").textContent = context.subject.displayName;
    modal.querySelector("#explanation-verdict").textContent = readable(context.verdict);
    modal.querySelector("#explanation-status").textContent = "";
    selectMode("quick");
    modal.querySelector("#explanation-title").focus();
    return true;
  }
  function close(restore = true) {
    if (requestId) root.ROOTS_EXPLANATIONS?.cancel?.(requestId);
    const modal = document.getElementById("explanation-explorer");
    if (modal) { modal.hidden = true; modal.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-main")?.removeAttribute("inert");
    document.querySelector(".bottom-dock")?.removeAttribute("inert");
    const target = trigger; context = null; generated = {}; requestId = "";
    if (restore) target?.focus?.();
  }
  function handleClick(event) {
    if (event.target.closest("[data-explanation-close]")) { close(); return; }
    const button = event.target.closest("[data-explanation-mode]");
    if (button) selectMode(button.dataset.explanationMode);
  }
  function handleKey(event) {
    const modal = document.getElementById("explanation-explorer");
    if (!modal || modal.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.target?.matches?.("[data-explanation-mode]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...modal.querySelectorAll("[data-explanation-mode]")], current = tabs.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); tabs[next].focus(); selectMode(tabs[next].dataset.explanationMode);
    }
  }
  root.ROOTS_EVIDENCE_EXPLORER = { open, close, showOverview: () => selectMode("quick"), showEvidence: () => selectMode("technical"), showAliases: () => selectMode("detailed"), showQuestions: () => selectMode("detailed"), getContext: () => context };
})(typeof window !== "undefined" ? window : globalThis);
