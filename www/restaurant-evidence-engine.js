(function (root) {
  "use strict";
  const Dietary = root.ROOTS_DIETARY_ENGINE, Modifiers = root.ROOTS_RESTAURANT_MODIFIERS;
  if (!Dietary || !Modifiers) throw new Error("Dietary and modifier engines must load before restaurant-evidence-engine.js");
  const VERSION = 1;
  const VERDICTS = Object.freeze({ SAFE: "SAFE", SAFE_WITH_MODIFICATION: "SAFE_WITH_MODIFICATION", NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION", AVOID: "AVOID" });
  const LEVELS = Object.freeze({ CONFIRMED: "confirmed", LIKELY: "likely", NEEDS_CONFIRMATION: "needs_confirmation", UNKNOWN: "unknown" });
  const UNCERTAIN_TERMS = /\b(sauce|dressing|broth|stock|seasoning|spices?|flavoring|marinade|gravy|aioli|house mix|special blend|batter)\b/i;
  const CROSS_CONTACT = [
    { pattern: /\bshared fryer\b/i, key: "sharedEquipment", label: "Shared fryer" },
    { pattern: /\bshared (?:grill|equipment|utensils?)\b/i, key: "sharedEquipment", label: "Shared equipment" },
    { pattern: /\bshared (?:prep|preparation) area\b/i, key: "sharedFacility", label: "Shared preparation area" },
    { pattern: /\b(?:made|prepared) in (?:a )?facility\b/i, key: "sharedFacility", label: "Shared facility" },
    { pattern: /\bmay contain\b/i, key: "mayContain", label: "May contain notice" },
  ];
  const CUISINE_CAUTION = [
    { pattern: /\bramen\b/i, unknown: "Broth ingredients and preparation are not stated." },
    { pattern: /\btempura\b/i, unknown: "Batter ingredients and shared-fryer preparation are not stated." },
    { pattern: /\bfried\b/i, unknown: "Fryer sharing and frying ingredients are not stated." },
    { pattern: /\bcurry\b/i, unknown: "Sauce, stock, and seasoning details may be incomplete." },
    { pattern: /\brefried\b/i, unknown: "Cooking fat is not stated." },
    { pattern: /\bbeans?\b/i, unknown: "Cooking stock or fat is not stated." },
  ];
  const clean = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit || 5000);
  const id = (prefix, value) => `${prefix}-${clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function evidence(idValue, source, level, text, extra) {
    return { id: idValue, source, level, text: clean(text, 1000), ...(extra || {}) };
  }
  function extractMenuText(dish) {
    return [dish?.nameOriginal, dish?.nameTranslated, dish?.descriptionOriginal, dish?.descriptionTranslated]
      .map((value) => clean(value, 3000)).filter(Boolean).join(", ");
  }
  function crossContactEvidence(menu, dish, profile) {
    if (root.ROOTS_RESTAURANT_CROSS_CONTACT) {
      return root.ROOTS_RESTAURANT_CROSS_CONTACT.assess(menu, dish, profile).issues.map((item) => evidence(`cross-${item.id}`, "cross_contact", LEVELS.CONFIRMED, item.text, { ruleId: `cross_contact.${item.id}`, effect: item.effect }));
    }
    const sourceText = [...(menu?.allergenNotes || []), ...(menu?.footnotes || []), ...(dish?.allergenLabels || []), ...(dish?.menuNotes || [])].join(" ");
    const results = [];
    CROSS_CONTACT.forEach((rule) => {
      if (!rule.pattern.test(sourceText)) return;
      const action = profile?.crossContact?.[rule.key] || "caution";
      if (action === "ignore") return;
      results.push(evidence(id("cross", rule.label), "cross_contact", LEVELS.CONFIRMED, `${rule.label} is stated by the menu.`, {
        ruleId: `cross_contact.${rule.key}`, effect: action === "avoid" ? "avoid" : "needs_confirmation",
      }));
    });
    return results;
  }
  function evaluateDish(menu, dish, profile, context) {
    if (!dish?.id) throw new TypeError("Dish identity is required.");
    if (!profile || typeof profile !== "object") throw new TypeError("A validated dietary profile is required.");
    profile = root.ROOTS_DIETARY_FEATURES?.projectProfile?.(profile) || profile;
    const text = extractMenuText(dish), description = clean(dish.descriptionOriginal || dish.descriptionTranslated, 5000);
    const explicitIngredientList = clean(context?.ingredientList, 10000);
    const parsed = description ? Dietary.parseIngredientText(description) : { ingredients: [], contains: [], mayContain: [], sharedEquipment: [], sharedFacility: [] };
    const structuredParsed = explicitIngredientList ? Dietary.parseIngredientText(explicitIngredientList) : { ingredients: [] };
    const ingredientResults = [
      ...parsed.ingredients.map((ingredient) => ({ ...Dietary.evaluateIngredient(ingredient, profile), restaurantEvidenceSource: "menu_description" })),
      ...(structuredParsed.ingredients || []).map((ingredient) => ({ ...Dietary.evaluateIngredient(ingredient, profile), restaurantEvidenceSource: "restaurant_ingredient_list" })),
    ];
    const evidenceItems = [], warnings = [], unknowns = [], trace = [], conflicts = [];
    evidenceItems.push(evidence(`menu-${dish.id}`, "menu_description", dish.extraction?.evidenceLevel === "confirmed" || dish.userEdited ? LEVELS.CONFIRMED : LEVELS.LIKELY, description || "No description was provided.", { sourcePageIds: dish.sourcePageIds || [] }));
    ingredientResults.forEach((result, index) => {
      const node = evidence(`ingredient-${dish.id}-${index}`, result.restaurantEvidenceSource || "roots_ingredient_database", result.evidenceLevel || LEVELS.CONFIRMED, result.displayName, {
        matchedIngredientId: result.matchedIngredientId, status: result.status, reasons: clone(result.reasons || []),
      });
      evidenceItems.push(node);
      (result.reasons || []).forEach((reason) => trace.push({ evidenceId: node.id, ruleId: reason.profileRuleId, result: reason.severity, explanation: reason.label }));
      if (result.status === "AVOID") conflicts.push(result);
      if (!result.matchedIngredientId || result.evidenceLevel === "needs_confirmation" || result.status === "CAUTION") {
        unknowns.push({ code: !result.matchedIngredientId ? "unrecognized_menu_term" : "source_dependent_ingredient", text: `${result.displayName} needs confirmation.`, evidenceId: node.id });
      }
    });
    if (!description) unknowns.push({ code: "description_missing", text: "The restaurant does not provide a dish description.", evidenceId: `menu-${dish.id}` });
    if (description && !parsed.ingredients.length) unknowns.push({ code: "ingredients_not_identified", text: "The description does not provide enough ingredient detail.", evidenceId: `menu-${dish.id}` });
    if (!explicitIngredientList && dish.ingredientEvidence?.complete !== true && dish.ingredientsComplete !== true && dish.userEdited !== true) {
      unknowns.push({ code: "ingredient_list_incomplete", text: "A menu description is not a complete ingredient list.", evidenceId: `menu-${dish.id}` });
    }
    if (UNCERTAIN_TERMS.test(text)) {
      const matches = [...new Set((text.match(new RegExp(UNCERTAIN_TERMS.source, "ig")) || []).map((value) => value.toLowerCase()))];
      matches.forEach((term) => unknowns.push({ code: "preparation_component_unknown", text: `${term[0].toUpperCase()}${term.slice(1)} ingredients are not fully stated.`, evidenceId: `menu-${dish.id}` }));
    }
    const labels = [...(dish.dietaryLabels || []), ...(dish.allergenLabels || [])].map((value) => clean(value, 100)).filter(Boolean);
    labels.forEach((label, index) => evidenceItems.push(evidence(`label-${dish.id}-${index}`, "restaurant_label", LEVELS.LIKELY, `${label} is a restaurant-provided label and is not independently verified.`, { label })));
    const cross = crossContactEvidence(menu, dish, profile);
    cross.forEach((item) => {
      evidenceItems.push(item); trace.push({ evidenceId: item.id, ruleId: item.ruleId, result: item.effect, explanation: item.text });
      if (item.effect === "avoid") conflicts.push({ displayName: item.text, normalizedName: item.id, matchedIngredientId: null, reasons: [{ id: item.id, profileRuleId: item.ruleId, severity: "avoid", label: item.text }] });
      else unknowns.push({ code: "cross_contact", text: item.text, evidenceId: item.id });
    });
    const crossAssessment = root.ROOTS_RESTAURANT_CROSS_CONTACT?.assess?.(menu, dish, profile, context);
    (crossAssessment?.unknowns || []).forEach((item) => unknowns.push({ ...item, evidenceId: `cross-${item.code}` }));
    const guideNotes = Array.isArray(context?.allergenGuide) ? context.allergenGuide : context?.allergenGuide ? [context.allergenGuide] : [];
    const advisoryText = [...(dish.allergenLabels || []), ...(menu.allergenNotes || []), ...guideNotes].join("; ");
    if (advisoryText) {
      const advisory = Dietary.evaluateParsedProduct(Dietary.parseIngredientText(advisoryText), profile);
      [...advisory.avoidItems, ...advisory.cautionItems].forEach((result, index) => {
        const evidenceId = `allergen-guide-${dish.id}-${index}`;
        const level = result.status === "AVOID" ? LEVELS.CONFIRMED : LEVELS.NEEDS_CONFIRMATION;
        evidenceItems.push(evidence(evidenceId, "restaurant_allergen_guide", level, result.reasons?.[0]?.label || result.displayName, { status: result.status }));
        trace.push(...(result.reasons || []).map((reason) => ({ evidenceId, ruleId: reason.profileRuleId, result: reason.severity, explanation: reason.label })));
        if (result.status === "AVOID") conflicts.push(result);
        else unknowns.push({ code: "allergen_guide_uncertainty", text: result.reasons?.[0]?.label || `${result.displayName} needs confirmation.`, evidenceId });
      });
    }
    if (context?.nutritionGuide) evidenceItems.push(evidence(`nutrition-${dish.id}`, "restaurant_nutrition_guide", LEVELS.LIKELY, clean(context.nutritionGuide, 1000)));
    CUISINE_CAUTION.forEach((item, index) => {
      if (item.pattern.test(`${context?.cuisine || ""} ${text}`)) {
        const evidenceId = `cuisine-${dish.id}-${index}`;
        evidenceItems.push(evidence(evidenceId, "cuisine_knowledge", LEVELS.NEEDS_CONFIRMATION, item.unknown));
        unknowns.push({ code: "cuisine_preparation_uncertainty", text: item.unknown, evidenceId });
      }
    });
    (dish.extraction?.warnings || []).forEach((warning) => {
      const textValue = clean(warning?.message || warning?.code || warning, 500);
      warnings.push({ code: clean(warning?.code || "extraction_warning", 100), text: textValue });
      unknowns.push({ code: "extraction_warning", text: textValue, evidenceId: `menu-${dish.id}` });
    });
    const modification = Modifiers.supportedActions(dish, conflicts);
    let verdict;
    if (conflicts.length && Modifiers.canResolveAll(conflicts, modification) && unknowns.length === 0) verdict = VERDICTS.SAFE_WITH_MODIFICATION;
    else if (conflicts.length) verdict = VERDICTS.AVOID;
    else if (unknowns.length) verdict = VERDICTS.NEEDS_CONFIRMATION;
    else verdict = VERDICTS.SAFE;
    const summary = verdict === VERDICTS.SAFE ? "No conflicts or unresolved menu evidence were found for this profile."
      : verdict === VERDICTS.SAFE_WITH_MODIFICATION ? `Compatible only with ${modification.actions.map((item) => item.instruction).join(" ")}`
      : verdict === VERDICTS.AVOID ? (conflicts[0]?.reasons?.[0]?.label || "Confirmed menu evidence conflicts with this profile.")
      : unknowns[0]?.text || "More restaurant information is required.";
    const graph = {
      nodes: [
        { id: `dish-${dish.id}`, type: "dish", label: dish.nameOriginal },
        ...evidenceItems.map((item) => ({ id: item.id, type: "evidence", label: item.text, level: item.level })),
        ...trace.map((item, index) => ({ id: `rule-${dish.id}-${index}`, type: "rule", label: item.ruleId })),
        { id: `verdict-${dish.id}`, type: "verdict", label: verdict },
      ],
      edges: [
        ...evidenceItems.map((item) => ({ from: `dish-${dish.id}`, to: item.id, relation: "has_evidence" })),
        ...trace.map((item, index) => ({ from: item.evidenceId, to: `rule-${dish.id}-${index}`, relation: "triggers" })),
        ...trace.map((_, index) => ({ from: `rule-${dish.id}-${index}`, to: `verdict-${dish.id}`, relation: "contributes_to" })),
      ],
    };
    return {
      schemaVersion: 1, engineVersion: VERSION, dishId: dish.id, sectionId: dish.sectionId,
      dishName: dish.nameOriginal, verdict, summary, evidenceLevel: verdict === VERDICTS.SAFE ? LEVELS.CONFIRMED : verdict === VERDICTS.AVOID ? LEVELS.CONFIRMED : LEVELS.NEEDS_CONFIRMATION,
      evidence: evidenceItems, confirmedIngredients: ingredientResults.filter((item) => item.matchedIngredientId && item.evidenceLevel !== "needs_confirmation"),
      possibleIngredients: ingredientResults.filter((item) => !item.matchedIngredientId || item.evidenceLevel === "needs_confirmation"),
      restaurantNotes: [...(dish.menuNotes || []), ...(dish.allergenLabels || []), ...(menu.allergenNotes || [])],
      profileConflicts: conflicts.flatMap((item) => item.reasons || []),
      warnings, suggestedModifications: modification.actions, unknowns, ruleTrace: trace, evidenceGraph: graph,
      effectiveRules: root.ROOTS_EFFECTIVE_RULES?.expand?.(profile) || null,
      crossContact: crossAssessment || null,
      profileSnapshot: { id: profile.id, updatedAt: profile.updatedAt, schemaVersion: profile.schemaVersion },
      sourceSnapshot: clone(menu.source), evaluatedAt: context?.evaluatedAt || new Date().toISOString(),
    };
  }
  root.ROOTS_RESTAURANT_EVIDENCE = { evaluateDish, extractMenuText, crossContactEvidence, constants: { VERSION, VERDICTS, LEVELS } };
})(typeof window !== "undefined" ? window : globalThis);
