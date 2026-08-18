(function (root) {
  "use strict";
  if (!("root" in root)) root.root = root;
  function hideModal(id) {
    const modal = root.document?.getElementById(id);
    if (!modal) return;
    modal.setAttribute("inert", "");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  function showIngredientReview() {
    hideModal("labelSourceModal");
    const modal = root.document?.getElementById("ingredientReviewModal");
    const text = root.document?.getElementById("ingredientReviewText");
    if (!modal || !text) return;
    if (!root.ROOTS_SCAN_PIPELINE?.getCurrent?.()) text.value = "";
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    modal.removeAttribute("inert");
    text.focus();
  }
  root.document?.addEventListener("click", (event) => {
    const target = event.target?.closest?.("#label-enter-manual,#saveIngredientReview");
    if (!target) return;
    if (target.id === "label-enter-manual") {
      event.preventDefault();
      event.stopImmediatePropagation();
      showIngredientReview();
      return;
    }
    const text = root.document?.getElementById("ingredientReviewText")?.value?.trim?.() || "";
    if (!text || root.ROOTS_SCAN_PIPELINE?.getCurrent?.()) return;
    const profile = typeof root.getDietProfile === "function" ? root.getDietProfile() : root.ROOTS_PROFILE?.getActiveProfile?.();
    const scan = root.ROOTS_SCAN_PIPELINE?.evaluateSource?.({ sourceType: "manual_label", rawIngredientText: text, originalText: text }, profile);
    if (!scan) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hideModal("ingredientReviewModal");
    if (typeof root.displayResult === "function") root.displayResult(scan, { save: false });
  }, true);
})(typeof window !== "undefined" ? window : globalThis);
