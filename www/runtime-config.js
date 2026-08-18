/* Public deployment settings only. Never place provider credentials in this file.
   Production hosting should inject <meta name="roots-api-base" content="https://api-host">. */
(function (root) {
  "use strict";
  const host = root.location?.hostname || "";
  const local = host === "127.0.0.1" || host === "localhost";
  const injected = root.document?.querySelector?.('meta[name="roots-api-base"]')?.content?.trim() || "";
  const apiBase = injected || (local ? "http://127.0.0.1:8000" : "");
  root.ROOTS_RUNTIME_CONFIG = Object.freeze({ API_BASE_URL: apiBase.replace(/\/$/, "") });
})(typeof window !== "undefined" ? window : globalThis);
