(function (root) {
  "use strict";

  const TIMEOUTS = Object.freeze({
    barcode_decode: 12000,
    product_lookup: 18000,
    ocr: 45000,
    translation: 45000,
    parser: 5000,
    engine: 5000,
  });
  const STAGES = Object.freeze({
    reading_barcode: ["Reading barcode", "Keep the image steady while ROOTS identifies the code."],
    finding_product: ["Finding product", "Looking for product and ingredient information."],
    reading_ingredients: ["Reading ingredients", "Preparing the product's ingredient list."],
    preparing_image: ["Preparing your scan", "Getting the image ready."],
    reading_label: ["Reading the label", "Looking for the complete ingredient list."],
    detecting_language: ["Detecting language", "Identifying the language used on this label."],
    translating: ["Translating ingredients", "Preserving the original text while preparing a translated version."],
    parsing: ["Organizing ingredients", "Separating ingredients, subingredients, and allergen warnings."],
    checking_profile: ["Checking ingredients", "Comparing ingredients with your dietary profile."],
    saving_result: ["Preparing your report", "Organizing the evidence behind the result."],
  });
  const ERRORS = Object.freeze({
    BARCODE_NOT_FOUND_IN_IMAGE: ["data", "Barcode not detected", "Make sure the full barcode is visible, flat, and in focus.", true],
    BARCODE_INVALID: ["data", "Barcode not detected", "Make sure the full barcode is visible, flat, and in focus.", true],
    BARCODE_LOOKUP_TIMEOUT: ["network", "This is taking longer than expected", "ROOTS could not finish looking up this product.", true],
    BARCODE_LOOKUP_NETWORK: ["network", "No connection", "ROOTS needs an internet connection to look up this product.", true],
    BARCODE_OFFLINE_MISS: ["network", "Product unavailable offline", "Product lookup isn’t available offline yet. Scan the ingredient label instead.", true],
    PRODUCT_NOT_FOUND: ["data", "Product not found", "ROOTS could not find this barcode in the available product database.", true],
    PRODUCT_MISSING_INGREDIENTS: ["data", "Ingredient list unavailable", "We found the product, but its ingredient list was missing.", false],
    PRODUCT_SOURCE_INVALID: ["data", "Product information unavailable", "The saved product information could not be read safely.", true],
    IMAGE_PREPARATION_FAILED: ["quality", "Could not prepare the photo", "Review the crop or choose another photo.", true],
    IMAGE_MISSING: ["quality", "Photo unavailable", "Choose another photo to continue.", false],
    IMAGE_DECODE_FAILED: ["quality", "Could not open the photo", "Choose a JPEG, PNG, or WebP image instead.", false],
    PREPROCESSING_FAILED: ["quality", "Could not prepare the photo", "The image is still available. Review the crop or choose another photo.", true],
    IMAGE_TOO_SMALL: ["quality", "Photo is too small", "Use a larger, clearer photo of the full ingredient list.", false],
    IMAGE_TOO_DARK: ["quality", "Photo is too dark", "Try brighter, even lighting without glare.", false],
    IMAGE_TOO_BRIGHT: ["quality", "Photo is overexposed", "Reduce glare and try the photo again.", false],
    IMAGE_BLURRY: ["quality", "Photo may be blurry", "Keep the label flat and the camera steady.", false],
    IMAGE_UNSUPPORTED: ["quality", "Photo format unavailable", "Choose a JPEG, PNG, or WebP image instead.", false],
    OCR_TIMEOUT: ["network", "This is taking longer than expected", "ROOTS could not finish reading this image.", true],
    OCR_NETWORK: ["network", "No connection", "Label reading needs internet on this device. Enter the ingredients manually, or reconnect and try the photo again.", true],
    OCR_LOCAL_UNAVAILABLE: ["capability", "Offline text reading unavailable", "Enter the ingredients manually, or reconnect and try the photo again.", false],
    OCR_PROVIDER_ERROR: ["provider", "Could not read the label", "Try again, or use a clearer photo with bright, even lighting.", true],
    OCR_UNAVAILABLE: ["provider", "Label reading unavailable", "Try again when label scanning is available.", true],
    OCR_RATE_LIMITED: ["provider", "Too many scan attempts", "Wait about a minute, then try the label again.", true],
    OCR_EMPTY_TEXT: ["data", "Could not read the full label", "The image is still available. Adjust the crop or enter the ingredients manually.", false],
    OCR_INVALID_RESPONSE: ["provider", "Could not read the label", "The image is still available. Try again or review the crop.", true],
    OCR_EMPTY_RESULT: ["data", "We need the full ingredient list", "ROOTS cannot give a reliable result without enough ingredient information.", false],
    OCR_INCOMPLETE_LABEL: ["quality", "Ingredient list may be incomplete", "Some lines may be missing or unclear.", false],
    OCR_LOW_QUALITY: ["quality", "Could not read the label clearly", "Try a clearer photo with brighter, even lighting.", false],
    LANGUAGE_DETECTION_FAILED: ["provider", "Language could not be identified", "Review the original ingredient text before continuing.", true],
    TRANSLATION_FAILED: ["provider", "Translation unavailable", "ROOTS preserved the original ingredient text.", true],
    TRANSLATION_UNCERTAIN: ["quality", "Some translations need confirmation", "A few ingredient names may not have translated correctly.", false],
    PARSER_EMPTY: ["data", "We need the full ingredient list", "ROOTS cannot give a reliable result without enough ingredient information.", false],
    PARSER_INVALID_STRUCTURE: ["data", "Ingredient list may be incomplete", "Review the ingredient text and correct any missing lines.", false],
    PARSER_UNBALANCED_TEXT: ["data", "Ingredient list may be incomplete", "Part of the ingredient list appears to be cut off.", false],
    PARSER_INTERNAL_ERROR: ["unknown", "Could not organize the ingredients", "Review the ingredient text or try again.", true],
    PROFILE_INVALID: ["engine", "Dietary profile needs attention", "Review your dietary profile before checking this product.", false],
    ENGINE_TIMEOUT: ["engine", "This is taking longer than expected", "ROOTS could not finish comparing the ingredients with your profile.", true],
    ENGINE_INTERNAL_ERROR: ["engine", "Could not check this product", "ROOTS could not finish comparing the ingredients with your profile.", true],
    EVALUATION_FAILED: ["engine", "Could not check this product", "ROOTS could not finish comparing the ingredients with your profile.", true],
    ENGINE_EMPTY_RESULT: ["engine", "Could not check this product", "ROOTS did not receive a complete local evaluation.", true],
    SESSION_CANCELED: ["user", "Scan canceled", "", false],
    SESSION_CONFLICT: ["user", "A scan is already running", "Cancel the current scan before starting another.", false],
    DUPLICATE_SUBMISSION: ["user", "Scan already started", "ROOTS is already processing this scan.", false],
    UNKNOWN_ERROR: ["unknown", "Something went wrong", "ROOTS could not finish this scan. Please try again.", true],
  });
  const WARNING_CODES = Object.freeze({
    image_too_small: ["caution", "Small image", "Some label text may be difficult to read."],
    image_too_dark: ["caution", "Dark image", "Some label text may be difficult to read."],
    image_overexposed: ["caution", "Bright image", "Glare may hide part of the label."],
    low_visual_detail: ["caution", "Image clarity", "Some label text may be blurry."],
    crop_too_small: ["blocking", "Crop is too small", "The full ingredient list may not be visible."],
    incomplete_label: ["blocking", "Incomplete label", "Some ingredient information may be missing."],
    translation_uncertain: ["caution", "Translation needs review", "Some ingredient names may not have translated correctly."],
    local_ocr_unverified: ["caution", "Review detected text", "Offline text detection should be compared with the package label."],
  });

  let active = null;
  let sequence = 0;
  let onlineHandler = null;
  let offlineHandler = null;
  let connectivityUnsubscribe = null;
  let initialized = false;

  const nowIso = () => new Date().toISOString();
  const byId = (id) => typeof document === "undefined" ? null : document.getElementById(id);
  const isCurrent = (id) => !!active && active.id === id && !active.cancelRequested;
  const isAttemptCurrent = (id, attempt) => isCurrent(id) && active.attempt === attempt && !active.abortController?.signal.aborted;
  function debug(event, fields) {
    if (root.ROOTS_DEBUG !== true || !root.console?.debug) return;
    root.console.debug("[ROOTS scan]", event, {
      sessionId: fields?.sessionId || active?.id || "",
      stage: fields?.stage || active?.stage || "",
      code: fields?.code || "",
      attempt: fields?.attempt || active?.attempt || 0,
      duration: Number(fields?.duration) || 0,
      fromCache: !!fields?.fromCache,
    });
  }
  const clonePublic = (session) => session ? {
    id: session.id, type: session.type, status: session.status, stage: session.stage,
    startedAt: session.startedAt, updatedAt: session.updatedAt, attempt: session.attempt,
    cancelRequested: session.cancelRequested, source: session.source,
    warnings: session.warnings.slice(), error: session.error, result: session.result,
    metrics: { ...session.metrics },
  } : null;

  function normalizeError(error, fallbackCode) {
    if (error?.normalized === true && error.code) return error;
    const name = String(error?.name || "");
    const message = String(error?.message || "").toLowerCase();
    let code = error?.code && ERRORS[error.code] ? error.code : fallbackCode;
    if (!code) {
      if (name === "AbortError") code = "SESSION_CANCELED";
      else if (name === "TimeoutError" || message.includes("timeout")) code = "UNKNOWN_ERROR";
      else if (message.includes("offline") || message.includes("network") || message.includes("connect")) code = "BARCODE_LOOKUP_NETWORK";
      else code = "UNKNOWN_ERROR";
    }
    const spec = ERRORS[code] || ERRORS.UNKNOWN_ERROR;
    return {
      normalized: true, code, category: spec[0], title: spec[1], message: spec[2],
      recoverable: spec[3], retryAction: spec[3] ? "retry" : null,
      alternativeActions: error?.alternativeActions || [],
      debugMetadata: error?.debugMetadata || {},
    };
  }

  function warningFrom(input) {
    if (typeof input === "string") input = { code: input };
    const known = WARNING_CODES[input?.code] || ["caution", "Review needed", "Some scan information needs confirmation."];
    return {
      code: String(input?.code || "scan_warning"),
      severity: input?.severity || known[0],
      title: input?.title || known[1],
      message: input?.message || known[2],
      actions: Array.isArray(input?.actions) ? input.actions.slice() : [],
    };
  }

  function setControlsDisabled(disabled) {
    ["scan-barcode-btn", "scan-label-btn"].forEach((id) => {
      const control = byId(id);
      if (control) control.disabled = disabled;
    });
    const dock = typeof document === "undefined" ? null : document.querySelector(".bottom-dock");
    if (dock) dock.hidden = disabled;
    if (typeof document !== "undefined") document.body.classList.toggle("scan-processing-active", disabled);
  }

  function renderStage() {
    if (!active) return;
    const text = STAGES[active.stage] || ["Working on your scan", "ROOTS is preparing your result."];
    const screen = byId("scan-processing-screen");
    if (!screen) return;
    screen.hidden = false;
    screen.setAttribute("aria-labelledby", "processing-title");
    byId("processing-state")?.setAttribute("data-state", "processing");
    byId("processing-state")?.setAttribute("aria-busy", "true");
    const title = byId("processing-title");
    if (title) title.textContent = text[0];
    const detail = byId("processing-detail");
    if (detail) detail.textContent = text[1];
    const status = byId("processing-live");
    if (status) status.textContent = text[0];
    const failure = byId("processing-failure");
    if (failure) failure.hidden = true;
    root.ROOTS_PROCESSING_ANIMATION?.setStage?.(active.stage, text[1]);
    const warning = byId("processing-warning");
    if (warning) {
      const latest = active.warnings.at(-1);
      warning.hidden = !latest;
      warning.textContent = latest ? `${latest.title}: ${latest.message}` : "";
      warning.dataset.severity = latest?.severity || "";
    }
  }

  function renderFailure(error) {
    const screen = byId("scan-processing-screen");
    if (!screen) return;
    screen.hidden = false;
    screen.setAttribute("aria-labelledby", "processing-failure-title");
    byId("processing-state")?.setAttribute("data-state", "failed");
    byId("processing-state")?.setAttribute("aria-busy", "false");
    const title = byId("processing-failure-title");
    if (title) { title.textContent = error.title; title.focus(); }
    const message = byId("processing-failure-message");
    if (message) message.textContent = error.message;
    const retry = byId("processing-retry");
    if (retry) {
      retry.hidden = !error.recoverable;
      retry.disabled = false;
    }
    const label = byId("processing-scan-label");
    if (label) label.hidden = !["PRODUCT_NOT_FOUND", "PRODUCT_MISSING_INGREDIENTS", "BARCODE_NOT_FOUND_IN_IMAGE"].includes(error.code);
    const review = byId("processing-review-photo");
    if (review) review.hidden = active?.type !== "label" || active?.source?.hasOriginalImage !== true;
    const manual = byId("processing-manual-entry");
    if (manual) manual.hidden = active?.type !== "label";
    const failure = byId("processing-failure");
    if (failure) failure.hidden = false;
  }

  function hide() {
    const screen = byId("scan-processing-screen");
    if (screen) screen.hidden = true;
    const live = byId("processing-live");
    if (live) live.textContent = "";
    byId("processing-state")?.setAttribute("aria-busy", "false");
  }

  function clearResources(session) {
    if (!session || session.cleaned) return;
    session.cleaned = true;
    session.timers.forEach(clearTimeout);
    session.timers.clear();
    session.abortController?.abort();
    session.abortController = null;
    session.cleanupCallbacks.splice(0).forEach((callback) => {
      try { callback(); } catch (_) { /* cleanup is best effort */ }
    });
  }

  function startSession(options) {
    if (active && ["processing", "failed"].includes(active.status)) {
      return { accepted: false, error: normalizeError({ code: "DUPLICATE_SUBMISSION" }) };
    }
    const startedAt = nowIso();
    active = {
      id: `roots-scan-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
      type: options?.type === "barcode" ? "barcode" : "label",
      status: "processing", stage: options?.stage || (options?.type === "barcode" ? "reading_barcode" : "preparing_image"),
      startedAt, updatedAt: startedAt, attempt: 1, cancelRequested: false,
      source: options?.source || {}, warnings: [], error: null, result: null, metrics: {},
      timers: new Set(), cleanupCallbacks: [], abortController: new AbortController(),
      retryHandler: options?.retry || null, callbacks: options || {}, cleaned: false,
      performanceTask: root.ROOTS_PERFORMANCE?.startTask?.("time_to_first_useful_result", { source: options?.type === "barcode" ? "barcode" : "label" }),
    };
    setControlsDisabled(true);
    renderStage();
    root.ROOTS_PROCESSING_ANIMATION?.start?.({ sourceType: active.type });
    byId("processing-title")?.focus();
    debug("started");
    return { accepted: true, session: clonePublic(active), signal: active.abortController.signal };
  }

  function updateStage(stage, metadata) {
    if (!active || active.status !== "processing" || active.cancelRequested || !STAGES[stage]) return false;
    const previous = active.stage;
    if (previous && metadata?.duration != null) active.metrics[previous] = Number(metadata.duration) || 0;
    active.stage = stage;
    active.updatedAt = nowIso();
    renderStage();
    debug("stage", { stage, duration: metadata?.duration });
    return true;
  }

  function addWarning(input) {
    if (!active || active.cancelRequested) return false;
    const warning = warningFrom(input);
    active.warnings.push(warning);
    active.updatedAt = nowIso();
    renderStage();
    return warning;
  }

  function setRetry(handler) {
    if (!active) return false;
    active.retryHandler = handler;
    return true;
  }

  function onCleanup(handler) {
    if (!active || typeof handler !== "function") return false;
    active.cleanupCallbacks.push(handler);
    return true;
  }

  function fail(error, fallbackCode) {
    if (!active || active.cancelRequested) return false;
    const normalized = normalizeError(error, fallbackCode);
    active.status = "failed";
    active.error = normalized;
    active.updatedAt = nowIso();
    active.abortController?.abort();
    active.abortController = null;
    active.timers.forEach(clearTimeout);
    active.timers.clear();
    root.ROOTS_PROCESSING_ANIMATION?.fail?.();
    renderFailure(normalized);
    debug("failed", { code: normalized.code });
    return normalized;
  }

  function complete(result) {
    if (!active || active.status !== "processing" || active.cancelRequested) return false;
    const session = active;
    session.status = "success";
    session.result = result;
    session.updatedAt = nowIso();
    const finalize = () => {
      if (active !== session || session.cancelRequested) return false;
      clearResources(session);
      hide();
      setControlsDisabled(false);
      active = null;
      root.ROOTS_PERFORMANCE?.endTask?.(session.performanceTask, { status: "complete", durationMs: Date.now() - Date.parse(session.startedAt) });
      debug("completed", { sessionId: session.id, duration: Date.now() - Date.parse(session.startedAt) });
      session.callbacks.onComplete?.(result, clonePublic(session));
      return true;
    };
    const animation = root.ROOTS_PROCESSING_ANIMATION?.complete?.(result?.evaluation?.verdict || "complete");
    if (animation && typeof animation.then === "function") animation.then(finalize);
    else finalize();
    return true;
  }

  function requestCancel() {
    if (!active) return false;
    const session = active;
    session.cancelRequested = true;
    session.status = "canceled";
    session.updatedAt = nowIso();
    root.ROOTS_PROCESSING_ANIMATION?.stop?.();
    clearResources(session);
    hide();
    setControlsDisabled(false);
    active = null;
    root.ROOTS_PERFORMANCE?.endTask?.(session.performanceTask, { status: "canceled" });
    debug("canceled", { sessionId: session.id, duration: Date.now() - Date.parse(session.startedAt) });
    session.callbacks.onCancel?.(clonePublic(session));
    return true;
  }

  async function retry() {
    if (!active || active.status !== "failed" || typeof active.retryHandler !== "function") return false;
    const session = active;
    session.attempt += 1;
    session.status = "processing";
    session.cancelRequested = false;
    session.error = null;
    session.cleaned = false;
    session.abortController = new AbortController();
    session.updatedAt = nowIso();
    renderStage();
    root.ROOTS_PROCESSING_ANIMATION?.start?.({ sourceType: session.type });
    try {
      await session.retryHandler(clonePublic(session), session.abortController.signal);
    } catch (error) {
      if (isCurrent(session.id)) fail(error);
    }
    return true;
  }

  function withTimeout(promiseOrFactory, milliseconds, code) {
    if (!active || active.cancelRequested) return Promise.reject(normalizeError({ code: "SESSION_CANCELED" }));
    const session = active;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        session.timers.delete(timer);
        const error = normalizeError({ code: code || "UNKNOWN_ERROR" });
        error.name = "TimeoutError";
        reject(error);
      }, milliseconds);
      session.timers.add(timer);
    });
    const operation = typeof promiseOrFactory === "function"
      ? Promise.resolve().then(() => promiseOrFactory(session.abortController?.signal))
      : Promise.resolve(promiseOrFactory);
    return Promise.race([operation, timeout]).finally(() => {
      clearTimeout(timer);
      session.timers.delete(timer);
    });
  }

  function reset() {
    if (active) {
      clearResources(active);
      root.ROOTS_PERFORMANCE?.endTask?.(active.performanceTask, { status: "reset" });
    }
    active = null;
    root.ROOTS_PROCESSING_ANIMATION?.reset?.();
    hide();
    setControlsDisabled(false);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    root.ROOTS_PROCESSING_ANIMATION?.init?.();
    byId("processing-cancel")?.addEventListener("click", requestCancel);
    byId("processing-failure-cancel")?.addEventListener("click", requestCancel);
    byId("processing-retry")?.addEventListener("click", retry);
    byId("processing-scan-label")?.addEventListener("click", () => {
      const callback = active?.callbacks?.onLabelFallback;
      requestCancel();
      callback?.();
    });
    byId("processing-review-photo")?.addEventListener("click", () => {
      const callback = active?.callbacks?.onReviewPhoto;
      if (!active) return;
      const session = active;
      session.cancelRequested = true;
      session.status = "canceled";
      clearResources(session);
      root.ROOTS_PROCESSING_ANIMATION?.stop?.();
      hide();
      setControlsDisabled(false);
      active = null;
      callback?.();
    });
    byId("processing-manual-entry")?.addEventListener("click", () => {
      const callback = active?.callbacks?.onManualEntry;
      requestCancel();
      callback?.();
    });
    onlineHandler = () => {
      const retryButton = byId("processing-retry");
      if (retryButton && active?.error?.category === "network") retryButton.disabled = false;
      const live = byId("processing-live");
      if (live && active?.status === "failed") live.textContent = "Connection restored. Try again when you are ready.";
    };
    offlineHandler = () => {
      if (active?.status === "processing") addWarning({
        code: "network_offline", severity: "caution", title: "Connection lost",
        message: "This internet-required step may not finish.",
      });
    };
    connectivityUnsubscribe = root.ROOTS_CONNECTIVITY?.subscribe?.((connection) => connection.offline ? offlineHandler() : onlineHandler()) || null;
  }

  function destroy() {
    reset();
    initialized = false;
    connectivityUnsubscribe?.();
    connectivityUnsubscribe = null;
    onlineHandler = null;
    offlineHandler = null;
  }

  root.ROOTS_SCAN_PROCESSING = {
    init, destroy, startSession, updateStage, addWarning, setRetry, onCleanup, debug,
    fail, complete, requestCancel, retry, getActiveSession: () => clonePublic(active),
    isCurrent, isAttemptCurrent, withTimeout, normalizeError, reset, constants: { TIMEOUTS, STAGES, ERRORS },
  };
})(typeof window !== "undefined" ? window : globalThis);
