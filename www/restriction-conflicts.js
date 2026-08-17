(function (root) {
  "use strict";
  const CONFLICTS = Object.freeze([
    { id: "vegan-pescatarian", a: "vegan", b: "pescatarian", severity: "preference", message: "Vegan is stricter than Pescatarian. ROOTS will evaluate both and show every reason." },
    { id: "milk-allergy-lactose", a: "milk_allergy", b: "lactose_intolerance", severity: "safety", message: "Milk Allergy and Lactose Intolerance are different. Both remain active and are explained separately." },
    { id: "celiac-gluten-sensitivity", a: "celiac_disease", b: "gluten_sensitivity", severity: "medical", message: "Celiac Disease and Gluten Sensitivity use different evidence rules. ROOTS will not merge them." },
    { id: "tree-group-individual", a: "tree_nut_allergy_group", prefix: "_allergy", severity: "safety", message: "The tree-nut group overlaps an individual nut allergy. The individual reason remains visible." },
  ]);
  function detectConflicts(profile) {
    const ids = new Set(root.ROOTS_RESTRICTIONS?.getSelected(profile).map((item) => item.id) || []);
    return CONFLICTS.filter((conflict) => {
      if (!ids.has(conflict.a)) return false;
      if (conflict.b) return ids.has(conflict.b);
      return [...ids].some((id) => id !== conflict.a && id.endsWith(conflict.prefix));
    }).map((item) => ({ ...item, resolution: "preserve_both", requiresReview: true }));
  }
  root.ROOTS_RESTRICTION_CONFLICTS = { detectConflicts, definitions: CONFLICTS };
})(typeof window !== "undefined" ? window : globalThis);
