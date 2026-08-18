(function (root) {
  "use strict";
  if (!("root" in root)) root.root = root;

  const LABEL_OFFLINE_MESSAGE = "Label reading needs internet on this device. Enter the ingredients manually, or reconnect and try the photo again.";

  function patchScanProcessingMessages() {
    const errors = root.ROOTS_SCAN_PROCESSING?.constants?.ERRORS;
    if (!errors) return;
    if (errors.OCR_NETWORK) errors.OCR_NETWORK[2] = LABEL_OFFLINE_MESSAGE;
    if (errors.OCR_LOCAL_UNAVAILABLE) errors.OCR_LOCAL_UNAVAILABLE[2] = LABEL_OFFLINE_MESSAGE;
  }

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

  function patchVisibleOfflineMessage() {
    const message = root.document?.getElementById("processing-failure-message");
    if (message && /Label reading requires an internet connection/i.test(message.textContent || "")) {
      message.textContent = LABEL_OFFLINE_MESSAGE;
    }
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
    patchScanProcessingMessages();
    patchVisibleOfflineMessage();
    const observer = new MutationObserver(() => {
      patchScanProcessingMessages();
      patchVisibleOfflineMessage();
    });
    observer.observe(root.document.body, { childList: true, subtree: true, characterData: true });
  });
  patchScanProcessingMessages();
})(typeof window !== "undefined" ? window : globalThis);
