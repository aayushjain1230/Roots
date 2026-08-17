(function (root) {
  "use strict";
  let stream = null;
  let permissionRequested = false;
  let torchOn = false;

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
  }
  function permissionError(error, previouslyRequested = false) {
    const name = error?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        code: previouslyRequested ? "permission_denied_permanently" : "permission_denied",
        message: "Camera access is turned off.",
        canOpenSettings: !!root.Capacitor?.Plugins?.App?.openUrl,
      };
    }
    return { code: "camera_unavailable", message: "Camera unavailable.", canOpenSettings: false };
  }
  async function start(video) {
    stop();
    if (!root.navigator?.mediaDevices?.getUserMedia) throw permissionError({ name: "Unsupported" });
    const previouslyRequested = permissionRequested;
    permissionRequested = true;
    try {
      stream = await root.navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      root.ROOTS_PERFORMANCE?.trackResource?.("camera_streams", 1);
      video.srcObject = stream;
      await video.play();
      return capabilities();
    } catch (error) {
      stop();
      throw permissionError(error, previouslyRequested);
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
    start, stop, capture, setTorch, openSettings, getCapabilities: capabilities,
    getSessionState: () => ({ active: !!stream, permissionRequested, torchOn }),
    destroy() {
      stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHidden);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
