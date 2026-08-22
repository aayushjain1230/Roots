/* ============================================================
   ROOTS — frontend controller
   Barcode decoding and deterministic evaluation run locally. Label OCR uses
   the protected ROOTS backend (see ocr.js).
   ============================================================ */
const HISTORY_KEY = "bij-history-v2";
window.ROOTS_PERFORMANCE?.mark?.("app_script_start");

const HISTORY_LIMIT = 12;

/* ---------- DOM ---------- */
const fileInput = document.getElementById("uploaded_image");
const barcodeInput = document.getElementById("barcode_image");
const preview = document.getElementById("preview");
const spinner = document.getElementById("spinner");
const scanAnimation = document.getElementById("scanAnimation");
const result = document.getElementById("result_desc");
const scanStatus = document.getElementById("scan-status");
const tipBox = document.getElementById("tip-box");
const tipText = document.getElementById("tip-text");
const labelSourceModal = document.getElementById("labelSourceModal");
const scanEntryModal = document.getElementById("scanEntryModal");
const labelCameraScreen = document.getElementById("label-camera-screen");
const labelCameraVideo = document.getElementById("label-camera-video");

const historyList = document.getElementById("historyList");
const savedProductsList = document.getElementById("savedProductsList");
const clearHistoryBtn = document.getElementById("clear-history");

const profileModal = document.getElementById("profileModal");
const infoModal = document.getElementById("infoModal");

let selectedFile = null;

/* ---------- Helpers ---------- */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().replace(/^[,;.\s]+|[,;.\s]+$/g, "");
}
function safeImageUrl(value) {
  const url = String(value || "").trim();
  return /^(https?:|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(url) ? escapeHtml(url) : "";
}

const ICONS = {
  jain: `<svg class="result-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2e7d32"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  uncertain: `<svg class="result-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#f0ad1f"/><path d="M9.2 9.3a2.9 2.9 0 1 1 4 2.7c-.9.4-1.2 1-1.2 1.9" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.3" fill="#fff"/></svg>`,
  nonjain: `<svg class="result-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#c62828"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  // Gray hazard triangle (allergens) — distinct from the yellow "uncertain" circle.
  allergen: `<svg class="result-icon" viewBox="0 0 24 24"><path d="M12 3.4 1.7 20.5a1.05 1.05 0 0 0 .9 1.58h18.8a1.05 1.05 0 0 0 .9-1.58L12 3.4z" fill="#6b7280"/><path d="M12 9.4v4.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.35" fill="#fff"/></svg>`,
};
function bigIcon(kind) { return ICONS[kind].replace('class="result-icon"', 'class="verdict-icon"'); }

/* ---------- View navigation ---------- */
const TOOL_VIEW_IDS = new Set(["askRootsView", "recipeView", "mealsView", "travelView"]);
let homeScrollPosition = 0;
let homeHeroTimer = null;

function dockViewFor(viewId) {
  return TOOL_VIEW_IDS.has(viewId) ? "assistantView" : viewId;
}

function updateToolProfileContext() {
  const profile = window.ROOTS_PROFILE?.getActiveProfile?.() || window.ROOTS_PROFILE?.createDefaultProfile?.();
  const name = profile?.name || "My Profile";
  document.querySelectorAll("[data-tool-profile-context]").forEach((element) => {
    const prefix = element.dataset.prefix || "Using";
    const profileLabel = /profile$/i.test(name) ? name : `${name}'s profile`;
    element.textContent = `${prefix} ${profileLabel}`;
  });
}

function homeMealPeriodForHour(hour) {
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 17) return "Lunch";
  return "Dinner";
}

const HOME_MEAL_IMAGES = Object.freeze({
  breakfast: "assets/home/breakfast-parfait.png",
  lunch: "assets/home/lunch-penne.png",
  dinner: "assets/home/dinner-thali.png",
});

function updateHomeHero() {
  const hour = new Date().getHours();
  const kicker = document.getElementById("home-hero-kicker");
  const title = document.getElementById("home-restaurant-title");
  const support = document.getElementById("home-hero-support");
  const hero = document.getElementById("home-restaurant-finder");
  const image = document.getElementById("home-hero-image");
  const greeting = document.getElementById("home-greeting");
  if (!kicker || !title) return;
  const period = homeMealPeriodForHour(hour);
  const greetingText = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  kicker.textContent = period.toUpperCase();
  title.textContent = `${period} nearby`;
  if (support) support.textContent = "Find dishes that match your profile";
  const mealKey = period.toLowerCase();
  if (hero) { hero.dataset.context = "restaurants"; hero.dataset.mealPeriod = mealKey; }
  if (image && image.getAttribute("src") !== HOME_MEAL_IMAGES[mealKey]) image.src = HOME_MEAL_IMAGES[mealKey];
  if (greeting) greeting.textContent = greetingText;
  clearTimeout(homeHeroTimer);
  const next = new Date();
  if (hour < 5) next.setHours(5, 0, 0, 0);
  else if (hour < 11) next.setHours(11, 0, 0, 0);
  else if (hour < 17) next.setHours(17, 0, 0, 0);
  else { next.setDate(next.getDate() + 1); next.setHours(5, 0, 0, 0); }
  homeHeroTimer = setTimeout(() => { if (document.body.dataset.activeView === "scanView") updateHomeHero(); }, Math.max(1000, next.getTime() - Date.now() + 100));
}

async function showView(viewId, options = {}) {
  const nextView = document.getElementById(viewId);
  if (!nextView?.classList.contains("view")) return;
  const navigationTask = window.ROOTS_PERFORMANCE?.startTask?.("navigation", { source: viewId });
  const previousView = document.querySelector(".view.active");
  if (previousView?.id === "scanView" && viewId !== "scanView") homeScrollPosition = window.scrollY;
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === viewId;
    view.classList.toggle("active", active);
    view.hidden = !active;
    view.setAttribute("aria-hidden", String(!active));
    if (active) view.removeAttribute("inert");
    else view.setAttribute("inert", "");
  });
  document.body.dataset.activeView = viewId;
  const dockView = dockViewFor(viewId);
  document.querySelectorAll(".dock-btn").forEach(b => {
    const active = b.dataset.view === dockView;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  updateToolProfileContext();
  if (viewId === "scanView") updateHomeHero();
  const restoreHome = viewId === "scanView" && options.restoreHomeScroll !== false;
  window.scrollTo(0, restoreHome ? homeScrollPosition : 0);
  document.dispatchEvent(new CustomEvent("roots:viewchange", { detail: { viewId } }));
  if (options.recordHistory && history.state?.rootsView !== viewId) {
    history.pushState({ rootsView: viewId }, "", `#${viewId.replace("View", "").toLowerCase()}`);
  }
  try {
    await window.ROOTS_FEATURES?.ensureForView?.(viewId);
    if (viewId === "savedView") {
      renderSavedProducts(); renderHistory(); window.ROOTS_RESTAURANT_MEMORY?.render?.();
      window.ROOTS_PERSONALIZATION_VIEW?.renderSavedRestaurants?.(); window.ROOTS_TRAVEL_VIEW?.refreshSaved?.();
    }
  } catch (_) {
    const status = viewId === "restaurantsView" ? document.getElementById("restaurant-status") : null;
    if (status) status.textContent = "Restaurants could not load. Error code: FEATURE_LOAD_FAILED.";
  } finally {
    window.ROOTS_PERFORMANCE?.endTask?.(navigationTask, { status: "complete" });
    if (TOOL_VIEW_IDS.has(viewId)) {
      requestAnimationFrame(() => nextView.querySelector("h2[tabindex='-1']")?.focus());
    } else if (restoreHome) {
      const restore = () => window.scrollTo(0, homeScrollPosition);
      nextView.addEventListener("animationend", restore, { once: true });
      requestAnimationFrame(restore);
    }
  }
}
document.querySelectorAll(".dock-btn").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view, { recordHistory: true }));
});
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
history.replaceState({ rootsView: document.querySelector(".view.active")?.id || "scanView" }, "", location.href);
showView(history.state?.rootsView || "scanView", { restoreHomeScroll: false });
window.addEventListener("popstate", (event) => {
  showView(event.state?.rootsView || "scanView", { restoreHomeScroll: true });
});

function handleLogicalBack() {
  const closers = [
    ["#travel-card-screen:not([hidden])", "#travel-card-back"],
    [".dining-assistant-modal.open", "#dining-assistant-close"],
    [".restaurant-communication-modal.open", "#restaurant-communication-close"],
    [".restaurant-memory-modal.open", "#restaurant-memory-close"],
    [".order-builder-modal.open", "#order-builder-close"],
    [".restaurant-detail-modal.open", "#restaurant-detail-close"],
    [".menu-import-modal.open", "#menu-modal-close"],
    [".travel-mode-modal.open", "#travel-mode-close"],
    ['#ingredientReviewModal[aria-hidden="false"]', "#closeIngredientReview"],
    ['#profileModal[aria-hidden="false"]', "#closeProfile"],
    ['#infoModal[aria-hidden="false"]', "#closeModal"],
    ['#labelSourceModal[aria-hidden="false"]', "#label-source-close"],
    ['#scanEntryModal[aria-hidden="false"]', "#scan-entry-close"],
  ];
  for (const [openSelector, closeSelector] of closers) {
    if (document.querySelector(openSelector)) {
      document.querySelector(closeSelector)?.click();
      return true;
    }
  }
  const active = document.querySelector(".view.active")?.id;
  if (document.body.classList.contains("report-view-active")) {
    resetScanSession({ reason: "back_from_report" });
    showView("scanView", { restoreHomeScroll: true });
    return true;
  }
  if (active && active !== "scanView") {
    if (history.state?.rootsView === active) history.back();
    else showView("scanView", { restoreHomeScroll: true });
    return true;
  }
  return false;
}
document.addEventListener("backbutton", (event) => {
  if (handleLogicalBack()) event.preventDefault?.();
});

/* ---------- Active universal profile ---------- */
function getDietProfile() {
  return window.ROOTS_PROFILE.getActiveProfile() || window.ROOTS_PROFILE.createDefaultProfile();
}
function describeDiet() {
  const profile = window.ROOTS_PROFILE.getActiveProfile() || window.ROOTS_PROFILE.createDefaultProfile();
  return window.ROOTS_PROFILE.getProfileForAI(profile);
}
function openProfile() {
  if (window.ROOTS_PROFILE_UI) window.ROOTS_PROFILE_UI.openSettings();
  else openModal(profileModal);
}

