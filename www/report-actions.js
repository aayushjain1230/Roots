(function (root) {
  "use strict";
  const STORAGE_KEY = "roots-saved-products-v1";
  const ISSUE_KEY = "roots-report-issues-v1";
  const SCHEMA_VERSION = 1;

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const jainDisplay = (value) => clean(value).replace(/\b(?:Strict|Custom)\s+Jain\b/gi, "Jain");
  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function productId(scan) {
    const product = scan?.product || {};
    return clean(product.barcode) || [
      clean(product.productName || product.name).toLowerCase(),
      clean(product.brand).toLowerCase(),
    ].filter(Boolean).join("::") || `scan-${Date.now()}`;
  }
  function mainReasons(scan) {
    const reasons = scan?.evaluation?.summaryReasons || [];
    return reasons.slice(0, 5).map((item) => jainDisplay(item.label)).filter(Boolean);
  }
  function flagged(scan) {
    const evaluation = scan?.evaluation || {};
    return [...(evaluation.avoidItems || []), ...(evaluation.cautionItems || [])];
  }
  function saveProduct(scan, options) {
    const id = productId(scan);
    const saved = read(STORAGE_KEY);
    const now = new Date().toISOString();
    const product = scan?.product || {};
    const record = {
      schemaVersion: SCHEMA_VERSION,
      id,
      savedAt: saved.find((item) => item.id === id)?.savedAt || now,
      lastCheckedAt: scan?.evaluation?.evaluatedAt || now,
      product: {
        name: clean(product.productName || product.name) || "Scanned Product",
        brand: clean(product.brand),
        barcode: clean(product.barcode),
        image: safeImageUrl(product.image),
        region: clean(product.region) || "US",
      },
      profile: { id: scan?.profile?.id || "default", name: clean(scan?.profile?.name) || "My Profile" },
      verdict: scan?.evaluation?.verdict || scan?.verdict || "CAUTION",
      mainReasons: mainReasons(scan),
      historyRecordId: options?.historyRecordId || "",
      engineVersion: scan?.evaluation?.engineVersion || null,
      // Keep the structured deterministic report available offline. Image payloads are
      // not copied; the product image remains a validated URL.
      report: JSON.parse(JSON.stringify({
        state: scan?.state,
        product: { ...scan?.product, image: safeImageUrl(scan?.product?.image) },
        profile: scan?.profile,
        evaluation: scan?.evaluation,
        effectiveRules: scan?.effectiveRules || null,
        evidence: scan?.evidence || null,
        decision: scan?.decision || null,
        resolution: scan?.resolution || null,
        warnings: scan?.warnings || [],
      })),
    };
    const index = saved.findIndex((item) => item.id === id);
    if (index >= 0) saved[index] = record;
    else saved.unshift(record);
    if (!write(STORAGE_KEY, saved.slice(0, 100))) return null;
    root.ROOTS_METRICS?.track?.("product_saved", { decision: scan?.decision?.status || record.verdict });
    root.ROOTS_LAUNCH?.mark?.("first_save");
    root.dispatchEvent?.(new CustomEvent("roots:savedproductschange"));
    return record;
  }
  function removeSavedProduct(id) {
    const saved = read(STORAGE_KEY);
    const next = saved.filter((item) => item.id !== id);
    if (!write(STORAGE_KEY, next)) return false;
    root.dispatchEvent?.(new CustomEvent("roots:savedproductschange"));
    return next.length !== saved.length;
  }
  function isSaved(scan) { return read(STORAGE_KEY).some((item) => item.id === productId(scan)); }
  function getSavedProducts() { return read(STORAGE_KEY); }

  function safeImageUrl(value) {
    const url = clean(value);
    if (!url) return "";
    if (/^https:\/\//i.test(url) || /^blob:/i.test(url) || /^(?:\.?\/)?(?:icons|images|assets)\//i.test(url)) return url;
    return "";
  }
  function verdictLabel(value) {
    return value === "SAFE" ? "Safe" : value === "AVOID" ? "Avoid" : "Eat with caution";
  }
  function copyIngredientsText(scan) {
    const product = scan?.product || {};
    const evaluation = scan?.evaluation || {};
    const items = [
      ...(evaluation.avoidItems || []),
      ...(evaluation.cautionItems || []),
      ...(evaluation.preferenceItems || []),
      ...(evaluation.safeItems || []),
    ];
    const lines = [
      clean(product.productName || product.name) || "Scanned Product",
      clean(product.brand),
      `Result: ${verdictLabel(evaluation.verdict || scan?.verdict)}`,
      "",
      "Ingredients:",
      ...items.map((item) => clean(item.displayName || item.rawName)).filter(Boolean),
    ];
    const group = (title, values) => {
      if (!values?.length) return;
      lines.push("", `${title}:`, ...values.map((item) =>
        `${clean(item.displayName || item.rawName)} — ${clean(item.reasons?.[0]?.label || item.status)}`
      ));
    };
    group("Avoid", evaluation.avoidItems);
    group("Caution", evaluation.cautionItems);
    return lines.filter((line, index) => line || lines[index - 1] !== "").join("\n").trim();
  }
  function shareText(scan) {
    const product = clean(scan?.product?.productName || scan?.product?.name) || "a scanned product";
    const reasons = mainReasons(scan).slice(0, 3);
    return [
      `ROOTS checked ${product}.`,
      "",
      `Result: ${verdictLabel(scan?.evaluation?.verdict || scan?.verdict)}`,
      reasons.length ? `\nReasons:\n${reasons.map((reason) => `- ${reason}`).join("\n")}` : "",
      "",
      `Checked for: ${clean(scan?.profile?.name) || "My Profile"}`,
    ].filter((line) => line !== "").join("\n");
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.("copy") !== false;
    area.remove();
    return ok;
  }
  async function copyIngredients(scan) {
    await copyText(copyIngredientsText(scan));
    return "Ingredients copied";
  }
  async function shareResult(scan) {
    const text = shareText(scan);
    if (navigator.share) {
      try {
        await navigator.share({ title: "ROOTS result", text });
        return "Result shared";
      } catch (error) {
        if (error?.name === "AbortError") return "";
      }
    }
    await copyText(text);
    return "Result copied";
  }
  function askRootsContext(scan, ingredient) {
    const evaluation = scan?.evaluation || {};
    const selected = ingredient ? `\nSelected ingredient: ${clean(ingredient.displayName || ingredient.rawName)}\nIngredient status: ${clean(ingredient.status)}\nIngredient reasons: ${(ingredient.reasons || []).map((item) => clean(item.label)).join("; ")}` : "";
    return [
      `Product: ${clean(scan?.product?.productName) || "Scanned Product"}`,
      `Deterministic verdict: ${clean(evaluation.verdict)}`,
      `Main reasons: ${mainReasons(scan).join("; ") || "No conflicts found"}`,
      `Flagged ingredients: ${flagged(scan).map((item) => `${clean(item.displayName)} (${clean(item.status)})`).join(", ") || "None"}`,
      `Profile used: ${clean(scan?.profile?.name) || "My Profile"}`,
      root.ROOTS_PROFILE?.getProfileForAI?.(scan?.profile) || "",
      selected,
      "The deterministic ROOTS verdict is authoritative. Do not override it, change Avoid to Safe, or guarantee allergy safety. Separate confirmed evidence from uncertainty.",
    ].filter(Boolean).join("\n");
  }
  function reportIssue(scan, type, note) {
    const issues = read(ISSUE_KEY);
    const issue = {
      schemaVersion: 1, id: `issue-${Date.now()}`, createdAt: new Date().toISOString(),
      type: clean(type) || "other", note: clean(note).slice(0, 500),
      product: clean(scan?.product?.productName) || "Scanned Product",
      verdict: clean(scan?.evaluation?.verdict),
      engineVersion: scan?.evaluation?.engineVersion || null,
    };
    issues.unshift(issue);
    const stored = write(ISSUE_KEY, issues.slice(0, 50)) ? issue : null;
    if (stored) root.ROOTS_METRICS?.track?.("result_corrected", { decision: scan?.decision?.status || issue.verdict, category: issue.type });
    return stored;
  }

  root.ROOTS_REPORT_ACTIONS = {
    STORAGE_KEY, SCHEMA_VERSION, getSavedProducts, saveProduct, removeSavedProduct, isSaved,
    copyIngredients, copyIngredientsText, shareResult, shareText, copyText,
    askRootsContext, reportIssue, safeImageUrl, productId,
  };
})(typeof window !== "undefined" ? window : globalThis);
