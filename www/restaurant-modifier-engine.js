(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  function modifierText(dish) {
    return [...(dish?.modifiers || []), ...(dish?.options || [])]
      .map((item) => clean(item?.textOriginal || item?.nameOriginal || item?.text || item))
      .filter(Boolean);
  }
  function supportedActions(dish, conflicts) {
    const menuModifiers = modifierText(dish), actions = [], unresolved = [];
    (conflicts || []).forEach((conflict) => {
      const ingredient = clean(conflict.displayName || conflict.normalizedName);
      const term = normalized(ingredient);
      const supporting = menuModifiers.find((line) => {
        const value = normalized(line);
        return value.includes(term) && /\b(no|without|remove|omit|hold|skip|substitute|replace|choice of|choose)\b/.test(value);
      });
      if (supporting) {
        const replacement = /\b(substitute|replace|choice of|choose)\b/i.test(supporting);
        actions.push({
          id: `modify-${conflict.matchedIngredientId || term.replace(/\s+/g, "-")}`,
          ingredient, action: replacement ? "select_supported_option" : "remove",
          instruction: replacement ? `Use the listed option: ${supporting}.` : `Request ${supporting}.`,
          supportingMenuText: supporting, evidenceLevel: "confirmed",
          removesConflictIds: (conflict.reasons || []).map((reason) => reason.id),
        });
      } else unresolved.push(conflict);
    });
    return { actions, unresolved };
  }
  function canResolveAll(conflicts, result) {
    return !!conflicts?.length && result.actions.length === conflicts.length && result.unresolved.length === 0;
  }
  root.ROOTS_RESTAURANT_MODIFIERS = { modifierText, supportedActions, canResolveAll };
})(typeof window !== "undefined" ? window : globalThis);
