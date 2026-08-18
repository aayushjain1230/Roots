(function (root) {
  "use strict";
  const VERSION = 1;
  function searchKnowledge(query, context) {
    const q = String(query || "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
    if (!q) return [];
    const records = root.ROOTS_JAIN_KNOWLEDGE?.records || [];
    return records.map((record) => {
      const haystack = [record.topic, record.summary, record.explanation, ...(record.concepts || []), ...(record.foodImplications || [])].join(" ").toLowerCase();
      return { record, score: haystack.includes(q) ? 2 : q.split(/\s+/).map((term) => term.endsWith("ies") ? `${term.slice(0, -3)}y` : term.endsWith("oes") ? term.slice(0, -2) : term.replace(/s$/, "")).filter((term) => term && haystack.includes(term)).length };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, context?.limit || 5).map((item) => item.record);
  }
  root.ROOTS_JAIN_SEARCH = Object.freeze({ VERSION, searchKnowledge });
})(typeof window !== "undefined" ? window : globalThis);
