(function (root) {
  "use strict";
  const VERSION = 1;
  const ids = ["hing", "gelatin", "rennet", "enzymes", "shellac", "carmine", "natural_flavors", "emulsifier", "mono_diglycerides", "glycerin", "stearates", "l_cysteine", "vitamin_d3"];
  const custom = {
    hing: { id: "hing", name: "Hing", aliases: ["asafoetida"], what: "A resin-based spice often used as an onion/garlic replacement.", uses: ["spice blends", "Indian cooking"], possibleSources: ["plant resin", "wheat/rice carrier"], sourceMatters: true },
  };
  function entry(id, profile, productSourceStatus) {
    const rec = root.ROOTS_INGREDIENT_KNOWLEDGE?.byId?.get(id) || custom[id] || root.ROOTS_INGREDIENT_KNOWLEDGE?.aliasIndex?.get(String(id).toLowerCase());
    if (!rec && !custom[id]) return null;
    const name = rec.label || rec.name;
    const sourceDependent = !!rec.sourceDependent || (rec.categories || []).includes("source_dependent");
    const effective = root.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile({ profile }) || null;
    return {
      id: rec.id || id, name,
      aliases: rec.aliases || custom[id]?.aliases || [],
      what: custom[id]?.what || `${name} is tracked in ROOTS ingredient knowledge.`,
      commonUses: custom[id]?.uses || (sourceDependent ? ["packaged foods", "restaurant ingredients"] : ["food ingredient"]),
      possibleSources: rec.possibleSources || custom[id]?.possibleSources || [],
      whyItMatters: sourceDependent ? "The source may determine whether it conflicts with your Jain settings." : "ROOTS checks it against your current Jain rules.",
      sourceMatters: sourceDependent,
      whatRootsKnows: rec.categories || [],
      currentSourceStatus: productSourceStatus || (sourceDependent ? "unknown_source" : "not_source_dependent"),
      affectsRules: effective?.effectiveRules?.filter((rule) => (rule.ingredientIds || []).includes(rec.id || id) || (rule.categories || []).some((cat) => (rec.categories || []).includes(cat))).map((rule) => rule.id) || [],
      evidence: (effective?.effectiveRules || []).flatMap((rule) => rule.sourceRefs || []),
    };
  }
  root.ROOTS_JAIN_INGREDIENTS = Object.freeze({ VERSION, ids, getEntry: entry, search: (query, profile) => ids.map((id) => entry(id, profile)).filter(Boolean).filter((item) => JSON.stringify(item).toLowerCase().includes(String(query || "").toLowerCase())) });
})(typeof window !== "undefined" ? window : globalThis);
