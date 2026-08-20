/* Public deployment settings only. Never place provider credentials in this file.
   Production/native builds must inject <meta name="roots-api-base" content="https://your-roots-api">. */
(function (root) {
  "use strict";
  const location = root.location || {};
  const host = location.hostname || "";
  const protocol = location.protocol || "";
  const injected = root.document?.querySelector?.('meta[name="roots-api-base"]')?.content?.trim() || "";
  const normalized = (value) => String(value || "").replace(/\/+$/, "");
  const localHttpWeb = protocol === "http:" && (host === "127.0.0.1" || host === "localhost");
  const capacitorRuntime = protocol === "capacitor:" || protocol === "ionic:" || root.Capacitor?.isNativePlatform?.() === true;
  const apiBase = normalized(injected || (!capacitorRuntime && localHttpWeb ? "http://127.0.0.1:8000" : ""));
  const valid = !apiBase || /^https:\/\//i.test(apiBase) || (localHttpWeb && /^http:\/\/(127\.0\.0\.1|localhost):8000$/i.test(apiBase));
  const code = valid && apiBase ? "OK" : apiBase ? "API_INVALID_ORIGIN" : "API_NOT_CONFIGURED";
  root.ROOTS_RUNTIME_CONFIG = Object.freeze({
    API_BASE_URL: valid ? apiBase : "",
    API_CONFIG_CODE: code,
    IS_LOCAL_WEB: localHttpWeb,
    IS_CAPACITOR: capacitorRuntime,
  });
})(typeof window !== "undefined" ? window : globalThis);