/* ---------- Tips ---------- */
/* ---------- Label capture and review ---------- */
function showLabelSource(message, recovery) {
  const error = document.getElementById("label-source-error");
  const actions = document.getElementById("camera-recovery-actions");
  const settings = document.getElementById("camera-open-settings");
  error.textContent = message || "";
  actions.hidden = !recovery;
  settings.hidden = !recovery?.canOpenSettings;
  openModal(labelSourceModal);
}
function openScanEntry(message = "", options = {}) {
  const error = document.getElementById("scan-entry-error");
  const barcodePhoto = document.getElementById("scan-barcode-photo-btn");
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  if (barcodePhoto) barcodePhoto.hidden = !options.barcodePhoto;
  openModal(scanEntryModal);
}
function hideLabelCamera() {
  window.ROOTS_CAMERA?.stop();
  labelCameraScreen.hidden = true;
  document.body.classList.remove("capture-active");
}
function resetScanSession(options = {}) {
  const closeReport = options.closeReport !== false;
  if (closeReport) window.ROOTS_REPORT?.close?.(false);
  window.ROOTS_SCAN_PROCESSING?.reset?.();
  window.ROOTS_IMAGE_REVIEW?.dispose?.(false);
  window.ROOTS_CAMERA?.stop?.();
  stopBarcodeScanner?.();
  selectedFile = null;
  pendingImageReplacement = false;
  replacementAccepted = false;
  cameraReviewFallback = false;
  captureBusy = false;
  window.ROOTS_REPORT_AI_CONTEXT = "";
  window.ROOTS_SCAN_PIPELINE?.clearCurrent?.();
  if (fileInput) fileInput.value = "";
  if (barcodeInput) barcodeInput.value = "";
  if (preview) {
    preview.removeAttribute("src");
    preview.classList.add("is-hidden");
  }
  if (spinner) spinner.classList.add("is-hidden");
  clearScanStatus();
  if (result) {
    result.innerHTML = "";
    result.style.display = "none";
  }
  if (tipBox) tipBox.classList.remove("hidden");
  if (scanAnimation) scanAnimation.style.display = "";
  document.body.classList.remove("has-scan-result", "report-view-active", "capture-active");
  if (labelCameraScreen) labelCameraScreen.hidden = true;
  document.dispatchEvent(new CustomEvent("roots:scanreset", { detail: { reason: options.reason || "new_scan" } }));
}

function startFreshScan(message = "", options = {}) {
  resetScanSession({ reason: "open_scan_entry" });
  showView("scanView", { restoreHomeScroll: false });
  openScanEntry(message, options);
}

let pendingImageReplacement = false;
let replacementAccepted = false;
let cameraReviewFallback = false;
function openLabelImagePicker(preserveReview = false) {
  if (!fileInput) return;
  pendingImageReplacement = preserveReview;
  replacementAccepted = false;
  fileInput.value = "";
  const restoreAfterPicker = () => {
    window.removeEventListener("focus", restoreAfterPicker);
    window.setTimeout(() => {
      if (pendingImageReplacement && !replacementAccepted) window.ROOTS_IMAGE_REVIEW?.restore?.();
      pendingImageReplacement = false;
    }, 0);
  };
  if (preserveReview) window.addEventListener("focus", restoreAfterPicker, { once: true });
  fileInput.click();
}
async function startLabelCamera() {
  closeModal(labelSourceModal);
  labelCameraScreen.hidden = false;
  document.body.classList.add("capture-active");
  document.getElementById("label-camera-capture").disabled = false;
  try {
    const caps = await window.ROOTS_CAMERA.start(labelCameraVideo);
    const torch = document.getElementById("label-camera-torch");
    torch.hidden = !caps.torch;
    torch.textContent = "Turn flash on";
    torch.setAttribute("aria-label", "Turn flash on");
  } catch (error) {
    hideLabelCamera();
    if (cameraReviewFallback) {
      cameraReviewFallback = false;
      window.ROOTS_IMAGE_REVIEW?.restore?.();
    } else {
      showLabelSource(error?.message || "Camera unavailable.", error || { code: "camera_unavailable" });
    }
  }
}
function beginImageReview(file, sourceType) {
  if (!file) return;
  window.ROOTS_IMAGE_REVIEW.open(file, {
    sourceType,
    deferProcessing: true,
    onUse: (_workingFile, _metadata, control) => handleFile(control),
    onCancel: () => showView("scanView"),
    onRetake: () => { cameraReviewFallback = true; startLabelCamera(); },
    onReplace: () => openLabelImagePicker(true),
    onError: (error) => showLabelSource(error?.message || "This image could not be opened."),
  });
}
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  replacementAccepted = !!file;
  e.target.value = "";
  if (file) beginImageReview(file, "library");
  else if (pendingImageReplacement) window.ROOTS_IMAGE_REVIEW?.restore?.();
  pendingImageReplacement = false;
});
if (barcodeInput) barcodeInput.addEventListener("change", e => { handleBarcodeFile(e.target.files[0]); e.target.value = ""; });
document.getElementById("scan-label-btn")?.addEventListener("click", () => { closeModal(scanEntryModal); startLabelCamera(); });
document.getElementById("scan-photo-btn")?.addEventListener("click", () => { closeModal(scanEntryModal); openLabelImagePicker(false); });
document.getElementById("label-source-close")?.addEventListener("click", () => closeModal(labelSourceModal));
document.getElementById("label-take-photo")?.addEventListener("click", startLabelCamera);
document.getElementById("label-choose-library")?.addEventListener("click", () => { closeModal(labelSourceModal); openLabelImagePicker(false); });
document.getElementById("label-enter-manual")?.addEventListener("click", () => { closeModal(labelSourceModal); showView("scanView"); openIngredientReview(); });
document.getElementById("camera-try-again")?.addEventListener("click", startLabelCamera);
document.getElementById("camera-open-settings")?.addEventListener("click", () => window.ROOTS_CAMERA.openSettings());
document.getElementById("label-camera-cancel")?.addEventListener("click", () => {
  hideLabelCamera();
  if (cameraReviewFallback) window.ROOTS_IMAGE_REVIEW?.restore?.();
  else showView("scanView");
  cameraReviewFallback = false;
});
document.getElementById("label-camera-library")?.addEventListener("click", () => {
  hideLabelCamera();
  openLabelImagePicker(cameraReviewFallback);
  cameraReviewFallback = false;
});
document.getElementById("label-camera-torch")?.addEventListener("click", async event => {
  const current = window.ROOTS_CAMERA.getSessionState().torchOn;
  if (await window.ROOTS_CAMERA.setTorch(!current)) {
    event.currentTarget.textContent = current ? "Turn flash on" : "Turn flash off";
    event.currentTarget.setAttribute("aria-label", event.currentTarget.textContent);
  }
});
document.getElementById("label-camera-capture")?.addEventListener("click", async event => {
  if (event.currentTarget.disabled) return;
  event.currentTarget.disabled = true;
  labelCameraScreen.classList.add("shutter-feedback");
  try {
    const file = await window.ROOTS_CAMERA.capture(labelCameraVideo);
    hideLabelCamera();
    cameraReviewFallback = false;
    beginImageReview(file, "camera");
  } catch (_) {
    hideLabelCamera();
    showLabelSource("We could not take the photo.", { code: "capture_failed" });
  } finally {
    labelCameraScreen.classList.remove("shutter-feedback");
  }
});

function setScanStatus(text) {
  if (!scanStatus) return;
  scanStatus.textContent = text;
  scanStatus.classList.remove("is-hidden");
}
function clearScanStatus() {
  if (!scanStatus) return;
  scanStatus.textContent = "";
  scanStatus.classList.add("is-hidden");
}

// Pin the Scan buttons (CSS) and reset the result area for a new scan.
function prepResultArea() {
  document.body.classList.add("has-scan-result");
  if (tipBox) tipBox.classList.add("hidden");
  if (scanAnimation) scanAnimation.style.display = "none";
  if (window.ROOTS_HOME_ANIMATION?.instance) window.ROOTS_HOME_ANIMATION.instance.sync();
  result.style.display = "none";
  spinner.classList.remove("is-hidden");
}
function showPreviewFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => { preview.src = reader.result; preview.classList.remove("is-hidden"); };
  reader.readAsDataURL(file);
}
function showPreviewFromDataUrl(url) {
  if (!url) { preview.classList.add("is-hidden"); return; }
  preview.src = url;
  preview.classList.remove("is-hidden");
}
async function legacyHandleFile(file, reviewMetadata) {
  if (!file) return;
  selectedFile = file;
  prepResultArea();
  showPreviewFromFile(file);
  setScanStatus("Scanning ingredients… this may take a moment.");
  try {
    const extracted = await window.BIJ_OCR.extractLabel(file, (progress) => {
      setScanStatus(progress > 0.8 ? "Checking your profile" : progress > 0.35 ? "Translating ingredients" : "Reading label");
    });
    if (reviewMetadata?.warnings?.length) {
      extracted.extractionWarnings = [
        ...(extracted.extractionWarnings || []),
        ...reviewMetadata.warnings.map(code => ({ code, message: code.replace(/_/g, " "), action: "Review Ingredients" })),
      ];
    }
    const source = window.ROOTS_SCAN_PIPELINE.sourceFromOcr(extracted);
    source.sourceMetadata = { ...(source.sourceMetadata || {}), imageReview: reviewMetadata || null };
    const scan = window.ROOTS_SCAN_PIPELINE.evaluateSource(source, getDietProfile());
    displayResult(scan, { save: scan.state === "EVALUATED" });
  } catch (err) {
        const publicMessage = err?.publicMessage || window.ROOTS_ERRORS?.publicMessage?.(err?.code) || err?.message || "Couldn't read that label. Try a clearer, tighter photo.";
    showScanError(publicMessage, { manualEntry: true });
  } finally {
    clearScanStatus();
    spinner.classList.add("is-hidden");
  }
}

function waitForProcessingPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function handleFile(reviewControl) {
  if (!reviewControl?.prepare) return;
  const processing = window.ROOTS_SCAN_PROCESSING;
  const started = processing.startSession({
    type: "label",
    stage: "preparing_image",
    source: { imageSessionId: reviewControl.sessionId, hasOriginalImage: true },
    onComplete: (scan) => {
      selectedFile = null;
      window.ROOTS_IMAGE_REVIEW?.dispose?.(false);
      displayResult(scan, { save: scan.state === "EVALUATED" });
    },
    onCancel: () => window.ROOTS_IMAGE_REVIEW?.restore?.(),
    onReviewPhoto: () => window.ROOTS_IMAGE_REVIEW?.restore?.(),
    onManualEntry: () => {
      window.ROOTS_IMAGE_REVIEW?.dispose?.(false);
      showView("scanView");
      openIngredientReview();
    },
  });
  if (!started.accepted) return;
  const sessionId = started.session.id;
  const job = { workingFile: null, extracted: null, source: null, reviewMetadata: null };
  const run = async (attemptSession) => {
    const attempt = attemptSession?.attempt || processing.getActiveSession()?.attempt || 1;
    try {
      if (!job.workingFile) {
        processing.updateStage("preparing_image");
        processing.setRetry(run);
        await waitForProcessingPaint();
        const prepared = await reviewControl.prepare();
        if (!processing.isAttemptCurrent(sessionId, attempt)) return;
        job.workingFile = prepared.file;
        job.reviewMetadata = prepared.metadata || null;
        selectedFile = job.workingFile;
        showPreviewFromFile(job.workingFile);
      }
      if (!job.extracted) {
        processing.updateStage("reading_label");
        processing.setRetry(run);
        job.extracted = await processing.withTimeout(
          (signal) => window.BIJ_OCR.extractLabel(job.workingFile, (progress) => {
            if (processing.isAttemptCurrent(sessionId, attempt) && progress >= 0.35) processing.updateStage("detecting_language");
          }, { signal }),
          processing.constants.TIMEOUTS.ocr,
          "OCR_TIMEOUT"
        );
      }
      if (!processing.isAttemptCurrent(sessionId, attempt)) return;
      const language = String(job.extracted.detectedLanguage || job.extracted.originalLanguage || "en").toLowerCase();
      if (language && !language.startsWith("en")) processing.updateStage("translating");
      (job.reviewMetadata?.warnings || []).forEach((code) => processing.addWarning(code));
      processing.updateStage("parsing");
      if (job.reviewMetadata?.warnings?.length) {
        job.extracted.extractionWarnings = [
          ...(job.extracted.extractionWarnings || []),
          ...job.reviewMetadata.warnings.map(code => ({
            code, message: code.replace(/_/g, " "), action: "Review Ingredients",
          })),
        ];
      }
      const parserStarted = performance.now();
      const parserTask = window.ROOTS_PERFORMANCE?.startTask?.("ingredient_parsing", { source: job.extracted.extractionProvider || "unknown" });
      job.source = job.source || window.ROOTS_SCAN_PIPELINE.sourceFromOcr(job.extracted);
      window.ROOTS_PERFORMANCE?.endTask?.(parserTask, { durationMs: performance.now() - parserStarted, status: "complete" });
      if (performance.now() - parserStarted > processing.constants.TIMEOUTS.parser) throw { code: "PARSER_INTERNAL_ERROR" };
      job.source.sourceMetadata = { ...(job.source.sourceMetadata || {}), imageReview: job.reviewMetadata };
      if ((job.reviewMetadata?.warnings || []).includes("crop_too_small")) {
        throw { code: "PARSER_EMPTY", alternativeActions: ["review_photo", "retake"] };
      }
      processing.updateStage("checking_profile");
      processing.setRetry(run);
      const engineStarted = performance.now();
      const scan = window.ROOTS_SCAN_PIPELINE.evaluateSource(job.source, getDietProfile());
      if (performance.now() - engineStarted > processing.constants.TIMEOUTS.engine) throw { code: "ENGINE_TIMEOUT" };
      if (!processing.isAttemptCurrent(sessionId, attempt)) return;
      if (scan.state !== "EVALUATED") throw { code: "PARSER_EMPTY", alternativeActions: ["review_photo", "manual_entry"] };
      processing.updateStage("saving_result");
      await processing.complete(scan);
    } catch (error) {
      if (!processing.isAttemptCurrent(sessionId, attempt)) return;
      const fallback = !job.workingFile ? "PREPROCESSING_FAILED" : job.extracted ? "EVALUATION_FAILED" : "OCR_PROVIDER_ERROR";
      processing.fail(error, fallback);
    }
  };
  run(started.session);
}

// Shared: given a decoded barcode, look it up in Open Food Facts and show the result.
async function lookupAndShow(code, sessionId, job) {
  const processing = window.ROOTS_SCAN_PROCESSING;
  job = job || {};
  processing.updateStage("finding_product");
  const product = job.product || await processing.withTimeout(
    (signal) => window.BIJ_FOODFACTS.lookup(code, { signal }),
    processing.constants.TIMEOUTS.product_lookup,
    "BARCODE_LOOKUP_TIMEOUT"
  );
  job.product = product;
  if (!processing.isCurrent(sessionId)) return;
  if (!product.found) throw { code: "PRODUCT_NOT_FOUND", alternativeActions: ["scan_label"] };
  const originalText = product.rawIngredientText || (product.ingredients || []).join(", ");
  if (!originalText.trim()) throw { code: "PRODUCT_MISSING_INGREDIENTS", alternativeActions: ["scan_label"] };
  processing.updateStage("reading_ingredients");
  let translated = job.translated || [];
  if (!product.english && originalText && window.BIJ_OCR.hasCloudKey() && !job.translationAttempted) {
    processing.updateStage("translating");
    translated = await processing.withTimeout(
      (signal) => window.BIJ_OCR.translateIngredientList(
        window.ROOTS_INGREDIENT_PARSER.splitOutside(originalText), { signal }
      ),
      processing.constants.TIMEOUTS.translation,
      "TRANSLATION_FAILED"
    );
    job.translationAttempted = true;
    job.translated = translated;
    if (!translated.length) processing.addWarning("translation_uncertain");
  }
  if (!processing.isCurrent(sessionId)) return;
  processing.updateStage("parsing");
  const parserStarted = performance.now();
  const source = window.ROOTS_SCAN_PIPELINE.sourceFromBarcode(product, translated);
  if (performance.now() - parserStarted > processing.constants.TIMEOUTS.parser) throw { code: "PARSER_INTERNAL_ERROR" };
  processing.updateStage("checking_profile");
  const engineStarted = performance.now();
  const scan = window.ROOTS_SCAN_PIPELINE.evaluateSource(source, getDietProfile());
  if (performance.now() - engineStarted > processing.constants.TIMEOUTS.engine) throw { code: "ENGINE_TIMEOUT" };
  if (!processing.isCurrent(sessionId)) return;
  if (scan.state !== "EVALUATED") throw { code: "PARSER_EMPTY" };
  processing.updateStage("saving_result");
  processing.complete(scan);
}

/* ----- Live barcode scanner (preferred): camera preview + shutter button, same "take a
   photo, get a result" flow as the old photo-capture path — just with a box overlay so the
   captured frame gets cropped to that region before decoding, cutting out the background
   clutter that used to cause failed scans. Tap the shutter (#scanner-capture) to capture;
   there's no auto-decode loop, so nothing happens until you deliberately take the shot. */
let cameraStream = null;
let captureBusy = false;

// Set by startBarcodeScanner() when the live camera fails to open, so the photo-fallback
// error (handleBarcodeFile) can surface *why* — otherwise that failure is silently
// swallowed and it looks like the file-scan is the only thing broken.
let lastCameraOpenError = null;

function stopBarcodeScanner() {
  const overlay = document.getElementById("scanner-overlay");
  if (overlay) overlay.style.display = "none";
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById("scanner-video");
  if (video) video.srcObject = null;
}

// Resolves once the video is actually decoding real frames (videoWidth/Height populated),
// or rejects after timeoutMs. A <video> can sit at 0x0 indefinitely if play() silently
// stalls (autoplay quirks) even though getUserMedia itself succeeded — without this check
// the overlay would show a permanently black box instead of ever falling back.
function waitForVideoReady(video, timeoutMs) {
  if (video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error("video never started (timed out)")); }, timeoutMs);
    function check() {
      if (video.videoWidth && video.videoHeight) { cleanup(); resolve(); }
    }
    function cleanup() {
      clearTimeout(t);
      video.removeEventListener("loadedmetadata", check);
      video.removeEventListener("playing", check);
    }
    video.addEventListener("loadedmetadata", check);
    video.addEventListener("playing", check);
    check(); // in case it's already ready
  });
}

async function startBarcodeScanner() {
  if (cameraStream || window.ROOTS_SCAN_PROCESSING?.getActiveSession()) return;
  const overlay = document.getElementById("scanner-overlay");
  const video = document.getElementById("scanner-video");
  const cameraTask = window.ROOTS_PERFORMANCE?.startTask?.("camera_ready", { source: "barcode" });
  try {
    // "ideal" width/height are soft hints (spec: never cause a hard rejection, the browser
    // just does its best) — needed for a high-enough-res crop to actually read a barcode's
    // fine bars. An earlier version ALSO added `advanced: [{ focusMode: "continuous" }]`
    // alongside this and camera-open broke; `advanced` entries with a constraint name a
    // given WebKit build doesn't recognize can reject synchronously (unlike plain "ideal"),
    // so that's the more likely actual culprit — dropped here, keeping just the resolution hint.
    cameraStream = await window.ROOTS_CAMERA.requestStream();
    lastCameraOpenError = null;
  } catch (err) {
    lastCameraOpenError = (err && err.name ? err.name + ": " : "") + (err && err.message ? err.message : String(err));
    window.ROOTS_PERFORMANCE?.endTask?.(cameraTask, { status: "failed" });
    openScanEntry(err?.message || "The camera could not start. Choose a barcode photo instead.", { barcodePhoto: true });
    return;
  }
  // Set JS properties too, not just the HTML attributes — more reliably respected than
  // markup alone across browsers/WKWebView for autoplay eligibility.
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = cameraStream;
  if (overlay) overlay.style.display = "flex"; // instant feedback, don't wait on readiness
  try {
    await video.play();
    await waitForVideoReady(video, 4000);
    window.ROOTS_PERFORMANCE?.endTask?.(cameraTask, { status: "ready" });
  } catch (err) {
    window.ROOTS_PERFORMANCE?.endTask?.(cameraTask, { status: "failed" });
    // getUserMedia succeeded but the video never actually started rendering frames —
    // don't leave a black screen up, fall back to the still-photo path like any other
    // camera failure.
    lastCameraOpenError = "video failed to start: " + (err && err.message ? err.message : String(err));
    stopBarcodeScanner();
    openScanEntry("The camera preview did not start. Choose a barcode photo instead.", { barcodePhoto: true });
  }
}

