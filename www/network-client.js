(function (root) {
  "use strict";
  const inflight = new Map();
  const DEFAULT_TIMEOUT = 15000;
  const transient = (status) => status === 408 || status === 429 || status >= 500;
  const delay = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => { clearTimeout(timer); reject(signal.reason || new DOMException("Aborted", "AbortError")); }, { once: true });
  });
  function combineSignal(signal, timeoutMs) {
    const controller = new AbortController();
    const forward = () => controller.abort(signal?.reason);
    signal?.addEventListener?.("abort", forward, { once: true });
    const timer = setTimeout(() => controller.abort(Object.assign(new Error("Request timed out."), { code: "NETWORK_TIMEOUT" })), timeoutMs);
    return { signal: controller.signal, cleanup: () => { clearTimeout(timer); signal?.removeEventListener?.("abort", forward); } };
  }
  function normalizeThrown(error, url, options) {
    if (error?.name === "AbortError" && error?.code !== "NETWORK_TIMEOUT") throw error;
    const code = root.ROOTS_ERRORS?.classifyFetchError?.(error) || (error?.code === "NETWORK_TIMEOUT" ? "REQUEST_TIMEOUT" : "API_UNREACHABLE");
    const normalized = root.ROOTS_ERRORS?.create?.(code, null, {
      stage: options?.classification || "request",
      urlOrigin: (() => { try { return new URL(url).origin; } catch (_) { return ""; } })(),
      originalName: String(error?.name || "Error").slice(0, 80),
    }) || Object.assign(new Error(error?.message || "Network request failed."), { code });
    normalized.originalError = error;
    throw normalized;
  }
  async function run(url, options) {
    const retries = Math.max(0, Math.min(2, Number(options.retries) || 0));
    const { timeoutMs, dedupeKey, classification, retries: ignoredRetries, skipDedupe, ...requestOptions } = options;
    let attempt = 0;
    while (true) {
      const linked = combineSignal(options.signal, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT));
      try {
        const response = await fetch(url, { ...requestOptions, signal: linked.signal });
        root.ROOTS_CONNECTIVITY?.noteSuccess?.();
        if (!response.ok && attempt < retries && transient(response.status)) {
          linked.cleanup(); await delay(Math.min(2000, 250 * (2 ** attempt)), options.signal); attempt += 1; continue;
        }
        const text = await response.text();
        let data = null;
        if (text) { try { data = JSON.parse(text); } catch (_) { data = text; } }
        return { ok: response.ok, status: response.status, data, headers: response.headers };
      } catch (error) {
        if (error?.name !== "AbortError") root.ROOTS_CONNECTIVITY?.noteFailure?.();
        normalizeThrown(error, url, options);
      } finally { linked.cleanup(); }
    }
  }
  function request(url, options) {
    options = options || {};
    if (options.skipDedupe === true) return run(url, options);
    const key = String(options.dedupeKey || `${options.method || "GET"}:${url}`).slice(0, 500);
    if (inflight.has(key)) return inflight.get(key);
    const task = root.ROOTS_PERFORMANCE?.startTask?.(`network:${options.classification || "request"}`, { cache: "miss" });
    const promise = run(url, options).finally(() => {
      inflight.delete(key);
      root.ROOTS_PERFORMANCE?.endTask?.(task, { status: "complete" });
    });
    inflight.set(key, promise);
    return promise;
  }
  root.ROOTS_NETWORK = { request, inflightCount: () => inflight.size, clear: () => inflight.clear(), transient, DEFAULT_TIMEOUT };
})(typeof window !== "undefined" ? window : globalThis);