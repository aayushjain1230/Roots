(function (root) {
  "use strict";

  const VERSION = 1;
  const SOURCE_TIERS = Object.freeze({
    physical_label: "A",
    certification: "A",
    manufacturer: "A",
    restaurant_official: "A",
    trusted_dataset: "B",
    structured_provider: "B",
    community_consensus: "C",
    community_report: "D",
    inference: "E",
  });
  const LEVELS = new Set(["confirmed", "likely", "needs_confirmation", "unknown"]);
  const DIRECTIONS = new Set(["direct", "inferred"]);
  const clean = (value, limit = 2000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const iso = (value) => {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };
  const stableId = (prefix, value) => {
    let hash = 2166136261;
    const text = clean(value, 10000);
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `${prefix}-${(hash >>> 0).toString(36)}`;
  };
  function source(input) {
    const value = input && typeof input === "object" ? input : {};
    const type = SOURCE_TIERS[value.type] ? value.type : "inference";
    return Object.freeze({
      id: clean(value.id, 180) || stableId("source", `${type}:${value.provider || "roots"}:${value.url || ""}`),
      type,
      tier: SOURCE_TIERS[type],
      provider: clean(value.provider || "roots", 120),
      title: clean(value.title || type.replaceAll("_", " "), 240),
      url: /^https:\/\//i.test(clean(value.url, 2000)) ? clean(value.url, 2000) : "",
      retrievedAt: iso(value.retrievedAt) || new Date().toISOString(),
      observedAt: iso(value.observedAt || value.sourceUpdatedAt),
      official: value.official === true || SOURCE_TIERS[type] === "A",
    });
  }
  function productScope(input) {
    const value = input && typeof input === "object" ? input : {};
    return Object.freeze({
      barcode: clean(value.barcode || value.code, 32),
      productName: clean(value.productName || value.name, 300),
      brand: clean(value.brand, 200),
      region: clean(value.region || "US", 16),
      formulationId: clean(value.formulationId, 180),
      packageVersion: clean(value.packageVersion, 120),
    });
  }
  function claim(input) {
    const value = input && typeof input === "object" ? input : {};
    const claimSource = source(value.source);
    const subject = clean(value.subject, 300);
    const predicate = clean(value.predicate, 120);
    const object = clean(value.object, 4000);
    if (!subject || !predicate) throw new TypeError("Evidence claims require a subject and predicate.");
    const direction = DIRECTIONS.has(value.direction) ? value.direction : "direct";
    const level = LEVELS.has(value.level) ? value.level : direction === "direct" ? "confirmed" : "needs_confirmation";
    return Object.freeze({
      schemaVersion: VERSION,
      id: clean(value.id, 180) || stableId("claim", `${subject}:${predicate}:${object}:${claimSource.id}`),
      subject,
      predicate,
      object,
      direction,
      level,
      source: claimSource,
      observedAt: iso(value.observedAt) || claimSource.observedAt || claimSource.retrievedAt,
      productScope: productScope(value.productScope),
      supersedes: clean(value.supersedes, 180),
      metadata: value.metadata && typeof value.metadata === "object" ? JSON.parse(JSON.stringify(value.metadata)) : {},
    });
  }
  function freshness(item, options) {
    const observed = Date.parse(item?.observedAt || item?.source?.observedAt || item?.source?.retrievedAt || "");
    const now = Number(options?.now) || Date.now();
    const maxAgeDays = Math.max(1, Number(options?.maxAgeDays) || (item?.source?.tier === "A" ? 90 : 30));
    if (!Number.isFinite(observed)) return { state: "unknown", ageDays: null, maxAgeDays };
    const ageDays = Math.max(0, Math.floor((now - observed) / 86400000));
    return { state: ageDays <= maxAgeDays ? "current" : "stale", ageDays, maxAgeDays };
  }
  function sameProduct(a, b) {
    const left = a?.productScope || {}, right = b?.productScope || {};
    if (left.barcode && right.barcode && left.barcode !== right.barcode) return false;
    if (left.formulationId && right.formulationId && left.formulationId !== right.formulationId) return false;
    if (left.region && right.region && left.region !== right.region) return false;
    return !!(left.barcode || left.productName) && !!(right.barcode || right.productName);
  }
  function conflicts(claims) {
    const items = Array.isArray(claims) ? claims : [];
    const groups = new Map();
    items.forEach((item) => {
      const key = `${item.subject}\u0000${item.predicate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()].flatMap((group) => group.flatMap((left, index) => group.slice(index + 1)
      .filter((right) => sameProduct(left, right) && left.object && right.object && left.object !== right.object)
      .map((right) => ({
        id: stableId("conflict", `${left.id}:${right.id}`),
        claimIds: [left.id, right.id],
        subject: left.subject,
        predicate: left.predicate,
        preferredClaimId: [left, right].sort((a, b) => a.source.tier.localeCompare(b.source.tier) || Date.parse(b.observedAt) - Date.parse(a.observedAt))[0].id,
        unresolved: left.source.tier === right.source.tier,
      }))));
  }
  function bundle(input) {
    const value = input && typeof input === "object" ? input : {};
    const claims = (Array.isArray(value.claims) ? value.claims : []).map((item) => item?.schemaVersion === VERSION ? item : claim(item));
    return Object.freeze({
      schemaVersion: VERSION,
      id: clean(value.id, 180) || stableId("evidence", claims.map((item) => item.id).join(":")),
      subjectType: clean(value.subjectType || "product", 40),
      productScope: productScope(value.productScope),
      claims: Object.freeze(claims),
      conflicts: Object.freeze(conflicts(claims)),
      createdAt: iso(value.createdAt) || new Date().toISOString(),
    });
  }

  root.ROOTS_EVIDENCE = Object.freeze({
    VERSION, SOURCE_TIERS, source, claim, bundle, conflicts, freshness, productScope, sameProduct, stableId,
  });
})(typeof window !== "undefined" ? window : globalThis);
