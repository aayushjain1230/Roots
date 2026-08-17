(function (root) {
  "use strict";
  const SCHEMA_VERSION = 1, LIMIT = 250;
  const LEGACY_KEY = "roots-saved-meals-v1", INDEX_KEY = "roots-saved-meal-index-v2", PREFIX = "roots-saved-meal-v2:";
  const BACKUP_KEY = "roots-saved-meals-v1-backup";
  const STATUSES = Object.freeze(["draft", "saved", "planned", "ordered", "archived"]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value, limit = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const now = () => new Date().toISOString();
  const id = () => `saved-meal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const validId = (value) => /^[a-z0-9][a-z0-9._:-]{2,179}$/i.test(String(value || ""));
  const date = (value, fallback) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
  const readIndex = () => { try { const value = JSON.parse(localStorage.getItem(INDEX_KEY)); return Array.isArray(value) ? value.filter(validId).slice(0, LIMIT) : []; } catch (_) { return []; } };
  const writeIndex = (ids) => { localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)].slice(0, LIMIT))); };
  const rawGet = (recordId) => { try { return JSON.parse(localStorage.getItem(PREFIX + recordId)); } catch (_) { return null; } };
  function profileFingerprint(profile) {
    if (root.ROOTS_RESTAURANT_RANKING_STORAGE?.profileFingerprint) return root.ROOTS_RESTAURANT_RANKING_STORAGE.profileFingerprint(profile);
    return JSON.stringify({ id: profile?.id, updatedAt: profile?.updatedAt, schemaVersion: profile?.schemaVersion, religiousDiets: profile?.religiousDiets, lifestyleDiets: profile?.lifestyleDiets, allergies: profile?.allergies, crossContact: profile?.crossContact, customRules: profile?.customRules });
  }
  function validate(record) {
    if (!record || record.schemaVersion !== SCHEMA_VERSION || !validId(record.id)) throw new TypeError("Invalid saved meal record.");
    if (!clean(record.name, 120)) throw new TypeError("Meal name is required.");
    if (!STATUSES.includes(record.status) || !validId(record.restaurant?.restaurantId) || !validId(record.meal?.mainDishId)) throw new TypeError("Saved meal identity is invalid.");
    if (!Number.isFinite(Date.parse(record.createdAt)) || !record.evaluation?.verdict) throw new TypeError("Saved meal history is invalid.");
    return record;
  }
  function mealSnapshot(meal) {
    return {
      mainDishId: clean(meal.main?.dishId, 180), mainDishName: clean(meal.main?.name, 240),
      selectedComponents: ["sides", "drinks", "desserts", "extras"].flatMap((role) => (meal[role] || []).map((item) => ({ role, dishId: clean(item.dishId, 180), name: clean(item.name, 240) }))),
      selectedModifiers: (meal.main?.options || []).filter((item) => (meal.selectedOptionIds || []).includes(item.id)).map((item) => ({ id: clean(item.id, 180), label: clean(item.label, 500), type: clean(item.type, 40) })),
      selectedOptionIds: (meal.selectedOptionIds || []).map((item) => clean(item, 180)),
      removedComponents: (meal.removedComponents || []).map((item) => clean(item, 240)),
      specialInstructions: (meal.specialInstructions || []).map((item) => clean(item, 500)).slice(0, 20),
      portion: clone(meal.portion || { id: "standard", label: "Standard portion" }),
    };
  }
  function create(meal, options) {
    if (!meal?.main?.dishId || !meal?.analysis?.verdict) throw new TypeError("A reviewed meal is required.");
    const timestamp = now(), profile = options?.profile || root.ROOTS_PROFILE?.getActiveProfile?.() || {};
    const menu = options?.menu || root.ROOTS_MENU_STORAGE?.get?.(meal.menuId) || {};
    const restaurantName = clean(options?.restaurant?.name || meal.restaurant?.name || menu.restaurantName, 200);
    const name = clean(options?.name || `${meal.main.name} at ${restaurantName}`, 120);
    const storedMeal = mealSnapshot(meal), menuDish = root.ROOTS_MEAL_ENGINE?.findDish?.(menu, meal.main.dishId)?.dish;
    storedMeal.mainDescription = clean(menuDish?.descriptionOriginal, 2000);
    storedMeal.price = clean(menuDish?.price?.display, 80);
    return validate({
      schemaVersion: SCHEMA_VERSION, id: validId(options?.id) ? options.id : id(), name,
      status: STATUSES.includes(options?.status) ? options.status : "saved", favorite: options?.favorite !== false,
      restaurant: {
        restaurantId: clean(meal.restaurant?.id || menu.restaurantId, 180), chainId: clean(options?.restaurant?.chainId, 180) || null,
        name: restaurantName, address: clean(options?.restaurant?.address, 300), locationId: clean(options?.restaurant?.locationId || meal.restaurant?.id || menu.restaurantId, 180),
      },
      menu: {
        menuId: clean(menu.id || meal.menuId, 180), menuSchemaVersion: Number(menu.schemaVersion) || 1,
        menuSourceId: clean(menu.source?.id || menu.source?.url || menu.source?.type, 300),
        menuUpdatedAt: date(menu.lastNormalizedAt || menu.source?.sourceUpdatedAt, timestamp),
        menuFreshness: root.ROOTS_MENU_STORAGE?.getFreshness?.(menu)?.state || "unknown",
        signature: JSON.stringify({ id: menu.id, updatedAt: menu.lastNormalizedAt, allergenNotes: menu.allergenNotes, footnotes: menu.footnotes }),
      },
      profile: { profileId: clean(profile.id, 180), profileName: clean(profile.name || "My Profile", 120), profileFingerprint: profileFingerprint(profile), snapshot: clone(profile) },
      meal: storedMeal,
      evaluation: {
        verdict: meal.analysis.verdict, evidenceEngineVersion: root.ROOTS_RESTAURANT_EVIDENCE?.constants?.VERSION || meal.main?.evidence?.engineVersion || 1,
        mealEngineVersion: root.ROOTS_MEAL_ENGINE?.constants?.VERSION || meal.engineVersion || 1,
        summaryReasons: clone(meal.analysis.conflicts || []), warnings: clone(meal.analysis.warnings || []),
        unknowns: clone(meal.analysis.unknowns || []), crossContactConcerns: clone((meal.analysis.evidence || []).filter((item) => item.source === "cross_contact")),
        evidence: clone(meal.analysis.evidence || []), evaluatedAt: timestamp,
      },
      personalNotes: clean(options?.personalNotes, 2000), tags: (options?.tags || []).map((item) => clean(item, 40)).filter(Boolean).slice(0, 8),
      preparationConfirmations: [], versions: [], recheckStatus: "current", changeFlags: [],
      createdAt: timestamp, updatedAt: timestamp, lastCheckedAt: timestamp, lastUsedAt: null, timesUsed: 0,
      sourceMealId: clean(options?.sourceMealId, 180) || null,
    });
  }
  function put(record) {
    validate(record);
    const ids = readIndex();
    if (!ids.includes(record.id) && ids.length >= LIMIT) throw new Error("Saved meal limit reached. Archive or delete a meal before saving another.");
    localStorage.setItem(PREFIX + record.id, JSON.stringify(record));
    writeIndex([record.id, ...ids.filter((item) => item !== record.id)]);
    return clone(record);
  }
  function save(meal, options) { return put(create(meal, options)); }
  function get(recordId) { const value = rawGet(recordId); try { return value ? clone(validate(value)) : null; } catch (_) { return null; } }
  function list(filters) {
    return readIndex().map(get).filter(Boolean).filter((record) => {
      if (!filters?.includeArchived && record.status === "archived") return false;
      if (filters?.restaurantId && record.restaurant.restaurantId !== filters.restaurantId) return false;
      if (filters?.verdict && record.evaluation.verdict !== filters.verdict) return false;
      if (filters?.recheckStatus && record.recheckStatus !== filters.recheckStatus) return false;
      if (filters?.status && record.status !== filters.status) return false;
      return true;
    });
  }
  function update(recordId, changes) {
    const record = get(recordId); if (!record) throw new Error("Saved meal not found.");
    const previous = clone(record), allowed = ["name", "personalNotes", "tags", "favorite", "status", "recheckStatus", "changeFlags", "lastCheckedAt", "lastUsedAt", "timesUsed"];
    allowed.forEach((key) => { if (Object.prototype.hasOwnProperty.call(changes || {}, key)) record[key] = changes[key]; });
    record.name = clean(record.name, 120); record.personalNotes = clean(record.personalNotes, 2000);
    record.tags = (record.tags || []).map((item) => clean(item, 40)).filter(Boolean).slice(0, 8);
    record.updatedAt = now();
    if (changes?.materialChange) record.versions = [{ savedAt: record.updatedAt, reason: clean(changes.reason || "Meal updated", 200), snapshot: previous.meal, evaluation: previous.evaluation }, ...(record.versions || [])].slice(0, 10);
    return put(validate(record));
  }
  function duplicate(recordId, options) {
    const source = get(recordId); if (!source) throw new Error("Saved meal not found.");
    const copy = clone(source), timestamp = now();
    copy.id = id(); copy.name = clean(options?.name || `${source.name} Copy`, 120); copy.status = "saved";
    copy.sourceMealId = source.id; copy.createdAt = timestamp; copy.updatedAt = timestamp; copy.lastUsedAt = null; copy.timesUsed = 0;
    if (options?.profile) copy.profile = { profileId: options.profile.id, profileName: options.profile.name, profileFingerprint: profileFingerprint(options.profile), snapshot: clone(options.profile) };
    return put(copy);
  }
  const archive = (recordId) => update(recordId, { status: "archived" });
  const restore = (recordId) => update(recordId, { status: "saved" });
  function remove(recordId) { localStorage.removeItem(PREFIX + recordId); writeIndex(readIndex().filter((item) => item !== recordId)); return true; }
  function migrate() {
    if (readIndex().length || !localStorage.getItem(LEGACY_KEY)) return { migrated: 0 };
    let old; try { old = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch (_) { return { migrated: 0, error: "invalid_legacy_data" }; }
    if (!Array.isArray(old)) return { migrated: 0, error: "invalid_legacy_data" };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(old));
    let migrated = 0;
    old.forEach((meal) => { try { put(create(meal, { id: validId(meal.id) ? meal.id : undefined, name: meal.name, status: "saved" })); migrated += 1; } catch (_) { /* invalid legacy entries remain in backup */ } });
    return { migrated };
  }
  migrate();
  root.ROOTS_SAVED_MEALS = { schemaVersion: SCHEMA_VERSION, limit: LIMIT, keys: { INDEX_KEY, PREFIX, BACKUP_KEY }, create, save, put, get, update, duplicate, archive, restore, remove, list, migrate, profileFingerprint, validate };
  root.ROOTS_MEAL_STORAGE = root.ROOTS_SAVED_MEALS;
})(typeof window !== "undefined" ? window : globalThis);