// Crop the live video to #scanner-box's on-screen region (object-fit:cover math) and try
// to decode it. Returns the cropped photo (as a data URL, so it can be shown as the scan
// preview — same as the old photo-capture flow) alongside whatever code was found, if any.
async function decodeVideoFrame() {
  const video = document.getElementById("scanner-video");
  const boxEl = document.getElementById("scanner-box");
  if (!video || !video.videoWidth || !boxEl) return { code: null, dataUrl: null };
  const videoRect = video.getBoundingClientRect();
  const boxRect = boxEl.getBoundingClientRect();
  const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
  const dispW = video.videoWidth * scale;
  const dispH = video.videoHeight * scale;
  const offX = (dispW - videoRect.width) / 2;
  const offY = (dispH - videoRect.height) / 2;
  const sx = ((boxRect.left - videoRect.left) + offX) / scale;
  const sy = ((boxRect.top - videoRect.top) + offY) / scale;
  const sw = boxRect.width / scale;
  const sh = boxRect.height / scale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const detectionTask = window.ROOTS_PERFORMANCE?.startTask?.("barcode_detection", { source: "camera" });
  const { scanImageData } = await ensureZbarWasm();
  const symbols = await scanImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  window.ROOTS_PERFORMANCE?.endTask?.(detectionTask, { status: symbols?.length ? "detected" : "not_found" });
  const code = symbols && symbols.length ? symbols[0].decode() : null;
  return { code, dataUrl };
}

// The shutter tap: capture the current frame (cropped to the box), decode it, and either
// show the result or the same error screen the old photo-capture flow used. The cropped
// photo itself always shows as the preview immediately, whether or not decode succeeds —
// and the spinner/status always clear via finally, so neither gets stuck on a failed scan.
async function legacyCaptureAndDecode() {
  if (captureBusy || !cameraStream) return;
  captureBusy = true;
  let code = null, dataUrl = null;
  try { ({ code, dataUrl } = await decodeVideoFrame()); } catch (_) { /* leave both null */ }
  stopBarcodeScanner();
  selectedFile = null;
  prepResultArea();
  showPreviewFromDataUrl(dataUrl);
  try {
    if (!code) {
      showScanError("Couldn't find a barcode in that photo.", { labelFallback: true });
      return;
    }
    setScanStatus("Looking up product…");
    await lookupAndShow(code);
  } catch (err) {
    showScanError(err?.message || "Couldn't look up that barcode.", { labelFallback: true });
  } finally {
    clearScanStatus();
    spinner.classList.add("is-hidden");
    captureBusy = false;
  }
}

async function captureAndDecode() {
  if (captureBusy || !cameraStream) return;
  captureBusy = true;
  const processing = window.ROOTS_SCAN_PROCESSING;
  const job = {};
  let currentCode = null;
  const started = processing.startSession({
    type: "barcode", stage: "reading_barcode",
    onComplete: (scan) => { selectedFile = null; displayResult(scan, { save: scan.state === "EVALUATED" }); },
    onCancel: () => { stopBarcodeScanner(); showView("scanView"); captureBusy = false; },
    onLabelFallback: () => showLabelSource(),
  });
  if (!started.accepted) { captureBusy = false; return; }
  const sessionId = started.session.id;
  const retryLookup = async () => {
    try { await lookupAndShow(currentCode, sessionId, job); }
    catch (error) { if (processing.isCurrent(sessionId)) processing.fail(error, "BARCODE_LOOKUP_NETWORK"); }
  };
  try {
    const frame = await processing.withTimeout(
      decodeVideoFrame(), processing.constants.TIMEOUTS.barcode_decode, "BARCODE_NOT_FOUND_IN_IMAGE"
    );
    stopBarcodeScanner();
    showPreviewFromDataUrl(frame.dataUrl);
    if (!frame.code) throw { code: "BARCODE_NOT_FOUND_IN_IMAGE" };
    currentCode = frame.code;
    processing.setRetry(retryLookup);
    await retryLookup();
  } catch (error) {
    stopBarcodeScanner();
    if (processing.isCurrent(sessionId)) processing.fail(error, "BARCODE_NOT_FOUND_IN_IMAGE");
  } finally {
    captureBusy = false;
  }
}

const scannerCaptureBtn = document.getElementById("scanner-capture");
if (scannerCaptureBtn) scannerCaptureBtn.addEventListener("click", captureAndDecode);

/* ----- Photo fallback (camera blocked/denied, or no barcode found live): decode a
   captured still via the same zbar-wasm pipeline as the live scanner above. ----- */
