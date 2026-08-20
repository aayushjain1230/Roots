(function (root) {
  "use strict";
  const KEY = "roots-install-id-v1";
  const VALID = /^[A-Za-z0-9_-]{16,64}$/;
  function randomId() {
    const bytes = new Uint8Array(24);
    root.crypto?.getRandomValues?.(bytes);
    if (!bytes.some(Boolean)) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function get() {
    try {
      const existing = String(root.localStorage?.getItem(KEY) || "");
      if (VALID.test(existing)) return existing;
      const next = randomId();
      root.localStorage?.setItem(KEY, next);
      return next;
    } catch (_) {
      return randomId();
    }
  }
  root.ROOTS_INSTALL_ID = Object.freeze({ get, constants: { KEY } });
})(typeof window !== "undefined" ? window : globalThis);