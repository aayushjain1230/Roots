(function (root) {
  "use strict";
  // ROOTS depends on secure browser origins for manifests, workers, cameras,
  // navigation, and API requests. A double-clicked index.html has an opaque
  // file:// origin and cannot run the application correctly.
  if (root.location?.protocol !== "file:") return;
  const target = `http://127.0.0.1:5500/${root.location.hash || ""}`;
  root.location.replace(target);
})(typeof window !== "undefined" ? window : globalThis);
