(function (root) {
  "use strict";
  const VERSION = 1;
  const FACTS = [
    { id: "shared_fryer", pattern: /\bshared fryer\b/i, setting: "sharedEquipment", label: "Shared fryer" },
    { id: "shared_grill", pattern: /\bshared grill\b/i, setting: "sharedEquipment", label: "Shared grill" },
    { id: "shared_utensils", pattern: /\bshared utensils?\b/i, setting: "sharedEquipment", label: "Shared utensils" },
    { id: "shared_preparation", pattern: /\bshared (?:prep|preparation) area\b/i, setting: "sharedFacility", label: "Shared preparation area" },
    { id: "dedicated_fryer", pattern: /\bdedicated fryer\b/i, setting: "sharedEquipment", label: "Dedicated fryer" },
    { id: "dedicated_equipment", pattern: /\bdedicated (?:equipment|utensils?|prep(?:aration)? area)\b/i, setting: "sharedEquipment", label: "Dedicated equipment" }
  ];
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  function assess(menu, dish, profile, context) {
    const officialText = [...(menu?.allergenNotes || []), ...(menu?.footnotes || []), ...(dish?.allergenLabels || []), ...(dish?.menuNotes || []), ...(context?.officialCrossContactNotes || [])].map(clean).filter(Boolean).join(" ");
    const facts = FACTS.filter((fact) => fact.pattern.test(officialText)).map((fact) => ({ ...fact, source: "restaurant_official", level: "confirmed", observedAt: menu?.source?.sourceUpdatedAt || menu?.source?.retrievedAt || null }));
    const relevant = facts.filter((fact) => !fact.id.startsWith("dedicated_"));
    const issues = relevant.map((fact) => {
      const preference = profile?.crossContact?.[fact.setting] || profile?.crossContactPreference || "caution";
      return { id: fact.id, text: `${fact.label} is stated by the restaurant.`, effect: preference === "avoid" ? "avoid" : preference === "ignore" ? "informational" : "needs_confirmation", source: fact.source, level: fact.level };
    }).filter((issue) => issue.effect !== "informational");
    const questions = [];
    if (!facts.some((fact) => fact.id.includes("fryer")) && /\b(?:fried|fries|tempura)\b/i.test(`${dish?.nameOriginal || ""} ${dish?.descriptionOriginal || ""}`)) questions.push({ id: "fryer_unknown", question: "Is this prepared in a dedicated fryer?", reason: "Fryer sharing is not stated." });
    if (!officialText && (profile?.allergies || []).length) questions.push({ id: "allergy_procedure_unknown", question: "What cross-contact procedures are used for this dish?", reason: "No official preparation information is available." });
    return Object.freeze({ version: VERSION, facts, issues, unknowns: questions.map((item) => ({ code: item.id, text: item.reason })), questions, sourceUpdatedAt: menu?.source?.sourceUpdatedAt || menu?.source?.retrievedAt || null });
  }

  root.ROOTS_RESTAURANT_CROSS_CONTACT = Object.freeze({ VERSION, assess });
})(typeof window !== "undefined" ? window : globalThis);
