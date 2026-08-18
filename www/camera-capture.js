(function (root) {
  "use strict";
  let stream = null;
  let permissionRequested = false;
  let torchOn = false;
  let state = "IDLE";

  function capabilities() {
    const supported = !!root.navigator?.mediaDevices?.getUserMedia;
    const track = stream?.getVideoTracks?.()[0];
    const trackCaps = track?.getCapabilities?.() || {};
    return { camera: supported, torch: !!trackCaps.torch, settings: !!root.Capacitor?.Plugins?.App };
  }
  function stop() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      root.ROOTS_PERFORMANCE?.trackResource?.("camera_streams", -1);
    }
    stream = null;
    torchOn = false;
    state = "IDLE";
  }
  function permissionError(error, previouslyRequested = false) {
    const name = error?.name || "";
    if (name === "InsecureContextError") {
      return { code: "insecure_context", message: "Camera access requires a secure connection.", canOpenSettings: false };
    }
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        code: previouslyRequested ? "permission_denied_permanently" : "permission_denied",
        message: "Camera access is turned off.",
        canOpenSettings: !!root.Capacitor?.Plugins?.App?.openUrl,
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { code: "no_camera", message: "No camera was found on this device.", canOpenSettings: false };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return { code: "camera_busy", message: "The camera is being used by another app.", canOpenSettings: false };
    }
    if (name === "AbortError") {
      return { code: "camera_init_failed", message: "The camera did not start. Try again.", canOpenSettings: false };
    }
    return { code: "camera_unavailable", message: "Camera unavailable. Choose a photo instead.", canOpenSettings: false };
  }

  function waitForVideoReady(video, timeoutMs = 5000) {
    if (video.videoWidth && video.videoHeight) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = root.setTimeout(() => { cleanup(); reject(Object.assign(new Error("Camera preview timed out."), { name: "AbortError" })); }, timeoutMs);
      function check() { if (video.videoWidth && video.videoHeight) { cleanup(); resolve(); } }
      function cleanup() {
        root.clearTimeout(timer);
        video.removeEventListener?.("loadedmetadata", check);
        video.removeEventListener?.("playing", check);
      }
      video.addEventListener?.("loadedmetadata", check);
      video.addEventListener?.("playing", check);
      check();
    });
  }

  async function requestStream() {
    if (root.isSecureContext === false) throw permissionError({ name: "InsecureContextError" });
    if (!root.navigator?.mediaDevices?.getUserMedia) throw permissionError({ name: "Unsupported" });
    const previouslyRequested = permissionRequested;
    permissionRequested = true;
    const attempts = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false },
      { video: true, audio: false },
    ];
    let lastError;
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        return await root.navigator.mediaDevices.getUserMedia(attempts[index]);
      } catch (error) {
        lastError = error;
        if (["NotAllowedError", "SecurityError", "NotReadableError", "TrackStartError"].includes(error?.name)) break;
      }
    }
    throw permissionError(lastError, previouslyRequested);
  }
  async function start(video) {
    stop();
    state = "REQUESTING_PERMISSION";
    const task = root.ROOTS_PERFORMANCE?.startTask?.("camera_ready", { source: "label" });
    try {
      stream = await requestStream();
      root.ROOTS_PERFORMANCE?.trackResource?.("camera_streams", 1);
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();
      await waitForVideoReady(video);
      state = "CAMERA_READY";
      root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "ready" });
      return capabilities();
    } catch (error) {
      root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "failed" });
      stop();
      state = "ERROR";
      throw error?.code ? error : permissionError(error, permissionRequested);
    }
  }
  async function setTorch(enabled) {
    const track = stream?.getVideoTracks?.()[0];
    if (!track?.getCapabilities?.().torch) return false;
    await track.applyConstraints({ advanced: [{ torch: !!enabled }] });
    torchOn = !!enabled;
    return true;
  }
  function capture(video) {
    if (!stream || !video.videoWidth || !video.videoHeight) {
      return Promise.reject({ code: "capture_failed", message: "We could not take the photo." });
    }
    const canvas = document.createElement("canvas");
    const max = 2600;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) return reject({ code: "capture_failed", message: "We could not take the photo." });
      resolve(new File([blob], `roots-label-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", 0.94));
  }
  async function openSettings() {
    const app = root.Capacitor?.Plugins?.App;
    if (app?.openUrl) return app.openUrl({ url: "app-settings:" });
    return false;
  }
  function onHidden() { if (document.hidden) stop(); }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHidden);

  root.ROOTS_CAMERA = {
    start, stop, capture, setTorch, openSettings, requestStream, getCapabilities: capabilities,
    getSessionState: () => ({ active: !!stream, permissionRequested, torchOn, state }),
    destroy() {
      stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHidden);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
