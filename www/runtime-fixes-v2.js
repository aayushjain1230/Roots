(function (root) {
  "use strict";
  if (!("root" in root)) root.root = root;

  function openManualIngredients() {
    const modal = root.document?.getElementById("ingredientReviewModal");
    const text = root.document?.getElementById("ingredientReviewText");
    if (!modal || !text) return;
    if (!root.ROOTS_SCAN_PIPELINE?.getCurrent?.()) text.value = "";
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    modal.removeAttribute("inert");
    text.focus();
  }

  function keepManualRecoveryVisible() {
    const manual = root.document?.getElementById("processing-manual-entry");
    if (manual && root.document?.getElementById("processing-failure")?.hidden === false) manual.hidden = false;
  }

  root.document?.addEventListener("click", (event) => {
    const target = event.target?.closest?.("#processing-manual-entry,#error-enter-ingredients");
    if (!target) return;
    event.preventDefault();
    openManualIngredients();
  }, true);

  root.addEventListener?.("DOMContentLoaded", () => {
    keepManualRecoveryVisible();
    const observer = new MutationObserver(keepManualRecoveryVisible);
    observer.observe(root.document.body, { childList: true, subtree: true, characterData: true });
  });
})(typeof window !== "undefined" ? window : globalThis);