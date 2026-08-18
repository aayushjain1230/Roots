(function (root) {
  "use strict";

  const doc = root.document;
  if (!doc) return;
  const reduceMotion = root.matchMedia?.("(prefers-reduced-motion: reduce)");
  const toastTimers = new WeakMap();
  let region;

  function toastRegion() {
    if (region?.isConnected) return region;
    region = doc.createElement("div");
    region.className = "roots-toast-region";
    region.setAttribute("aria-label", "Notifications");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-relevant", "additions");
    doc.body.appendChild(region);
    return region;
  }

  function dismissToast(element) {
    if (!element?.isConnected) return;
    root.clearTimeout(toastTimers.get(element));
    element.classList.add("is-leaving");
    root.setTimeout(() => element.remove(), reduceMotion?.matches ? 0 : 180);
  }

  function toast(message, options = {}) {
    const safeMessage = String(message || "").trim();
    if (!safeMessage) return null;
    const kind = ["success", "error", "warning", "info"].includes(options.kind) ? options.kind : "info";
    const element = doc.createElement("div");
    element.className = "roots-toast";
    element.dataset.kind = kind;
    element.setAttribute("role", kind === "error" ? "alert" : "status");

    const text = doc.createElement("span");
    text.textContent = safeMessage;
    element.appendChild(text);

    if (options.actionLabel && typeof options.onAction === "function") {
      const action = doc.createElement("button");
      action.type = "button";
      action.className = "roots-toast-action";
      action.textContent = String(options.actionLabel);
      action.addEventListener("click", () => {
        options.onAction();
        dismissToast(element);
      }, { once: true });
      element.appendChild(action);
    }

    toastRegion().appendChild(element);
    const duration = Math.min(10000, Math.max(2500, Number(options.duration) || 4500));
    toastTimers.set(element, root.setTimeout(() => dismissToast(element), duration));
    return element;
  }

  async function haptic(kind = "selection") {
    if (doc.visibilityState === "hidden") return false;
    const plugin = root.Capacitor?.Plugins?.Haptics;
    try {
      const nativeCheck = root.Capacitor?.isNativePlatform;
      if (plugin && (typeof nativeCheck !== "function" || nativeCheck.call(root.Capacitor))) {
        if (kind === "success" || kind === "warning" || kind === "error") {
          await plugin.notification({ type: kind.toUpperCase() });
        } else if (kind === "selection" && plugin.selectionChanged) {
          await plugin.selectionChanged();
        } else {
          await plugin.impact({ style: kind === "medium" ? "MEDIUM" : "LIGHT" });
        }
        return true;
      }
    } catch (_) {
      // Haptics are enhancement-only and must never interrupt an action.
    }
    return false;
  }

  function setLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.loadingWidth) {
        button.dataset.loadingWidth = button.style.minWidth || "";
        button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
      }
      if (!button.dataset.loadingAriaLabel) button.dataset.loadingAriaLabel = button.getAttribute("aria-label") || "";
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (label) button.setAttribute("aria-label", String(label));
      loadingStatus().textContent = label || "Working…";
    } else {
      button.removeAttribute("aria-busy");
      button.disabled = false;
      button.style.minWidth = button.dataset.loadingWidth || "";
      delete button.dataset.loadingWidth;
      const originalLabel = button.dataset.loadingAriaLabel;
      if (originalLabel) button.setAttribute("aria-label", originalLabel);
      else button.removeAttribute("aria-label");
      delete button.dataset.loadingAriaLabel;
      loadingStatus().textContent = label || "";
    }
  }

  function loadingStatus() {
    let region = doc.getElementById("global-loading-status");
    if (region) return region;
    region = doc.createElement("div");
    region.id = "global-loading-status";
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    doc.body.appendChild(region);
    return region;
  }

  function meaningfulHaptic(target) {
    if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return null;
    const hint = `${target.id || ""} ${target.className || ""} ${target.dataset.haptic || ""} ${target.textContent || ""}`.toLowerCase();
    if (target.dataset.haptic) return target.dataset.haptic;
    if (/(delete|remove|clear all|error)/.test(hint)) return "warning";
    if (/(favorite|save|copied|download|complete|finish|built)/.test(hint)) return "light";
    if (/(home-restaurant-finder|scan-entry-btn|scanner-capture)/.test(hint)) return "medium";
    if (/(home-shortcuts|dock-btn|primary-btn|modal-btn|upload-btn)/.test(hint)) return "light";
    return null;
  }

  function enhanceSemantics(scope = doc) {
    scope.querySelectorAll(".modal-content:not([data-ui-sheet]), .report-modal-card:not([data-ui-sheet])").forEach((sheet) => {
      sheet.dataset.uiSheet = "true";
    });
    scope.querySelectorAll('button:not([type])').forEach((button) => { button.type = "button"; });
    scope.querySelectorAll('img:not([loading])').forEach((image) => {
      if (!image.closest(".scan-illus, .capture-screen, .review-screen")) image.loading = "lazy";
      image.decoding = "async";
    });
  }

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Tab") doc.body.dataset.inputModality = "keyboard";
  }, true);
  doc.addEventListener("pointerdown", (event) => {
    doc.body.dataset.inputModality = "pointer";
    const button = event.target.closest("button, [role='button']");
    if (button && !button.disabled) button.classList.add("is-pressed");
  }, true);
  doc.addEventListener("pointerup", (event) => {
    event.target.closest("button, [role='button']")?.classList.remove("is-pressed");
  }, true);
  doc.addEventListener("pointercancel", () => {
    doc.querySelectorAll(".is-pressed").forEach((item) => item.classList.remove("is-pressed"));
  }, true);
  doc.addEventListener("click", (event) => {
    const button = event.target.closest("button, [role='button']");
    const kind = meaningfulHaptic(button);
    if (kind) haptic(kind);
  });
  root.ROOTS_CONNECTIVITY?.subscribe?.((connection) => {
    if (connection.offline) toast("You’re offline. Saved Roots information is still available.", { kind: "warning", duration: 6000 });
    else if (connection.online) toast("You’re back online.", { kind: "success" });
  });

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => enhanceSemantics(), { once: true });
  } else {
    enhanceSemantics();
  }

  root.ROOTS_UI = Object.freeze({
    toast,
    dismissToast,
    haptic,
    setLoading,
    enhance: enhanceSemantics,
    motion: Object.freeze({ instant: 90, fast: 140, medium: 220, page: 280, flash: 100 })
  });
})(window);
