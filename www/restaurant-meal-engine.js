(function (root) {
  "use strict";
  const VERSION = 1;
  const VERDICTS = Object.freeze({ BEST_CHOICE: "BEST_CHOICE", COMPATIBLE: "COMPATIBLE", NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION", AVOID: "AVOID" });
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const list = (value) => Array.isArray(value) ? value : [];
  const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sectionKind = (name) => {
    const value = clean(name).toLowerCase();
    if (/\b(desserts?|sweets?|ice cream|bakery)\b/.test(value)) return "desserts";
    if (/\b(drinks?|beverages?|coffee|tea|juices?|smoothies?|cocktails?)\b/.test(value)) return "drinks";
    if (/\b(sides?|starters?|appetizers?|small plates?|extras?)\b/.test(value)) return "sides";
    return "mains";
  };
  function findDish(menu, dishId) {
    for (const section of list(menu?.sections)) {
      const dish = list(section.items).find((item) => item.id === dishId);
      if (dish) return { dish, section };
    }
    return null;
  }
  function reportDish(report, dishId) { return list(report?.dishes).find((item) => item.dishId === dishId) || null; }
  function optionText(option) { return clean(option?.textOriginal || option?.nameOriginal || option?.label || option?.text || option); }
  function supportedOptions(dish, evidence) {
    const records = [], seen = new Set();
    const add = (raw, group, type) => {
      const text = optionText(raw);
      if (!text) return;
      const id = clean(raw?.id) || `${type}-${slug(text)}`;
      if (seen.has(id)) return;
      seen.add(id);
      records.push({ id, label: text, group, type, menuSupported: true, source: "menu", raw });
      list(raw?.choices || raw?.options).forEach((choice) => add(choice, text, type));
    };
    list(dish?.modifiers).forEach((item) => add(item, "Modifications", "modifier"));
    list(dish?.options).forEach((item) => add(item, "Options", "modifier"));
    list(evidence?.suggestedModifications).forEach((item) => {
      const text = clean(item.instruction || item.supportingMenuText);
      if (!text || seen.has(item.id)) return;
      seen.add(item.id);
      records.push({ id: item.id, label: text, group: "Required changes", type: "resolution", menuSupported: true, source: "evidence", resolves: list(item.removesConflictIds), raw: item });
    });
    return records;
  }
  function componentFromDish(menu, report, dishId, role) {
    const found = findDish(menu, dishId), evidence = reportDish(report, dishId);
    if (!found || !evidence) throw new TypeError("A menu-supported dish with cached evidence is required.");
    return {
      id: `${role}-${dishId}`, role, dishId, name: clean(found.dish.nameOriginal),
      sectionName: clean(found.section.nameOriginal), price: found.dish.price || null,
      evidence, options: supportedOptions(found.dish, evidence),
    };
  }
  function availableComponents(menu, report) {
    const result = { mains: [], sides: [], drinks: [], desserts: [] };
    list(menu?.sections).forEach((section) => list(section.items).forEach((dish) => {
      const evidence = reportDish(report, dish.id);
      if (!evidence) return;
      result[sectionKind(section.nameOriginal)].push({
        dishId: dish.id, name: clean(dish.nameOriginal), price: dish.price || null,
        verdict: evidence.verdict, sectionName: clean(section.nameOriginal),
      });
    }));
    return result;
  }
  function optionAssessment(option, meal) {
    const value = optionText(option).toLowerCase();
    if (option.type === "resolution") return { verdict: "SAFE", summary: "This menu-supported change resolves a confirmed conflict.", evidence: [{ source: "supported_modification", level: "confirmed", text: option.label }] };
    const evaluator = root.ROOTS_RESTAURANT_EVIDENCE;
    const menu = root.ROOTS_MENU_STORAGE?.get?.(meal?.menuId);
    const profile = root.ROOTS_PROFILE?.getActiveProfile?.();
    if (evaluator?.evaluateDish && menu && profile) {
      const ingredientText = clean(value.replace(/^(add|with|include|extra|choice of|choose)\s+/, ""));
      const result = evaluator.evaluateDish(menu, {
        id: `meal-option-${option.id}`, sectionId: meal.main?.evidence?.sectionId,
        nameOriginal: option.label, descriptionOriginal: ingredientText,
        modifiers: [], options: [], dietaryLabels: [], allergenLabels: [], menuNotes: [],
        extraction: { method: "menu_option", evidenceLevel: "confirmed", warnings: [] },
      }, profile, { evaluatedAt: meal.updatedAt });
      return result;
    }
    const danger = /\b(pork|bacon|ham|shellfish|shrimp|prawn|egg|cheese|milk|butter|cream|wheat|gluten|peanut|sesame|garlic|onion|alcohol|wine|beer)\b/.exec(value);
    if (danger && /\b(add|with|include|extra|choice of|choose)\b/.test(value)) {
      return { verdict: "NEEDS_CONFIRMATION", summary: `${danger[1]} may conflict with the active profile.`, evidence: [{ source: "menu_modifier", level: "confirmed", text: option.label }], unknowns: [danger[1]] };
    }
    return { verdict: "NEEDS_CONFIRMATION", summary: "The menu lists this option without enough ingredient detail.", evidence: [{ source: "menu_modifier", level: "confirmed", text: option.label }], unknowns: [option.label] };
  }
  function newMeal(menu, report, mainDishId, restaurant) {
    const main = componentFromDish(menu, report, mainDishId, "main");
    return {
      schemaVersion: 1, engineVersion: VERSION,
      id: `meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      restaurant: { id: menu.restaurantId, name: clean(restaurant?.name || menu.restaurantName) },
      menuId: menu.id, profileSnapshot: report.profileSnapshot,
      main, sides: [], drinks: [], desserts: [], extras: [], selectedOptionIds: [],
      portion: { id: "standard", label: "Standard portion", menuSupported: true },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
  function selectedOptions(meal) {
    return list(meal.main?.options).filter((item) => list(meal.selectedOptionIds).includes(item.id));
  }
  function aggregate(meal) {
    const components = [meal.main, ...list(meal.sides), ...list(meal.drinks), ...list(meal.desserts), ...list(meal.extras)].filter(Boolean);
    const assessments = components.map((component) => ({ name: component.name, role: component.role, ...component.evidence }));
    const options = selectedOptions(meal).map((option) => ({ option, assessment: optionAssessment(option, meal) }));
    const required = list(meal.main?.evidence?.suggestedModifications);
    const resolved = new Set(options.filter((item) => item.option.type === "resolution").map((item) => item.option.id));
    const unresolvedRequired = required.filter((item) => !resolved.has(item.id));
    const conflicts = assessments.filter((item) => item.verdict === "AVOID").map((item) => `${item.name}: ${clean(item.summary)}`);
    const warnings = assessments.flatMap((item) => list(item.warnings).map((warning) => clean(warning.text || warning.message || warning))).filter(Boolean);
    const unknowns = assessments.flatMap((item) => list(item.unknowns).map((unknown) => clean(unknown.text || unknown.ingredient || unknown))).filter(Boolean);
    options.forEach(({ option, assessment }) => {
      if (assessment.verdict === "AVOID") conflicts.push(`${option.label}: ${assessment.summary}`);
      if (assessment.verdict === "NEEDS_CONFIRMATION") unknowns.push(...list(assessment.unknowns));
    });
    let verdict = VERDICTS.BEST_CHOICE;
    if (conflicts.length) verdict = VERDICTS.AVOID;
    else if (assessments.some((item) => item.verdict === "AVOID")) verdict = VERDICTS.AVOID;
    else if (assessments.some((item) => item.verdict === "NEEDS_CONFIRMATION") || options.some((item) => item.assessment.verdict === "NEEDS_CONFIRMATION") || unresolvedRequired.length || unknowns.length) verdict = VERDICTS.NEEDS_CONFIRMATION;
    else if (components.length > 1 || options.length || meal.portion?.id !== "standard" || assessments.some((item) => item.verdict === "SAFE_WITH_MODIFICATION")) verdict = VERDICTS.COMPATIBLE;
    const alternatives = [];
    options.filter((item) => item.assessment.verdict !== "SAFE").forEach(({ option }) => {
      const replacement = list(meal.main?.options).find((candidate) => candidate.id !== option.id && candidate.type === "resolution");
      if (replacement) alternatives.push({ forOptionId: option.id, optionId: replacement.id, label: replacement.label, reason: "Menu-supported option that resolves a known conflict." });
    });
    return {
      verdict, label: verdict.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      compatibleSelections: assessments.filter((item) => item.verdict === "SAFE").map((item) => item.name),
      conflicts: [...new Set(conflicts)], warnings: [...new Set(warnings)],
      unknowns: [...new Set(unknowns)], unresolvedRequired, alternatives,
      selectedModifications: options.map((item) => item.option.label),
      restaurantNotes: [...new Set(assessments.flatMap((item) => list(item.restaurantNotes).map((note) => clean(note.text || note))).filter(Boolean))],
      evidence: assessments.flatMap((item) => list(item.evidence).map((evidence) => ({ ...evidence, component: item.name }))),
      portionAwareness: meal.portion?.id === "standard" ? "Portion size does not change dietary compatibility." : `${meal.portion.label} is a menu-listed portion. Portion size does not change dietary compatibility.`,
    };
  }
  function update(meal, changes) {
    const next = { ...meal, ...changes, updatedAt: new Date().toISOString() };
    return { ...next, analysis: aggregate(next) };
  }
  function addComponent(meal, menu, report, dishId, role) {
    if (!["sides", "drinks", "desserts", "extras"].includes(role)) throw new TypeError("Unsupported meal component role.");
    const component = componentFromDish(menu, report, dishId, role.slice(0, -1));
    return update(meal, { [role]: [...list(meal[role]).filter((item) => item.dishId !== dishId), component] });
  }
  function removeComponent(meal, dishId, role) { return update(meal, { [role]: list(meal[role]).filter((item) => item.dishId !== dishId) }); }
  function selectOption(meal, optionId, selected) {
    if (!list(meal.main?.options).some((item) => item.id === optionId)) throw new TypeError("Only menu-supported options can be selected.");
    const ids = new Set(list(meal.selectedOptionIds));
    if (selected) ids.add(optionId); else ids.delete(optionId);
    return update(meal, { selectedOptionIds: [...ids] });
  }
  function compare(report, dishIds) {
    return list(dishIds).slice(0, 3).map((dishId) => {
      const dish = reportDish(report, dishId);
      return dish ? { dishId, name: dish.dishName, verdict: dish.verdict, summary: dish.summary, warnings: list(dish.warnings).length, unknowns: list(dish.unknowns).length } : null;
    }).filter(Boolean);
  }
  root.ROOTS_MEAL_ENGINE = { newMeal, update, aggregate, addComponent, removeComponent, selectOption, supportedOptions, availableComponents, compare, findDish, reportDish, constants: { VERSION, VERDICTS } };
})(typeof window !== "undefined" ? window : globalThis);
