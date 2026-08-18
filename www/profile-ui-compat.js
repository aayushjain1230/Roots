(function (root) {
  "use strict";
  if (!("root" in root)) root.root = root;
  const openManualIngredients = () => {
    const modal = root.document?.getElementById("ingredientReviewModal");
    const text = root.document?.getElementById("ingredientReviewText");
    const source = root.document?.getElementById("labelSourceModal");
    if (source) {
      source.setAttribute("inert", "");
      source.style.display = "none";
      source.setAttribute("aria-hidden", "true");
    }
    if (text && !root.ROOTS_SCAN_PIPELINE?.getCurrent?.()) text.value = "";
    if (typeof root.openIngredientReview === "function") root.openIngredientReview();
    else if (modal) {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
      modal.removeAttribute("inert");
      text?.focus?.();
    }
  };
  root.document?.addEventListener("click", (event) => {
    const target = event.target?.closest?.("#label-enter-manual,#saveIngredientReview");
    if (!target) return;
    if (target.id === "label-enter-manual") {
      event.preventDefault();
      openManualIngredients();
      return;
    }
    const text = root.document?.getElementById("ingredientReviewText")?.value?.trim?.() || "";
    if (!text || root.ROOTS_SCAN_PIPELINE?.getCurrent?.()) return;
    const profile = typeof root.getDietProfile === "function" ? root.getDietProfile() : root.ROOTS_PROFILE?.getActiveProfile?.();
    const scan = root.ROOTS_SCAN_PIPELINE?.evaluateSource?.({ sourceType: "manual_label", rawIngredientText: text, originalText: text }, profile);
    if (!scan) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const modal = root.document?.getElementById("ingredientReviewModal");
    if (modal) {
      modal.setAttribute("inert", "");
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    if (typeof root.displayResult === "function") root.displayResult(scan, { save: false });
  }, true);
})(typeof window !== "undefined" ? window : globalThis);
