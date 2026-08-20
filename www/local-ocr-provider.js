(function (root) {
  "use strict";

  function available() { return typeof (root.Capacitor?.Plugins?.RootsLocalOcr || root.Capacitor?.Plugins?.ROOTSLocalOcr)?.extractText === "function"; }

  async function extractText(file, options) {
    const native = root.Capacitor?.Plugins?.RootsLocalOcr || root.Capacitor?.Plugins?.ROOTSLocalOcr;
    if (!native || typeof native.extractText !== "function") {
      throw (root.ROOTS_ERRORS?.create?.("OCR_LOCAL_UNAVAILABLE") || Object.assign(new Error("Offline text recognition is unavailable on this device. Enter ingredients manually."), { code: "OCR_LOCAL_UNAVAILABLE" }));
    }
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let payload = file;
    if (file instanceof Blob) {
      payload = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: String(reader.result || ""), mimeType: file.type || "image/jpeg" });
        reader.onerror = () => reject(root.ROOTS_ERRORS?.create?.("IMAGE_DECODE_FAILED") || new Error("Could not read image."));
        reader.readAsDataURL(file);
      });
    }
    const result = await native.extractText(payload);
    const text = String(result?.text || "").trim();
    if (!text) throw (root.ROOTS_ERRORS?.create?.("OCR_EMPTY_TEXT") || Object.assign(new Error("No label text was detected."), { code: "OCR_EMPTY_TEXT" }));
    return {
      text,
      segments: Array.isArray(result?.segments) ? result.segments : [],
      provider: result?.provider || "native_device_ocr",
    };
  }

  root.ROOTS_LOCAL_OCR_PROVIDER = root.ROOTS_LOCAL_OCR_PROVIDER || Object.freeze({ available, extractText });
})(typeof window !== "undefined" ? window : globalThis);