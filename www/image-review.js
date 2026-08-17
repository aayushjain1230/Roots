(function (root) {
  "use strict";

  const MIN_CROP = 0.12;
  const MAX_ZOOM = 5;
  const DEFAULT_CROP = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
  let session = null;
  let returnFocus = null;
  let gesture = null;
  let resizeObserver = null;
  let resizeFrame = 0;
  let submitting = false;
  let initialized = false;
  let cropButtons = [];
  const pointers = new Map();
  let pinch = null;

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const copyCrop = (crop) => ({ x: crop.x, y: crop.y, width: crop.width, height: crop.height });

  function normalizeCrop(input = DEFAULT_CROP) {
    const width = clamp(input.width, MIN_CROP, 1);
    const height = clamp(input.height, MIN_CROP, 1);
    return {
      x: clamp(input.x, 0, 1 - width),
      y: clamp(input.y, 0, 1 - height),
      width,
      height,
    };
  }

  function moveCrop(crop, dx, dy) {
    return normalizeCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
  }

  function resizeCrop(crop, handle, dx, dy) {
    let { x, y, width, height } = crop;
    if (handle.includes("e")) width += dx;
    if (handle.includes("s")) height += dy;
    if (handle.includes("w")) { x += dx; width -= dx; }
    if (handle.includes("n")) { y += dy; height -= dy; }
    return normalizeCrop({ x, y, width, height });
  }

  function transformCropForRotation(crop, degrees) {
    let next = normalizeCrop(crop);
    const turns = (((Number(degrees) || 0) % 360) + 360) % 360 / 90;
    for (let index = 0; index < turns; index += 1) {
      next = normalizeCrop({
        x: 1 - (next.y + next.height),
        y: next.x,
        width: next.height,
        height: next.width,
      });
    }
    return next;
  }

  function getRenderedImageRect(stageRect, orientedWidth, orientedHeight, zoom = 1, panX = 0, panY = 0) {
    const stageWidth = Math.max(0, Number(stageRect?.width) || 0);
    const stageHeight = Math.max(0, Number(stageRect?.height) || 0);
    const imageWidth = Math.max(0, Number(orientedWidth) || 0);
    const imageHeight = Math.max(0, Number(orientedHeight) || 0);
    if (!stageWidth || !stageHeight || !imageWidth || !imageHeight) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const containScale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
    const baseWidth = imageWidth * containScale;
    const baseHeight = imageHeight * containScale;
    const appliedZoom = clamp(zoom, 1, MAX_ZOOM);
    const width = baseWidth * appliedZoom;
    const height = baseHeight * appliedZoom;
    return {
      left: (stageWidth - width) / 2 + panX * baseWidth,
      top: (stageHeight - height) / 2 + panY * baseHeight,
      width,
      height,
      baseWidth,
      baseHeight,
    };
  }

  function normalizedToRendered(crop, rect) {
    const value = normalizeCrop(crop);
    return {
      left: rect.left + value.x * rect.width,
      top: rect.top + value.y * rect.height,
      width: value.width * rect.width,
      height: value.height * rect.height,
    };
  }

  function renderedToNormalized(crop, rect) {
    if (!rect?.width || !rect?.height) return copyCrop(DEFAULT_CROP);
    return normalizeCrop({
      x: (crop.left - rect.left) / rect.width,
      y: (crop.top - rect.top) / rect.height,
      width: crop.width / rect.width,
      height: crop.height / rect.height,
    });
  }

  function sourceCropPixels(state) {
    const geometry = state.geometry || state;
    const crop = normalizeCrop(geometry.normalizedCrop || state.crop);
    const width = Math.max(1, geometry.orientedWidth || state.originalWidth || 1);
    const height = Math.max(1, geometry.orientedHeight || state.originalHeight || 1);
    return {
      x: Math.max(0, Math.round(crop.x * width)),
      y: Math.max(0, Math.round(crop.y * height)),
      width: Math.max(1, Math.round(crop.width * width)),
      height: Math.max(1, Math.round(crop.height * height)),
    };
  }

  function qualityWarningsForCrop(state) {
    const pixels = sourceCropPixels(state);
    const crop = normalizeCrop(state.geometry?.normalizedCrop || state.crop);
    const warnings = [];
    if (pixels.width < 600 || pixels.height < 300) {
      warnings.push({ code: "image_too_small", message: "The selected area may be too low-resolution to read clearly." });
    }
    if (crop.width < 0.28) {
      warnings.push({ code: "crop_too_narrow", message: "The crop may exclude part of the ingredient list." });
    }
    return warnings;
  }

  function createState(file, sourceType) {
    const normalizedCrop = copyCrop(DEFAULT_CROP);
    return {
      sessionId: `roots-image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sourceType: sourceType || "library",
      originalFile: file,
      originalBlob: file,
      originalObjectUrl: null,
      originalFileName: file?.name || "",
      originalMimeType: file?.type || "",
      originalWidth: 0,
      originalHeight: 0,
      rotation: 0,
      crop: normalizedCrop,
      zoom: 1,
      panX: 0,
      panY: 0,
      geometry: {
        naturalWidth: 0,
        naturalHeight: 0,
        orientedWidth: 0,
        orientedHeight: 0,
        rotation: 0,
        normalizedCrop,
        zoom: 1,
        panX: 0,
        panY: 0,
        renderedRect: { left: 0, top: 0, width: 0, height: 0 },
      },
      processedBlob: null,
      processedFile: null,
      processedMetadata: null,
      status: "selected",
      lastFailure: null,
      autoCropApplied: false,
      edited: false,
      warnings: [],
      options: {},
    };
  }

  function syncAliases(state) {
    state.crop = state.geometry.normalizedCrop;
    state.rotation = state.geometry.rotation;
    state.zoom = state.geometry.zoom;
    state.panX = state.geometry.panX;
    state.panY = state.geometry.panY;
    state.originalWidth = state.geometry.naturalWidth;
    state.originalHeight = state.geometry.naturalHeight;
  }

  function rotateState(state) {
    state.geometry.normalizedCrop = transformCropForRotation(state.geometry.normalizedCrop, 90);
    state.geometry.rotation = (state.geometry.rotation + 90) % 360;
    const swap = state.geometry.rotation === 90 || state.geometry.rotation === 270;
    state.geometry.orientedWidth = swap ? state.geometry.naturalHeight : state.geometry.naturalWidth;
    state.geometry.orientedHeight = swap ? state.geometry.naturalWidth : state.geometry.naturalHeight;
    state.processedBlob = null;
    state.processedFile = null;
    state.processedMetadata = null;
    state.edited = true;
    syncAliases(state);
    return state;
  }

  function revertState(state) {
    state.geometry.rotation = 0;
    state.geometry.orientedWidth = state.geometry.naturalWidth;
    state.geometry.orientedHeight = state.geometry.naturalHeight;
    state.geometry.normalizedCrop = copyCrop(DEFAULT_CROP);
    state.geometry.zoom = 1;
    state.geometry.panX = 0;
    state.geometry.panY = 0;
    state.processedBlob = null;
    state.processedFile = null;
    state.processedMetadata = null;
    state.autoCropApplied = false;
    state.edited = false;
    state.warnings = [];
    syncAliases(state);
    return state;
  }

  function setZoom(state, value) {
    state.geometry.zoom = clamp(value, 1, MAX_ZOOM);
    if (state.geometry.zoom === 1) {
      state.geometry.panX = 0;
      state.geometry.panY = 0;
    }
    syncAliases(state);
    return state.geometry.zoom;
  }

  function setPan(state, x, y) {
    const limit = (state.geometry.zoom - 1) / (2 * state.geometry.zoom);
    state.geometry.panX = clamp(x, -limit, limit);
    state.geometry.panY = clamp(y, -limit, limit);
    syncAliases(state);
    return { x: state.geometry.panX, y: state.geometry.panY };
  }

  function announce(text) {
    const status = $("review-status");
    if (status) status.textContent = text;
  }

  function waitForLayout() {
    return new Promise((resolve) => {
      const schedule = root.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
      schedule(() => schedule(resolve));
    });
  }

  function releaseUrl(state = session) {
    if (!state?.originalObjectUrl) return;
    URL.revokeObjectURL(state.originalObjectUrl);
    root.ROOTS_PERFORMANCE?.trackResource?.("blob_urls", -1);
    state.originalObjectUrl = null;
  }

  function ensureObjectUrl(state = session) {
    if (!state) return "";
    if (!state.originalObjectUrl) {
      state.originalObjectUrl = URL.createObjectURL(state.originalBlob);
      root.ROOTS_PERFORMANCE?.trackResource?.("blob_urls", 1);
    }
    return state.originalObjectUrl;
  }

  function calculateRenderedRect(state = session) {
    const stage = $("review-stage");
    if (!state || !stage) return { left: 0, top: 0, width: 0, height: 0 };
    const stageRect = stage.getBoundingClientRect();
    const rect = getRenderedImageRect(
      stageRect,
      state.geometry.orientedWidth,
      state.geometry.orientedHeight,
      state.geometry.zoom,
      state.geometry.panX,
      state.geometry.panY
    );
    state.geometry.renderedRect = rect;
    return rect;
  }

  function render(state = session) {
    if (!state) return;
    const image = $("review-image");
    const cropBox = $("review-crop-box");
    const rect = calculateRenderedRect(state);
    if (!rect.width || !rect.height) return;
    const rotated = state.geometry.rotation === 90 || state.geometry.rotation === 270;
    const preRotationWidth = rotated ? rect.height : rect.width;
    const preRotationHeight = rotated ? rect.width : rect.height;
    image.style.width = `${preRotationWidth}px`;
    image.style.height = `${preRotationHeight}px`;
    image.style.left = `${rect.left + rect.width / 2}px`;
    image.style.top = `${rect.top + rect.height / 2}px`;
    image.style.transform = `translate(-50%, -50%) rotate(${state.geometry.rotation}deg)`;
    const renderedCrop = normalizedToRendered(state.geometry.normalizedCrop, rect);
    cropBox.style.left = `${renderedCrop.left}px`;
    cropBox.style.top = `${renderedCrop.top}px`;
    cropBox.style.width = `${renderedCrop.width}px`;
    cropBox.style.height = `${renderedCrop.height}px`;
    $("review-zoom").value = String(state.geometry.zoom);
    const warning = $("review-warning");
    const messages = [...state.warnings, ...qualityWarningsForCrop(state)]
      .filter((item, index, list) => list.findIndex((candidate) => candidate.code === item.code) === index)
      .map((item) => item.message);
    warning.textContent = messages.join(" ");
    syncAliases(state);
  }

  async function inspectQuality(image) {
    const warnings = [];
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, 96, 96);
      const data = context.getImageData(0, 0, 96, 96).data;
      let sum = 0;
      let sumSq = 0;
      for (let index = 0; index < data.length; index += 4) {
        const value = (data[index] + data[index + 1] + data[index + 2]) / 3;
        sum += value;
        sumSq += value * value;
      }
      const count = data.length / 4;
      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      if (mean < 42) warnings.push({ code: "image_too_dark", message: "Photo may be too dark." });
      if (mean > 235) warnings.push({ code: "image_overexposed", message: "Glare may be hiding part of the label." });
      if (variance < 180) warnings.push({ code: "low_visual_detail", message: "The text appears blurry. A sharper photo may scan better." });
    } catch (_) {
      // Quality hints never block review.
    }
    return warnings;
  }

  async function decodeElement(image) {
    if (typeof image.decode === "function") {
      try { await image.decode(); } catch (_) { /* onload remains the fallback */ }
    }
    if (image.complete && image.naturalWidth && image.naturalHeight) return;
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
    });
  }

  async function showReview(state = session, restore = false) {
    if (!state?.originalBlob) throw Object.assign(new Error("Image missing"), { code: "IMAGE_MISSING" });
    const screen = $("image-review-screen");
    const image = $("review-image");
    image.src = ensureObjectUrl(state);
    await decodeElement(image);
    if (!image.naturalWidth || !image.naturalHeight) throw Object.assign(new Error("Image decode failed"), { code: "IMAGE_DECODE_FAILED" });
    if (!state.geometry.naturalWidth) {
      state.geometry.naturalWidth = image.naturalWidth;
      state.geometry.naturalHeight = image.naturalHeight;
      state.geometry.orientedWidth = image.naturalWidth;
      state.geometry.orientedHeight = image.naturalHeight;
      state.geometry.normalizedCrop = normalizeCrop(state.geometry.normalizedCrop);
      state.warnings = await inspectQuality(image);
    }
    screen.hidden = false;
    document.body.classList.add("review-active");
    state.status = "reviewing";
    await waitForLayout();
    render(state);
    announce(restore ? "Photo and crop restored." : "Photo ready for review.");
    $("review-title")?.focus();
  }

  async function open(file, options) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      options?.onError?.({ code: "IMAGE_DECODE_FAILED", message: "This image could not be opened." });
      return false;
    }
    dispose(false);
    const title = $("review-title");
    const instruction = document.querySelector(".review-instruction");
    if (title) title.textContent = options?.mode === "menu" ? "Review Menu Page" : "Review Photo";
    if (instruction) instruction.textContent = options?.mode === "menu"
      ? "Adjust the crop so all dish names, descriptions, and prices remain visible."
      : "Adjust the crop so the complete ingredient list stays visible.";
    session = createState(file, options?.sourceType);
    session.options = options || {};
    returnFocus = document.activeElement;
    try {
      await showReview(session, false);
      return true;
    } catch (error) {
      options?.onError?.({ code: error.code || "IMAGE_DECODE_FAILED", message: "This image could not be opened." });
      dispose(false);
      return false;
    }
  }

  function hide() {
    $("image-review-screen")?.setAttribute("hidden", "");
    document.body.classList.remove("review-active");
  }

  async function restore() {
    if (!session?.originalBlob) return false;
    submitting = false;
    $("review-use").disabled = false;
    try {
      await showReview(session, true);
      return true;
    } catch (_) {
      session.options?.onError?.({ code: "IMAGE_DECODE_FAILED", message: "This image could not be restored." });
      return false;
    }
  }

  function dispose(returnFocusAfter = true) {
    gesture = null;
    submitting = false;
    hide();
    const image = $("review-image");
    if (image) {
      image.removeAttribute("src");
      image.removeAttribute("style");
    }
    releaseUrl(session);
    if (session) {
      session.processedBlob = null;
      session.processedFile = null;
      session.originalBlob = null;
      session.originalFile = null;
    }
    session = null;
    if (returnFocusAfter && returnFocus?.focus) returnFocus.focus();
    returnFocus = null;
  }

  function close(returnFocusAfter = true) {
    dispose(returnFocusAfter);
  }

  function invalidateProcessed() {
    if (!session) return;
    session.processedBlob = null;
    session.processedFile = null;
    session.processedMetadata = null;
  }

  function rotate() {
    if (!session) return;
    rotateState(session);
    render();
    announce(`Image rotated to ${session.geometry.rotation} degrees.`);
  }

  function revert() {
    if (!session) return;
    revertState(session);
    render();
    announce("Image reverted to its original state.");
  }

  async function decode(blob) {
    if (root.createImageBitmap) {
      const bitmap = await root.createImageBitmap(blob, { imageOrientation: "from-image" });
      root.ROOTS_PERFORMANCE?.trackResource?.("image_bitmaps", 1);
      return bitmap;
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      root.ROOTS_PERFORMANCE?.trackResource?.("blob_urls", 1);
      const finish = () => {
        URL.revokeObjectURL(url);
        root.ROOTS_PERFORMANCE?.trackResource?.("blob_urls", -1);
      };
      image.onload = () => { finish(); resolve(image); };
      image.onerror = () => { finish(); reject(new Error("decode")); };
      image.src = url;
    });
  }

  async function createWorkingImage(state = session) {
    if (!state?.originalBlob) throw Object.assign(new Error("No review session."), { code: "IMAGE_MISSING" });
    if (state.processedFile && state.processedMetadata) {
      return { file: state.processedFile, blob: state.processedBlob, metadata: state.processedMetadata, reused: true };
    }
    const source = await decode(state.originalBlob);
    const rotatedCanvas = document.createElement("canvas");
    const swap = state.geometry.rotation === 90 || state.geometry.rotation === 270;
    rotatedCanvas.width = swap ? source.height : source.width;
    rotatedCanvas.height = swap ? source.width : source.height;
    const rotatedContext = rotatedCanvas.getContext("2d");
    rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rotatedContext.rotate(state.geometry.rotation * Math.PI / 180);
    rotatedContext.drawImage(source, -source.width / 2, -source.height / 2);
    if (source.close) {
      source.close();
      root.ROOTS_PERFORMANCE?.trackResource?.("image_bitmaps", -1);
    }
    const pixels = sourceCropPixels(state);
    const scale = Math.min(1, 2200 / Math.max(pixels.width, pixels.height));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(pixels.width * scale));
    output.height = Math.max(1, Math.round(pixels.height * scale));
    output.getContext("2d").drawImage(
      rotatedCanvas,
      pixels.x,
      pixels.y,
      pixels.width,
      pixels.height,
      0,
      0,
      output.width,
      output.height
    );
    const blob = await new Promise((resolve) => output.toBlob(resolve, "image/jpeg", 0.92));
    rotatedCanvas.width = 0;
    rotatedCanvas.height = 0;
    output.width = 0;
    output.height = 0;
    if (!blob) throw Object.assign(new Error("working_image_failed"), { code: "PREPROCESSING_FAILED" });
    const metadata = {
      sourceType: state.sourceType,
      crop: copyCrop(state.geometry.normalizedCrop),
      normalizedCrop: copyCrop(state.geometry.normalizedCrop),
      cropApplied: state.geometry.normalizedCrop.width < 1 || state.geometry.normalizedCrop.height < 1,
      rotation: state.geometry.rotation,
      zoom: state.geometry.zoom,
      panX: state.geometry.panX,
      panY: state.geometry.panY,
      originalWidth: state.geometry.naturalWidth,
      originalHeight: state.geometry.naturalHeight,
      orientedWidth: state.geometry.orientedWidth,
      orientedHeight: state.geometry.orientedHeight,
      sourceCropPixels: pixels,
      workingWidth: Math.max(1, Math.round(pixels.width * scale)),
      workingHeight: Math.max(1, Math.round(pixels.height * scale)),
      warnings: [...state.warnings, ...qualityWarningsForCrop(state)].map((item) => item.code),
    };
    const file = new File([blob], `roots-reviewed-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    state.processedBlob = blob;
    state.processedFile = file;
    state.processedMetadata = metadata;
    return { file, blob, metadata, reused: false };
  }

  async function usePhoto() {
    if (!session || submitting) return;
    if (session.geometry.normalizedCrop.width * session.geometry.normalizedCrop.height < 0.08 &&
        !root.confirm("The selected crop is very small. Use it anyway?")) return;
    submitting = true;
    $("review-use").disabled = true;
    announce("Preparing photo.");
    try {
      if (session.options.deferProcessing) {
        hide();
        session.status = "preparing";
        await session.options.onUse?.(null, null, {
          prepare: () => createWorkingImage(session),
          sessionId: session.sessionId,
        });
      } else {
        const output = await createWorkingImage(session);
        const callback = session.options.onUse;
        dispose(false);
        await callback?.(output.file, output.metadata);
      }
    } catch (error) {
      submitting = false;
      $("review-use").disabled = false;
      await restore();
      $("review-warning").textContent = "We could not prepare this image. Adjust the crop or try another photo.";
      session.options?.onError?.({ code: error.code || "PREPROCESSING_FAILED", message: "We could not prepare this image." });
    }
  }

  function requestDiscard(action) {
    if (!session) return;
    if (action === "onCancel" && session.edited &&
        !root.confirm("Your crop and rotation changes will be discarded. Continue?")) return;
    const callback = session.options[action];
    if (action === "onCancel") dispose(false);
    else hide();
    callback?.();
  }

  function updateCrop(next) {
    if (!session) return;
    session.geometry.normalizedCrop = normalizeCrop(next);
    invalidateProcessed();
    session.edited = true;
    syncAliases(session);
    render();
  }

  function adjust(command) {
    if (!session) return;
    const step = 0.04;
    let crop = session.geometry.normalizedCrop;
    if (command === "left") crop = moveCrop(crop, -step, 0);
    if (command === "right") crop = moveCrop(crop, step, 0);
    if (command === "up") crop = moveCrop(crop, 0, -step);
    if (command === "down") crop = moveCrop(crop, 0, step);
    if (command === "expand") crop = resizeCrop(crop, "nw", -step, -step);
    if (command === "shrink") crop = resizeCrop(crop, "nw", step, step);
    if (command === "reset") crop = copyCrop(DEFAULT_CROP);
    updateCrop(crop);
    announce("Crop adjusted.");
  }

  function pointerDown(event) {
    if (!session) return;
    const stage = $("review-stage");
    const stageRect = stage.getBoundingClientRect();
    const handle = event.target.dataset.handle;
    const movingCrop = !!event.target.closest("#review-crop-box");
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      renderedRect: { ...session.geometry.renderedRect },
      crop: copyCrop(session.geometry.normalizedCrop),
      handle,
      movingCrop,
      panX: session.geometry.panX,
      panY: session.geometry.panY,
      stageRect,
    };
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const values = [...pointers.values()];
      pinch = {
        distance: Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y),
        zoom: session.geometry.zoom,
      };
    }
    stage.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!session || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) {
      const values = [...pointers.values()];
      const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      setZoom(session, pinch.zoom * distance / Math.max(1, pinch.distance));
      session.edited = true;
      render();
      return;
    }
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = (event.clientX - gesture.x) / Math.max(1, gesture.renderedRect.width);
    const dy = (event.clientY - gesture.y) / Math.max(1, gesture.renderedRect.height);
    if (gesture.handle) updateCrop(resizeCrop(gesture.crop, gesture.handle, dx, dy));
    else if (gesture.movingCrop) updateCrop(moveCrop(gesture.crop, dx, dy));
    else if (session.geometry.zoom > 1) {
      setPan(
        session,
        gesture.panX + (event.clientX - gesture.x) / Math.max(1, gesture.stageRect.width),
        gesture.panY + (event.clientY - gesture.y) / Math.max(1, gesture.stageRect.height)
      );
      render();
    }
  }

  function pointerUp(event) {
    pointers.delete(event.pointerId);
    gesture = null;
    if (pointers.size < 2) pinch = null;
  }

  function wheel(event) {
    if (!session) return;
    event.preventDefault();
    setZoom(session, session.geometry.zoom + (event.deltaY < 0 ? 0.2 : -0.2));
    session.edited = true;
    render();
  }

  function zoomInput(event) {
    if (!session) return;
    setZoom(session, event.target.value);
    session.edited = true;
    render();
  }

  function cancelReview() { requestDiscard("onCancel"); }
  function retakeReview() { requestDiscard("onRetake"); }
  function replaceReview() { requestDiscard("onReplace"); }
  function cropAdjust(event) { adjust(event.currentTarget.dataset.cropAdjust); }
  function keydown(event) {
    if (event.key === "Escape" && session && !$("image-review-screen").hidden) {
      event.preventDefault();
      requestDiscard("onCancel");
    }
  }

  function scheduleResize() {
    if (!session || $("image-review-screen")?.hidden) return;
    const cancel = root.cancelAnimationFrame || clearTimeout;
    const schedule = root.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    if (resizeFrame) cancel(resizeFrame);
    resizeFrame = schedule(() => {
      resizeFrame = 0;
      render();
    });
  }

  function init() {
    if (initialized) return;
    const stage = $("review-stage");
    if (!stage) return;
    initialized = true;
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerUp);
    stage.addEventListener("pointercancel", pointerUp);
    stage.addEventListener("wheel", wheel, { passive: false });
    $("review-zoom").addEventListener("input", zoomInput);
    $("review-rotate").addEventListener("click", rotate);
    $("review-revert").addEventListener("click", revert);
    $("review-use").addEventListener("click", usePhoto);
    $("review-cancel").addEventListener("click", cancelReview);
    $("review-retake").addEventListener("click", retakeReview);
    $("review-replace").addEventListener("click", replaceReview);
    cropButtons = [...document.querySelectorAll("[data-crop-adjust]")];
    cropButtons.forEach((button) => button.addEventListener("click", cropAdjust));
    document.addEventListener("keydown", keydown);
    if (root.ResizeObserver) {
      resizeObserver = new root.ResizeObserver(scheduleResize);
      resizeObserver.observe(stage);
    } else {
      root.addEventListener("resize", scheduleResize);
    }
  }

  function destroy() {
    dispose(false);
    if (!initialized) return;
    initialized = false;
    const stage = $("review-stage");
    stage?.removeEventListener("pointerdown", pointerDown);
    stage?.removeEventListener("pointermove", pointerMove);
    stage?.removeEventListener("pointerup", pointerUp);
    stage?.removeEventListener("pointercancel", pointerUp);
    stage?.removeEventListener("wheel", wheel);
    $("review-zoom")?.removeEventListener("input", zoomInput);
    $("review-rotate")?.removeEventListener("click", rotate);
    $("review-revert")?.removeEventListener("click", revert);
    $("review-use")?.removeEventListener("click", usePhoto);
    $("review-cancel")?.removeEventListener("click", cancelReview);
    $("review-retake")?.removeEventListener("click", retakeReview);
    $("review-replace")?.removeEventListener("click", replaceReview);
    cropButtons.forEach((button) => button.removeEventListener("click", cropAdjust));
    cropButtons = [];
    document.removeEventListener("keydown", keydown);
    resizeObserver?.disconnect();
    resizeObserver = null;
    root.removeEventListener?.("resize", scheduleResize);
    pointers.clear();
    gesture = null;
    pinch = null;
  }

  root.ROOTS_IMAGE_REVIEW = {
    init,
    open,
    hide,
    restore,
    close,
    dispose,
    rotate,
    revert,
    createWorkingImage,
    invalidateProcessed,
    adjust,
    normalizeCrop,
    moveCrop,
    resizeCrop,
    transformCropForRotation,
    getRenderedImageRect,
    normalizedToRendered,
    renderedToNormalized,
    sourceCropPixels,
    qualityWarningsForCrop,
    createState,
    rotateState,
    revertState,
    setZoom,
    setPan,
    getState: () => session ? {
      ...session,
      originalFile: session.originalFile,
      originalBlob: session.originalBlob,
      crop: copyCrop(session.geometry.normalizedCrop),
      geometry: {
        ...session.geometry,
        normalizedCrop: copyCrop(session.geometry.normalizedCrop),
        renderedRect: { ...session.geometry.renderedRect },
      },
    } : null,
    destroy,
    constants: { MIN_CROP, MAX_ZOOM },
  };
})(typeof window !== "undefined" ? window : globalThis);
