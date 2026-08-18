(function (root) {
  "use strict";
  const VERSION = 1;
  const today = "2026-08-16";
  const sources = Object.freeze([
    { id: "jain-practice-observance-v1", title: "ROOTS Jain practice synthesis", sourceType: "curated_internal", tradition: "general", section: "Dietary practice and observance rules", organization: "ROOTS", language: "en", retrievalDate: today, version: 1, reliability: "practice_synthesis", notes: "Structured from commonly documented Jain dietary practice; not a scripture quotation or scholar review." },
    { id: "jain-additive-source-v1", title: "ROOTS additive source-risk model", sourceType: "curated_internal", tradition: "general", section: "Modern source-dependent ingredients", organization: "ROOTS", language: "en", retrievalDate: today, version: 1, reliability: "ingredient_source_model", notes: "Models source-dependent food additives for deterministic caution behavior." },
    { id: "jain-calendar-static-v1", title: "ROOTS Jain observance calendar seed", sourceType: "calendar_seed", tradition: "general", section: "Initial 2026 observance records", organization: "ROOTS", language: "en", retrievalDate: today, version: 1, reliability: "calendar_seed", notes: "Dates are seed data and should be updated by release-year calendar maintenance." },
  ]);
  const byId = new Map(sources.map((item) => [item.id, item]));
  root.ROOTS_JAIN_SOURCES = Object.freeze({ VERSION, sources, byId, get: (id) => byId.get(id) || null });
})(typeof window !== "undefined" ? window : globalThis);