let zbarWasmPromise = null;
function ensureZbarWasm() {
  if (!zbarWasmPromise) zbarWasmPromise = import("./zbar-wasm/index.mjs");
  return zbarWasmPromise;
}
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}
// Cap the long edge so decoding a 12MP+ photo stays fast/light on memory, while keeping
// far more resolution than a barcode actually needs (the old bug capped this at 300px).
function imageDataForDecode(img, maxEdge) {
  maxEdge = maxEdge || 2200;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
async function legacyHandleBarcodeFile(file) {
  if (!file) return;
  selectedFile = file;
  prepResultArea();
  showPreviewFromFile(file);
  setScanStatus("Reading barcode…");
  try {
    let code = null;
    try {
      const { scanImageData } = await ensureZbarWasm();
      const img = await loadImageFromFile(file);
      const imageData = imageDataForDecode(img);
      const symbols = await scanImageData(imageData);
      if (symbols && symbols.length) code = symbols[0].decode();
    } catch (_) {
      code = null;
    }
    if (!code) {
      // TEMP DIAGNOSTIC (remove once the live camera is confirmed opening reliably):
      // reveal why the live scanner fell back to a still photo in the first place.
      const camNote = lastCameraOpenError ? ` [camera didn't open: ${lastCameraOpenError}]` : " [camera opened fine, or wasn't tried this time]";
      showScanError("Couldn't find a barcode in that photo." + camNote, { labelFallback: true });
      return;
    }
    await lookupAndShow(code);
  } catch (err) {
    showScanError(err?.message || "Couldn't look up that barcode.", { labelFallback: true });
  } finally {
    clearScanStatus();
    spinner.classList.add("is-hidden");
  }
}

async function handleBarcodeFile(file) {
  if (!file) return;
  const processing = window.ROOTS_SCAN_PROCESSING;
  const job = {};
  let currentCode = null;
  const started = processing.startSession({
    type: "barcode", stage: "reading_barcode",
    onComplete: (scan) => { selectedFile = null; displayResult(scan, { save: scan.state === "EVALUATED" }); },
    onCancel: () => showView("scanView"),
    onLabelFallback: () => showLabelSource(),
  });
  if (!started.accepted) return;
  const sessionId = started.session.id;
  const retryLookup = async () => {
    try { await lookupAndShow(currentCode, sessionId, job); }
    catch (error) { if (processing.isCurrent(sessionId)) processing.fail(error, "BARCODE_LOOKUP_NETWORK"); }
  };
  selectedFile = file;
  showPreviewFromFile(file);
  try {
    const { scanImageData } = await ensureZbarWasm();
    const img = await loadImageFromFile(file);
    const symbols = await processing.withTimeout(
      scanImageData(imageDataForDecode(img)),
      processing.constants.TIMEOUTS.barcode_decode,
      "BARCODE_NOT_FOUND_IN_IMAGE"
    );
    if (!symbols?.length) throw { code: "BARCODE_NOT_FOUND_IN_IMAGE" };
    currentCode = symbols[0].decode();
    processing.setRetry(retryLookup);
    await retryLookup();
  } catch (error) {
    if (processing.isCurrent(sessionId)) processing.fail(error, "BARCODE_NOT_FOUND_IN_IMAGE");
  }
}

const scanBarcodeBtn = document.getElementById("scan-barcode-btn");
if (scanBarcodeBtn) scanBarcodeBtn.addEventListener("click", () => { closeModal(scanEntryModal); startBarcodeScanner(); });
const scannerCancel = document.getElementById("scanner-cancel");
if (scannerCancel) scannerCancel.addEventListener("click", stopBarcodeScanner);

function showScanError(message, opts) {
  opts = opts || {};
  result.style.display = "block";
  const cta = opts.labelFallback
    ? `<div class="error-actions">
         <button type="button" class="error-cta" id="error-retry-barcode">Try Again</button>
         <button type="button" class="error-cta-secondary" id="error-scan-label">Or Scan Label</button>
       </div>`
    : opts.manualEntry
      ? `<div class="error-actions">
           <button type="button" class="error-cta" id="error-enter-ingredients">Enter Ingredients Manually</button>
           <button type="button" class="error-cta-secondary" id="error-choose-photo">Choose Another Photo</button>
         </div>`
    : "";
  result.innerHTML = `<div class="scan-error">${ICONS.uncertain}<h2>Couldn't scan that</h2><p class="muted">${escapeHtml(message)}</p>${cta}</div>`;
  const retryBtn = document.getElementById("error-retry-barcode");
  if (retryBtn) retryBtn.addEventListener("click", () => startBarcodeScanner());
  const labelBtn = document.getElementById("error-scan-label");
  if (labelBtn) labelBtn.addEventListener("click", () => showLabelSource());
  const manualBtn = document.getElementById("error-enter-ingredients");
  if (manualBtn) manualBtn.addEventListener("click", openIngredientReview);
  const photoBtn = document.getElementById("error-choose-photo");
  if (photoBtn) photoBtn.addEventListener("click", () => openLabelImagePicker(false));
}

function ingredientCard(item, kind) {
  const name = escapeHtml(item.name || "Ingredient");
  const original = normalizeName(item.translation || "");
  const showOriginal = original && original.toLowerCase() !== String(item.name || "").toLowerCase();
  const reason = item.reason ? `<span class="reason">${escapeHtml(item.reason)}</span>` : "";
  const iconKey = kind === "non-jain" ? "nonjain" : kind;
  return `
    <div class="result-card ${kind}">
      <div class="result-text">
        <b>${name}${showOriginal ? ` <span class="translation">(${escapeHtml(original)})</span>` : ""}</b>
        ${reason}
      </div>
      ${ICONS[iconKey]}
    </div>`;
}

function section(title, items, kind) {
  if (!items || !items.length) return "";
  const iconKey = kind === "non-jain" ? "nonjain" : kind;
  return `
    <div class="section-title">${ICONS[iconKey]}<h3>${escapeHtml(title)}</h3></div>
    ${items.map(i => ingredientCard(i, kind)).join("")}`;
}

function legacyDisplayResult(data) {
  result.style.display = "block";

  if (data.error) {
    showScanError(data.note || data.summary?.message || "We couldn't read the ingredient list. Try a clearer, tighter photo.");
    return;
  }

  const allergens = data.allergen_ingredients || [];
  const nonJain = data.non_jain_ingredients || [];
  const uncertain = data.uncertain_ingredients || [];
  const jain = data.jain_ingredients || [];
  const status = data.summary?.status || (allergens.length ? "ALLERGEN" : nonJain.length ? "NON_JAIN" : uncertain.length ? "UNCERTAIN" : "JAIN");

  let vClass = "v-jain", vIcon = "jain", vTitle = "Jain-friendly";
  if (status === "ALLERGEN") { vClass = "v-allergen"; vIcon = "allergen"; vTitle = "Contains your allergens"; }
  else if (status === "NON_JAIN") { vClass = "v-nonjain"; vIcon = "nonjain"; vTitle = "Not Jain"; }
  else if (status === "UNCERTAIN") { vClass = "v-uncertain"; vIcon = "uncertain"; vTitle = "Needs a closer look"; }

  const lang = data.source_language;
  const langNote = lang && String(lang).toLowerCase() !== "english"
    ? `<div class="lang-note">Label detected in <b>${escapeHtml(lang)}</b> — ingredient names are shown in English with the original in brackets.</div>`
    : "";

  const p = data.product;
  const productHead = p
    ? `<div class="product-head">
        ${p.image ? `<img class="product-img" src="${escapeHtml(p.image)}" alt="" loading="lazy">` : ""}
        ${p.brand ? `<span class="product-brand">${escapeHtml(p.brand)}</span>` : ""}
        <b class="product-name">${escapeHtml(p.name || "Product")}</b>
        <span class="verified">${p.fromCache ? "Saved · " : ""}Ingredients from Open Food Facts${p.verifiedAt ? ` · ${escapeHtml(fmtDate(p.verifiedAt))}` : ""}</span>
      </div>`
    : "";

  result.innerHTML = `
    ${productHead}
    <div class="result-verdict ${vClass}">
      ${bigIcon(vIcon)}
      <div>
        <h2>${vTitle}</h2>
        <p>${escapeHtml(data.summary?.message || "")}</p>
      </div>
    </div>
    ${langNote}
    ${section("Allergen Ingredients", allergens, "allergen")}
    ${section("Non-Jain Ingredients", nonJain, "non-jain")}
    ${section("Uncertain Ingredients", uncertain, "uncertain")}
    ${section("Jain Ingredients", jain, "jain")}
    <p class="result-disclaimer">Double-check the actual label — scans can be wrong, especially for allergies.</p>
  `;

  addHistory(data);
}

function statusIcon(status) {
  return status === "SAFE" ? ICONS.jain : status === "AVOID" ? ICONS.nonjain : ICONS.uncertain;
}
function ingredientRowIcon(status) {
  const path = status === "SAFE" ? '<path d="m5 12 4 4 10-11"/>'
    : status === "AVOID" ? '<path d="M6 6l12 12M18 6 6 18"/>'
    : '<path d="M12 4 21 20H3L12 4Z"/><path d="M12 9v5M12 17h.01"/>';
  return `<svg class="result-icon row-status-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

function renderProductHeader(product) {
  if (!product.productName && !product.brand && !product.image) return "";
  return `<div class="product-head">
    ${safeImageUrl(product.image) ? `<img class="product-img" src="${safeImageUrl(product.image)}" alt="" loading="lazy">` : ""}
    ${product.brand ? `<span class="product-brand">${escapeHtml(product.brand)}</span>` : ""}
    <b class="product-name">${escapeHtml(product.productName || "Product")}</b>
  </div>`;
}

function renderVerdictCard(scan) {
  const verdict = scan.evaluation.verdict;
  const copy = verdict === "SAFE"
    ? ["Yes, this matches your profile", "No conflicts were found in the available ingredient information."]
    : verdict === "AVOID"
      ? ["No, avoid this product", scan.evaluation.summaryReasons?.[0]?.label || "This conflicts with your profile."]
      : ["Eat with caution", scan.evaluation.summaryReasons?.[0]?.label || "Some ingredient information needs confirmation."];
  return `<div class="result-verdict v-${verdict.toLowerCase()}">${statusIcon(verdict)}
    <div><span class="eyebrow">Can you eat this?</span><h2>${escapeHtml(copy[0])}</h2><p>${escapeHtml(copy[1])}</p></div>
  </div>`;
}

function renderSummaryReasons(evaluation) {
  const reasons = (evaluation.summaryReasons || []).slice(0, 5);
  if (!reasons.length) return "";
  return `<section class="report-block"><h3>Why</h3><ul class="reason-list">${
    reasons.map((reason) => `<li>${escapeHtml(reason.label)}</li>`).join("")
  }</ul></section>`;
}

function renderIngredientRow(item, status) {
  const reason = item.reasons?.[0]?.label || "";
  const children = item.subingredientResults || [];
  return `<details class="ingredient-row status-${status.toLowerCase()}" ${children.length ? "" : "data-no-children"}>
    <summary>${ingredientRowIcon(status)}<span><b>${escapeHtml(item.displayName || item.rawName || "Ingredient")}</b>
      ${reason ? `<small>${escapeHtml(reason)}</small>` : ""}</span><span class="expand-label" aria-hidden="true">&rsaquo;</span></summary>
    ${children.length ? `<div class="subingredient-list">${children.map((child) =>
      `<div class="status-${child.status.toLowerCase()}">${ingredientRowIcon(child.status)}<span><b>${escapeHtml(child.displayName)}</b>${child.reasons?.[0]?.label ? `<small>${escapeHtml(child.reasons[0].label)}</small>` : ""}</span></div>`
    ).join("")}</div>` : ""}
  </details>`;
}

function renderIngredientSection(title, items, status) {
  if (!items?.length) return "";
  return `<section class="report-block ingredient-section" data-status="${status}">
    <h3>${escapeHtml(title)}</h3>${items.map((item) => renderIngredientRow(item, status)).join("")}
  </section>`;
}

function renderScanWarnings(warnings) {
  if (!warnings?.length) return "";
  return `<section class="scan-warnings" aria-label="Scan warnings">${warnings.map((item) =>
    `<p><b>Needs attention:</b> ${escapeHtml(item.message || item.code || item)}</p>`
  ).join("")}</section>`;
}

function renderEvidenceSummary(scan) {
  const product = scan.product;
  const label = product.sourceMetadata?.fromCache
    ? "Checked using cached information"
    : product.sourceType === "label_photo"
    ? (product.rawText.translated ? "Checked using translated label text" : "Checked using the product label")
    : "Checked using Open Food Facts";
  return `<section class="evidence-summary"><p>${escapeHtml(label)}</p>
    <button type="button" class="text-btn report-evidence">Why this result?</button>
    <div class="evidence-details" hidden>
      <p><b>Evidence:</b> ${escapeHtml(product.sourceType === "label_photo" ? "Current physical label" : "Community product database")}</p>
      ${product.rawText.translated ? `<details><summary>Translated text</summary><p>${escapeHtml(product.rawText.translated)}</p></details>` : ""}
      <details><summary>Original text</summary><p>${escapeHtml(product.rawText.original)}</p></details>
      ${product.rawText.edited ? `<p><b>Ingredient text edited by you</b></p>` : ""}
      ${product.sourceMetadata?.fromCache && product.sourceMetadata?.sourceUpdatedAt
        ? `<p><b>Saved:</b> ${escapeHtml(fmtDate(product.sourceMetadata.sourceUpdatedAt))}</p>` : ""}
      <p>Engine ${escapeHtml(scan.evaluation.engineVersion)} · Ingredient knowledge ${escapeHtml(scan.evaluation.ingredientKnowledgeVersion)}</p>
    </div>
  </section>`;
}

function renderReportActions(scan) {
  return `<div class="report-actions">
    <button type="button" class="ghost-btn review-ingredients">Review Ingredients</button>
    <button type="button" class="ghost-btn ask-roots">Ask ROOTS</button>
  </div>`;
}

function displayInsufficient(message, action) {
  result.style.display = "block";
  result.innerHTML = `<div class="insufficient-data">${ICONS.uncertain}<h2>We need the ingredient list to check this product.</h2>
    <p>${escapeHtml(message || "No ingredients were found.")}</p>
    <button type="button" class="primary-btn insufficient-primary">${escapeHtml(action || "Scan Label")}</button>
    <button type="button" class="ghost-btn review-ingredients">Enter Ingredients Manually</button></div>`;
  result.querySelector(".insufficient-primary")?.addEventListener("click", () => openLabelImagePicker(false));
  result.querySelector(".review-ingredients")?.addEventListener("click", openIngredientReview);
}

function displayResult(scan, opts) {
  if (opts?.save) {
    window.ROOTS_METRICS?.track?.("scan_completed", { decision: scan?.decision?.status || scan?.evaluation?.verdict || "unknown", source: scan?.product?.sourceType || "unknown" });
    window.ROOTS_LAUNCH?.mark?.("first_scan");
    if (scan?.decision?.status === "VERIFY") window.ROOTS_METRICS?.track?.("verify_result", { source: scan?.product?.sourceType || "unknown" });
  }
  result.style.display = "block";
  if (!scan || scan.state === window.ROOTS_SCAN_PIPELINE.INSUFFICIENT_DATA || !scan.evaluation) {
    displayInsufficient(scan?.warnings?.[0]?.message, "Scan Label");
    return;
  }
  if (window.ROOTS_REPORT) {
    let historyRecord = null;
    if (opts?.save) historyRecord = addHistory(scan);
    window.ROOTS_REPORT.open(scan, {
      root: result,
      historyRecordId: opts?.historyRecordId || historyRecord?.id || "",
      onClose: () => showView("scanView"),
      onScanAgain: () => startFreshScan(),
      onReview: openIngredientReview,
      onScanCurrentLabel: startLabelCamera,
      onAsk: (context, ingredient) => {
        window.ROOTS_REPORT_AI_CONTEXT = context;
        showView("askRootsView", { recordHistory: true, restoreHomeScroll: false });
        const input = document.getElementById("chatInput");
        if (input) {
          input.value = ingredient
            ? `Why was ${ingredient.displayName || ingredient.rawName} flagged for my profile?`
            : "Please explain this ROOTS result and what I should verify.";
          input.focus();
        }
      },
      onRecheck: opts?.onRecheck,
    });
    if (!opts?.enriched && scan.product?.sourceType === "label_photo" && window.ROOTS_CONNECTIVITY?.get?.().online === true) {
      window.ROOTS_ONLINE_ENRICHMENT?.enrich?.(scan).then((enrichment) => {
        if (enrichment?.changed && window.ROOTS_REPORT?.getState?.()) {
          displayResult(enrichment.scan, { save: false, historyRecordId: historyRecord?.id || opts?.historyRecordId || "", enriched: true });
        }
      }).catch(() => {});
    }
    return;
  }
  const e = scan.evaluation;
  result.innerHTML = `${renderProductHeader(scan.product)}${renderVerdictCard(scan)}
    ${renderScanWarnings(scan.warnings)}${renderSummaryReasons(e)}
    ${renderIngredientSection("Ingredients to Avoid", e.avoidItems, "AVOID")}
    ${renderIngredientSection("Eat with Caution", e.cautionItems, "CAUTION")}
    ${renderIngredientSection("Safe Ingredients", e.safeItems, "SAFE")}
    ${renderIngredientSection("Personal Preferences", e.preferenceItems, "PREFERENCE")}
    ${renderEvidenceSummary(scan)}${renderReportActions(scan)}
    <p class="result-disclaimer">Always check the current package label, especially for allergies.</p>`;
  result.querySelector(".report-evidence")?.addEventListener("click", (event) => {
    const details = result.querySelector(".evidence-details");
    details.hidden = !details.hidden;
    event.currentTarget.textContent = details.hidden ? "Why this result?" : "Hide details";
  });
  result.querySelector(".review-ingredients")?.addEventListener("click", openIngredientReview);
  result.querySelector(".ask-roots")?.addEventListener("click", () => {
    const first = e.avoidItems?.[0] || e.cautionItems?.[0];
    showView("askRootsView", { recordHistory: true, restoreHomeScroll: false });
    const input = document.getElementById("chatInput");
    if (input) {
      input.value = first
        ? `Why was ${first.displayName} marked ${first.status === "AVOID" ? "Avoid" : "Eat with caution"} for my profile?`
        : "Why did ROOTS give this result?";
      input.focus();
    }
  });
  if (opts?.save) addHistory(scan);
}
window.ROOTS_OPEN_SCAN_RESULT = (scan) => displayResult(scan, { save: false });

/* ---------- History ---------- */
const HIST_ICON_PENCIL = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`;
const HIST_ICON_TRASH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>`;

function getHistory() {
  try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(h) ? h : []; } catch { return []; }
}
// Downscale + re-encode the scanned photo before persisting it — keeps localStorage usage
// sane across HISTORY_LIMIT entries (a raw capture can be several MB; this caps it to a few
// hundred KB at most while still being plenty sharp for a history thumbnail/preview).
function compressImageForHistory(srcDataUrl, maxEdge) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => reject(new Error("couldn't process image"));
    img.src = srcDataUrl;
  });
}
// Save, falling back to dropping stored photos (oldest first) if localStorage quota is hit —
// the scan data itself is far more important to keep than the thumbnails.
function saveHistorySafely(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); return; } catch (_) { /* over quota, degrade below */ }
  try {
    const keepFirstPhoto = h.map((item, i) => (i === 0 ? item : { ...item, photo: undefined }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(keepFirstPhoto));
    return;
  } catch (_) { /* still over quota */ }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.map(item => ({ ...item, photo: undefined }))));
  } catch (_) { /* give up silently — better than crashing the scan flow */ }
}
async function legacyAddHistory(data) {
  if (!data || data.error) return;
  const entry = {
    savedAt: new Date().toISOString(),
    status: data.summary?.status || "UNCERTAIN",
    message: data.summary?.message || "Scan complete",
    count: data.summary?.scanned_ingredient_count || 0,
    profileLabel: data.summary?.profile_label || data.diet_profile?.label || "Jain",
    name: (data.product && data.product.name) || "", // barcode scans carry the OFF product name
    brand: (data.product && data.product.brand) || "",
    image: (data.product && data.product.image) || "", // remote OFF product image URL
    allergen: data.allergen_ingredients || [],
    nonJain: data.non_jain_ingredients || [],
    uncertain: data.uncertain_ingredients || [],
    jain: data.jain_ingredients || [],
  };
  if (preview && !preview.classList.contains("is-hidden") && preview.src) {
    try { entry.photo = await compressImageForHistory(preview.src, 700); } catch (_) { /* skip photo, keep the rest */ }
  }
  const h = getHistory();
  h.unshift(entry);
  saveHistorySafely(h.slice(0, HISTORY_LIMIT));
}

function addHistory(scan) {
  if (!scan?.evaluation) return;
  const entry = window.ROOTS_SCAN_PIPELINE.makeHistoryRecord(scan);
  const h = getHistory();
  h.unshift(entry);
  saveHistorySafely(h.slice(0, HISTORY_LIMIT));
  window.dispatchEvent(new CustomEvent("roots:historychange"));
  if (window.ROOTS_CONNECTIVITY?.get?.().online !== true) {
    try { window.ROOTS_SYNC_QUEUE?.enqueue?.("scan_history", { recordId: entry.id, createdAt: entry.createdAt || entry.scannedAt || new Date().toISOString() }, { id: `sync-history-${entry.id}` }); } catch (_) { /* history remains stored locally */ }
  }
  return entry;
}

let savedProductQuery = "";
let savedProductFilter = "";
function renderSavedProducts() {
  if (!savedProductsList || !window.ROOTS_REPORT_ACTIONS) return;
  const allSaved = window.ROOTS_REPORT_ACTIONS.getSavedProducts();
  const query = savedProductQuery.toLowerCase();
  const saved = allSaved.filter((item) => {
    const matchesQuery = !query || `${item.product?.name || ""} ${item.product?.brand || ""}`.toLowerCase().includes(query);
    const matchesFilter = !savedProductFilter ||
      (savedProductFilter === "favorite" ? window.ROOTS_PERSONALIZATION?.isFavorite?.("products", item.id) : item.verdict === savedProductFilter);
    return matchesQuery && matchesFilter;
  });
  if (!saved.length) {
    savedProductsList.innerHTML = allSaved.length
      ? '<div class="empty-state"><h4>No matching products</h4><p>Clear the search or change the filter.</p></div>'
      : '<div class="empty-state"><h4>No saved products yet</h4><p>Save a product from a scan report to find it here.</p><button type="button" class="primary-btn" data-empty-view="scanView">Scan a Product</button></div>';
    return;
  }
  savedProductsList.innerHTML = saved.map((item) => {
    const image = window.ROOTS_REPORT_ACTIONS.safeImageUrl(item.product?.image);
    return `<article class="saved-product-card" data-saved-id="${escapeHtml(item.id)}">
      ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
      <div><span class="history-badge ${(item.verdict || "CAUTION").toLowerCase()}">${escapeHtml(item.verdict === "CAUTION" ? "Caution" : item.verdict)}</span>
      <h4>${escapeHtml(item.product?.name || "Scanned Product")}</h4>
      ${item.product?.brand ? `<p>${escapeHtml(item.product.brand)}</p>` : ""}
      <small>${escapeHtml(item.mainReasons?.[0] || "Saved ROOTS report")} · ${escapeHtml(item.profile?.name || "My Profile")} · ${escapeHtml(fmtDate(item.lastCheckedAt))}</small></div>
      <div><button type="button" class="ghost-btn saved-open">Open</button><button type="button" class="text-btn saved-favorite" aria-pressed="${window.ROOTS_PERSONALIZATION?.isFavorite?.("products", item.id) ? "true" : "false"}">${window.ROOTS_PERSONALIZATION?.isFavorite?.("products", item.id) ? "Unfavorite" : "Favorite"}</button><button type="button" class="text-btn saved-remove">Remove</button></div>
    </article>`;
  }).join("");
}
function fmtDate(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function statusDisplay(status) {
  if (status === "ALLERGEN") return { label: "Allergen", cls: "allergen", icon: "allergen", title: "Contains your allergens" };
  if (status === "NON_JAIN") return { label: "Not Jain", cls: "non-jain", icon: "nonjain", title: "Not Jain" };
  if (status === "UNCERTAIN") return { label: "Needs review", cls: "uncertain", icon: "uncertain", title: "Needs a closer look" };
  return { label: "Jain-friendly", cls: "jain", icon: "jain", title: "Jain-friendly" };
}
function legacyRenderHistory() {
  const h = getHistory();
  if (!h.length) { historyList.innerHTML = '<div class="empty-state"><h4>No scans yet</h4><p>Your recent product checks will appear here.</p><button type="button" class="primary-btn" data-empty-view="scanView">Scan a Product</button></div>'; return; }
  historyList.innerHTML = h.map(item => {
    const s = statusDisplay(item.status);
    const title = item.name || "Scan";
    // Full recreation of the scan-result page (see displayResult) so expanding a history
    // card shows the same photo / product info / verdict / ingredient breakdown you saw
    // at scan time — same section()/bigIcon() helpers, same CSS classes.
    const productHead = item.name
      ? `<div class="product-head">
           ${item.image ? `<img class="product-img" src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ""}
           ${item.brand ? `<span class="product-brand">${escapeHtml(item.brand)}</span>` : ""}
           <b class="product-name">${escapeHtml(item.name)}</b>
         </div>`
      : "";
    return `
      <div class="history-card" data-id="${escapeHtml(item.savedAt)}">
        <div class="history-swipe-delete">${HIST_ICON_TRASH}<span>Delete</span></div>
        <div class="history-item">
          <div class="history-summary" role="button" tabindex="0" aria-expanded="false">
            <span class="history-head">
              <span class="history-badge ${s.cls}">${s.label}</span>
              ${item.brand ? `<span class="history-brand">${escapeHtml(item.brand)}</span>` : ""}
              <span class="history-title">${escapeHtml(title)}</span>
            </span>
          </div>
          <div class="history-actions-row">
            <span class="history-buttons">
              <button type="button" class="hist-btn hist-rename">${HIST_ICON_PENCIL}<span>Rename</span></button>
              <button type="button" class="hist-btn hist-delete">${HIST_ICON_TRASH}<span>Delete</span></button>
            </span>
            <span class="history-meta">${escapeHtml(fmtDate(item.savedAt))}<br>${item.count} ingredients</span>
          </div>
          <div class="history-expand">
            <div class="history-expand-inner">
              <div class="history-expand-content">
                ${safeImageUrl(item.photo) ? `<img class="history-photo" src="${safeImageUrl(item.photo)}" alt="">` : ""}
                ${productHead}
                <div class="result-verdict v-${s.cls === "non-jain" ? "nonjain" : s.cls}">
                  ${bigIcon(s.icon)}
                  <div><h2>${s.title}</h2><p>${escapeHtml(item.message || "")}</p></div>
                </div>
                ${section("Allergen Ingredients", item.allergen, "allergen")}
                ${section("Non-Jain Ingredients", item.nonJain, "non-jain")}
                ${section("Uncertain Ingredients", item.uncertain, "uncertain")}
                ${section("Jain Ingredients", item.jain, "jain")}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
  historyList.querySelectorAll(".history-card").forEach(attachHistorySwipe);
}

function historyReportHtml(item) {
  if (item.schemaVersion !== window.ROOTS_SCAN_PIPELINE.HISTORY_SCHEMA_VERSION || !item.evaluation) {
    const summary = window.ROOTS_SCAN_PIPELINE.historySummary(item);
    return `<div class="legacy-history-note">Created with an earlier ROOTS rules version.</div>
      <div class="result-verdict v-${summary.verdict.toLowerCase()}">${statusIcon(summary.verdict)}
      <div><h2>${escapeHtml(summary.verdict === "SAFE" ? "Safe" : summary.verdict === "AVOID" ? "Avoid" : "Eat with caution")}</h2>
      <p>${escapeHtml(summary.reason)}</p></div></div>`;
  }
  const scan = { state: item.state, product: item.parsedProduct, profile: item.profile.snapshot, evaluation: item.evaluation, warnings: item.warnings || [] };
  return `${renderVerdictCard(scan)}${renderSummaryReasons(scan.evaluation)}
    ${renderIngredientSection("Ingredients to Avoid", scan.evaluation.avoidItems, "AVOID")}
    ${renderIngredientSection("Eat with Caution", scan.evaluation.cautionItems, "CAUTION")}
    ${renderIngredientSection("Safe Ingredients", scan.evaluation.safeItems, "SAFE")}
    ${renderIngredientSection("Personal Preferences", scan.evaluation.preferenceItems, "PREFERENCE")}
    ${renderEvidenceSummary(scan)}
    <button type="button" class="ghost-btn history-recheck">Check with Current Profile</button>
    <div class="history-recheck-result" aria-live="polite"></div>`;
}

function renderHistory() {
  const h = getHistory();
  if (!h.length) {
    historyList.innerHTML = `<p class="empty-state">Your recent scan results will appear here.</p>`;
    return;
  }
  historyList.innerHTML = h.map((item, index) => {
    const summary = window.ROOTS_SCAN_PIPELINE.historySummary(item);
    const product = item.schemaVersion === 3 ? item.product || {} : { name: item.name, brand: item.brand };
    return `<article class="history-card phase2c-history" data-index="${index}" data-id="${escapeHtml(item.id || item.savedAt || "")}">
      <button type="button" class="history-summary" aria-expanded="false">
        <span class="history-badge ${summary.verdict.toLowerCase()}">${escapeHtml(summary.verdict === "CAUTION" ? "Caution" : summary.verdict.charAt(0) + summary.verdict.slice(1).toLowerCase())}</span>
        <span class="history-head"><b class="history-title">${escapeHtml(product.name || "Scan")}</b>
        ${product.brand ? `<span class="history-brand">${escapeHtml(product.brand)}</span>` : ""}
        <span class="history-reason">${escapeHtml(summary.reason)}</span>
        <span class="history-meta">Checked for ${escapeHtml(summary.profileName)} · ${escapeHtml(fmtDate(summary.date))}</span></span>
      </button>
      <div class="history-expand" hidden>${historyReportHtml(item)}</div>
    </article>`;
  }).join("");
}

function renameHistoryEntry(id) {
  const h = getHistory();
  const item = h.find(x => x.savedAt === id);
  if (!item) return;
  const v = window.prompt("Name this scan:", item.name || "");
  if (v == null) return;
  item.name = normalizeName(v);
  saveHistorySafely(h);
  renderHistory();
}
function deleteHistoryEntry(id, cardEl) {
  const finish = () => {
    const h = getHistory();
    const index = h.findIndex(x => x.savedAt === id);
    if (index === -1) return;
    const [removed] = h.splice(index, 1);
    saveHistorySafely(h);
    renderHistory();
    showUndoToast(removed, index);
  };
  if (!cardEl) { finish(); return; }
  const itemEl = cardEl.querySelector(".history-item");
  cardEl.style.overflow = "hidden";
  itemEl.style.transition = "transform 0.22s ease, opacity 0.22s ease";
  itemEl.style.transform = "translateX(-100%)";
  itemEl.style.opacity = "0";
  itemEl.addEventListener("transitionend", finish, { once: true });
}

/* ----- Undo (5s window after any delete) ----- */
const undoToast = document.getElementById("undo-toast");
const undoCountEl = document.getElementById("undo-count");
let pendingDelete = null; // { entry, index, timerId, intervalId }

function clearPendingDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timerId);
  clearInterval(pendingDelete.intervalId);
  pendingDelete = null;
}
function hideUndoToast() {
  if (undoToast) undoToast.classList.remove("show");
}
function showUndoToast(entry, index) {
  clearPendingDelete(); // only one undo window at a time — a new delete replaces it
  if (!undoToast) return;
  let secondsLeft = 5;
  undoCountEl.textContent = String(secondsLeft);
  undoToast.classList.add("show");
  const intervalId = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) undoCountEl.textContent = String(secondsLeft);
  }, 1000);
  const timerId = setTimeout(() => {
    clearInterval(intervalId);
    hideUndoToast();
    pendingDelete = null;
  }, 5000);
  pendingDelete = { entry, index, timerId, intervalId };
}
function undoDelete() {
  if (!pendingDelete) return;
  const { entry, index } = pendingDelete;
  clearPendingDelete();
  hideUndoToast();
  const h = getHistory();
  h.splice(Math.min(index, h.length), 0, entry);
  saveHistorySafely(h);
  renderHistory();
}
const undoBtn = document.getElementById("undo-btn");
if (undoBtn) undoBtn.addEventListener("click", undoDelete);

// Swipe-left-to-delete, via Pointer Events (covers touch + mouse). Only engages once the
// gesture is clearly more horizontal than vertical, so normal list scrolling is untouched.
function attachHistorySwipe(cardEl) {
  const itemEl = cardEl.querySelector(".history-item");
  const SWIPE_THRESHOLD = -90;
  let startX = 0, startY = 0, dx = 0, tracking = false, dragging = false, pointerId = null;

  itemEl.addEventListener("pointerdown", e => {
    if (e.target.closest(".hist-icon-btn")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    tracking = true; dragging = false; dx = 0;
    startX = e.clientX; startY = e.clientY; pointerId = e.pointerId;
  });
  itemEl.addEventListener("pointermove", e => {
    if (!tracking) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(curDx) < 10 && Math.abs(curDy) < 10) return;
      if (Math.abs(curDy) > Math.abs(curDx)) { tracking = false; return; } // vertical scroll — bail
      dragging = true;
      itemEl.style.transition = "none";
      try { itemEl.setPointerCapture(pointerId); } catch (_) {}
    }
    dx = Math.min(0, curDx);
    itemEl.style.transform = `translateX(${dx}px)`;
  });
  const endDrag = () => {
    if (dragging) {
      itemEl.style.transition = "transform 0.2s ease";
      if (dx < SWIPE_THRESHOLD) deleteHistoryEntry(cardEl.dataset.id, cardEl);
      else itemEl.style.transform = "translateX(0)";
    }
    tracking = false; dragging = false; dx = 0;
  };
  itemEl.addEventListener("pointerup", endDrag);
  itemEl.addEventListener("pointercancel", endDrag);
}

clearHistoryBtn?.addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); window.dispatchEvent(new CustomEvent("roots:historychange")); });
historyList?.addEventListener("click", e => {
  const phase2cCard = e.target.closest(".phase2c-history");
  if (phase2cCard) {
    const item = getHistory()[Number(phase2cCard.dataset.index)];
    if (e.target.closest(".history-summary") && item?.schemaVersion === window.ROOTS_SCAN_PIPELINE.HISTORY_SCHEMA_VERSION && item.evaluation) {
      const scan = {
        state: item.state,
        product: item.parsedProduct,
        profile: item.profile?.snapshot,
        evaluation: item.evaluation,
        warnings: item.warnings || [],
      };
      window.ROOTS_SCAN_PIPELINE.setCurrent(scan);
      displayResult(scan, {
        save: false,
        historyRecordId: item.id,
        onRecheck: () => window.ROOTS_SCAN_PIPELINE.recheck(item, getDietProfile()),
      });
      return;
    }
    const expanded = phase2cCard.querySelector(".history-expand");
    if (e.target.closest(".history-recheck")) {
      const item = getHistory()[Number(phase2cCard.dataset.index)];
      const rechecked = window.ROOTS_SCAN_PIPELINE.recheck(item, getDietProfile());
      const target = phase2cCard.querySelector(".history-recheck-result");
      if (!rechecked) target.textContent = "This earlier scan does not contain enough structured data to recheck.";
      else {
        const reason = rechecked.evaluation?.summaryReasons?.[0]?.label || "";
        target.textContent = `Current profile: ${rechecked.verdict}. ${reason}`;
      }
      return;
    }
    if (e.target.closest(".report-evidence")) {
      const details = phase2cCard.querySelector(".evidence-details");
      details.hidden = !details.hidden;
      return;
    }
    if (e.target.closest(".history-summary")) {
      expanded.hidden = !expanded.hidden;
      e.target.closest(".history-summary").setAttribute("aria-expanded", String(!expanded.hidden));
    }
    return;
  }
  const renameBtn = e.target.closest(".hist-rename");
  const deleteBtn = e.target.closest(".hist-delete");
  const summary = e.target.closest(".history-summary");
  const card = e.target.closest(".history-card");
  if (!card) return;
  if (renameBtn) { renameHistoryEntry(card.dataset.id); return; }
  if (deleteBtn) { deleteHistoryEntry(card.dataset.id, card); return; }
  if (summary) {
    const item = card.querySelector(".history-item");
    const expanded = item.classList.toggle("expanded");
    summary.setAttribute("aria-expanded", String(expanded));
  }
});

savedProductsList?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-saved-id]");
  if (!card) return;
  const record = window.ROOTS_REPORT_ACTIONS.getSavedProducts().find((item) => item.id === card.dataset.savedId);
  if (!record) return;
  if (event.target.closest(".saved-remove")) {
    window.ROOTS_PERSONALIZATION?.unfavorite?.("products", record.id);
    window.ROOTS_REPORT_ACTIONS.removeSavedProduct(record.id);
    renderSavedProducts();
    return;
  }
  if (event.target.closest(".saved-favorite")) {
    window.ROOTS_PERSONALIZATION?.toggle?.("products", {
      id: record.id, name: record.product?.name, detail: record.product?.brand,
      image: record.product?.image, metadata: {
        verdict: record.verdict,
        groceryStore: window.ROOTS_PERSONALIZATION?.getState?.().preferences.groceryStore || "",
      },
    });
    renderSavedProducts();
    return;
  }
  if (event.target.closest(".saved-open") && record.report?.evaluation) {
    window.ROOTS_SCAN_PIPELINE.setCurrent(record.report);
    displayResult(record.report, { save: false, historyRecordId: record.historyRecordId });
  }
});
window.addEventListener("roots:savedproductschange", renderSavedProducts);
window.addEventListener("roots:personalizationchange", renderSavedProducts);
document.getElementById("saved-product-search")?.addEventListener("input", (event) => { savedProductQuery = event.target.value.trim(); renderSavedProducts(); });
document.getElementById("saved-product-filter")?.addEventListener("change", (event) => { savedProductFilter = event.target.value; renderSavedProducts(); });
window.addEventListener("roots:openproduct", (event) => {
  const id = event.detail?.id;
  const saved = window.ROOTS_REPORT_ACTIONS?.getSavedProducts?.().find((item) => item.id === id);
  if (saved?.report?.evaluation) {
    showView("scanView");
    window.ROOTS_SCAN_PIPELINE.setCurrent(saved.report);
    displayResult(saved.report, { save: false, historyRecordId: saved.historyRecordId });
    return;
  }
  const record = getHistory().find((item) => item.id === id || item.scannedAt === id || item.savedAt === id);
  if (record?.evaluation) {
    showView("scanView");
    const scan = { state: record.state, product: record.parsedProduct, profile: record.profile?.snapshot, evaluation: record.evaluation, warnings: record.warnings || [] };
    window.ROOTS_SCAN_PIPELINE.setCurrent(scan);
    displayResult(scan, { save: false, historyRecordId: record.id });
  }
});
savedProductsList?.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement) event.target.hidden = true;
}, true);

/* ---------- Modals ---------- */
const modalReturnFocus = new WeakMap();
function openModal(m) {
  if (!m) return;
  modalReturnFocus.set(m, document.activeElement);
  if (m === profileModal) {
    document.body.classList.add("full-page-modal-open");
    document.querySelector(".app-main")?.setAttribute("inert", "");
    document.querySelector(".bottom-dock")?.setAttribute("inert", "");
  }
  m.removeAttribute("inert");
  m.style.display = "flex";
  m.setAttribute("aria-hidden", "false");
  const first = m.querySelector("button, input, textarea, [tabindex]");
  if (first) first.focus();
}
function closeModal(m) {
  if (!m) return;
  const returnFocus = modalReturnFocus.get(m);
  // Move focus before hiding the focused control's ancestor. Otherwise the
  // browser correctly refuses aria-hidden and leaves an inaccessible modal in
  // the accessibility tree.
  if (m.contains(document.activeElement)) {
    if (returnFocus && returnFocus.isConnected && !m.contains(returnFocus) && typeof returnFocus.focus === "function") {
      returnFocus.focus();
    } else {
      document.activeElement?.blur?.();
    }
  }
  m.setAttribute("inert", "");
  m.style.display = "none";
  m.setAttribute("aria-hidden", "true");
  if (m === profileModal) {
    document.body.classList.remove("full-page-modal-open");
    document.querySelector(".app-main")?.removeAttribute("inert");
    document.querySelector(".bottom-dock")?.removeAttribute("inert");
  }
  modalReturnFocus.delete(m);
}

const ingredientReviewModal = document.getElementById("ingredientReviewModal");
const ingredientReviewText = document.getElementById("ingredientReviewText");
function openIngredientReview() {
  const scan = window.ROOTS_SCAN_PIPELINE.getCurrent();
  const evidence = scan?.product?.ingredientText || scan?.product?.rawText;
  ingredientReviewText.value = evidence?.edited || evidence?.translated || evidence?.original || "";
  openModal(ingredientReviewModal);
}
function closeIngredientReview() {
  closeModal(ingredientReviewModal);
}
document.getElementById("closeIngredientReview")?.addEventListener("click", closeIngredientReview);
document.getElementById("cancelIngredientReview")?.addEventListener("click", closeIngredientReview);
document.getElementById("restoreIngredientText")?.addEventListener("click", () => {
  const scan = window.ROOTS_SCAN_PIPELINE.getCurrent();
  ingredientReviewText.value = scan?.product?.ingredientText?.original || scan?.product?.rawText?.original || "";
});
document.getElementById("saveIngredientReview")?.addEventListener("click", () => {
  const text = ingredientReviewText.value.trim();
  const current = window.ROOTS_SCAN_PIPELINE.getCurrent();
  const scan = current
    ? window.ROOTS_SCAN_PIPELINE.editCurrentIngredientText(text)
    : text
      ? window.ROOTS_SCAN_PIPELINE.evaluateSource({ sourceType: "manual_label", rawIngredientText: text, originalText: text }, getDietProfile())
      : null;
  closeIngredientReview();
  if (scan) displayResult(scan, { save: false });
  else displayInsufficient("Enter the ingredient list to continue.", "Scan Label");
});

document.getElementById("settings-btn").addEventListener("click", openProfile);
const betaMetricsConsent=document.getElementById("beta-metrics-consent"),betaMetricsStatus=document.getElementById("beta-metrics-status");
if(betaMetricsConsent){betaMetricsConsent.checked=window.ROOTS_METRICS?.consent?.()===true;betaMetricsConsent.addEventListener("change",()=>{const enabled=window.ROOTS_METRICS?.setConsent?.(betaMetricsConsent.checked);if(betaMetricsStatus)betaMetricsStatus.textContent=enabled?"Anonymous beta metrics are enabled on this device.":"Beta metrics are off and local metrics were cleared.";});}
document.getElementById("clear-beta-metrics")?.addEventListener("click",()=>{window.ROOTS_METRICS?.clear?.();if(betaMetricsStatus)betaMetricsStatus.textContent="Local beta metrics cleared.";});
document.getElementById("active-profile-summary")?.addEventListener("click", openProfile);
document.getElementById("scan-entry-btn")?.addEventListener("click", () => startFreshScan());
document.getElementById("scan-entry-close")?.addEventListener("click", () => closeModal(scanEntryModal));
document.getElementById("scan-barcode-photo-btn")?.addEventListener("click", () => {
  closeModal(scanEntryModal);
  if (barcodeInput) { barcodeInput.value = ""; barcodeInput.click(); }
});
document.getElementById("camera-mode-barcode")?.addEventListener("click", () => {
  window.ROOTS_CAMERA?.stop?.();
  labelCameraScreen.hidden = true;
  document.body.classList.remove("capture-active");
  startBarcodeScanner();
});
document.querySelectorAll("[data-open-travel-mode]").forEach(button => button.addEventListener("click", () => showView("travelView", { recordHistory: true, restoreHomeScroll: false })));
document.querySelectorAll("[data-home-tool]").forEach(button => button.addEventListener("click", () => {
  const tool = button.dataset.homeTool;
  const routes = { ask: "askRootsView", recipe: "recipeView", meals: "mealsView", travel: "travelView", history: "savedView" };
  showView(routes[tool], { recordHistory: true, restoreHomeScroll: false });
}));
document.querySelectorAll("[data-tool-route]").forEach((button) => button.addEventListener("click", () => {
  showView(button.dataset.toolRoute, { recordHistory: true, restoreHomeScroll: false });
}));
document.querySelectorAll("[data-tool-back]").forEach((button) => button.addEventListener("click", () => {
  if (history.state?.rootsView === button.closest(".view")?.id) history.back();
  else showView("scanView", { restoreHomeScroll: true });
}));
document.getElementById("closeProfile").addEventListener("click", () => closeModal(profileModal));
document.getElementById("save-profile").addEventListener("click", () => closeModal(profileModal));
document.getElementById("info-btn").addEventListener("click", () => openModal(infoModal));
document.getElementById("closeModal").addEventListener("click", () => closeModal(infoModal));
document.getElementById("modalOk").addEventListener("click", () => closeModal(infoModal));
document.getElementById("settings-help").addEventListener("click", () => {
  closeModal(profileModal);
  openModal(infoModal);
});
[profileModal, infoModal, ingredientReviewModal, labelSourceModal, scanEntryModal].forEach(m => m.addEventListener("click", e => { if (e.target === m) closeModal(m); }));
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  [profileModal, infoModal, ingredientReviewModal, labelSourceModal, scanEntryModal].forEach(m => { if (m.style.display === "flex") closeModal(m); });
});

/* ---------- Init ---------- */
if (window.APP_THEME) window.APP_THEME.apply();
renderHistory();
if (window.ROOTS_HOME_ANIMATION) window.ROOTS_HOME_ANIMATION.init();
if (window.ROOTS_IMAGE_REVIEW) window.ROOTS_IMAGE_REVIEW.init();
if (window.ROOTS_SCAN_PROCESSING) window.ROOTS_SCAN_PROCESSING.init();
window.ROOTS_PERFORMANCE?.mark?.("home_interactive");
const homeInteractiveMeasure = window.ROOTS_PERFORMANCE?.measure?.("app_to_home_interactive", "app_script_start", "home_interactive");
if (homeInteractiveMeasure) document.documentElement.dataset.homeInteractiveMs = homeInteractiveMeasure.durationMs.toFixed(2);
