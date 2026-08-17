(function (root) {
  "use strict";
  const KEYS = Object.freeze({
    radius: "roots-restaurant-radius-v1",
    recentSearches: "roots-restaurant-searches-v1",
    recentLocations: "roots-restaurant-locations-v1",
    savedLocations: "roots-restaurant-saved-locations-v1",
    cache: "roots-restaurant-cache-v1",
  });
  const SEARCH_LIMIT = 12, LOCATION_LIMIT = 8, CACHE_LIMIT = 20, CACHE_TTL = 30 * 60 * 1000;
  const read = (key, fallback) => {
    try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; }
    catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  };
  const clean = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 180);
  const locationKey = (location) => `${Number(location.latitude).toFixed(4)},${Number(location.longitude).toFixed(4)}`;
  const normalizedLocation = (location) => {
    const checked = root.ROOTS_RESTAURANT_PROVIDER?.validateLocation(location);
    return checked ? { ...checked, id: clean(location.id, 80) || locationKey(checked), savedAt: clean(location.savedAt, 40) || new Date().toISOString() } : null;
  };
  const unique = (items, key, limit) => {
    const seen = new Set();
    return items.filter((item) => { const value = key(item); if (!value || seen.has(value)) return false; seen.add(value); return true; }).slice(0, limit);
  };

  function getRadius() {
    const value = Number(read(KEYS.radius, 10));
    return [5, 10, 20, 30, 50].includes(value) ? value : 10;
  }
  function setRadius(value) {
    const radius = Number(value);
    if (![5, 10, 20, 30, 50].includes(radius)) return getRadius();
    write(KEYS.radius, radius);
    return radius;
  }
  function getRecentSearches() { return read(KEYS.recentSearches, []).filter((item) => item?.meal && item?.location); }
  function addRecentSearch(meal, location, radius) {
    const checked = normalizedLocation(location), query = clean(meal, 120);
    if (!query || !checked) return null;
    const record = { meal: query, location: checked, radius: setRadius(radius), timestamp: new Date().toISOString() };
    const next = unique([record, ...getRecentSearches()], (item) => `${item.meal.toLowerCase()}|${locationKey(item.location)}|${item.radius}`, SEARCH_LIMIT);
    write(KEYS.recentSearches, next);
    return record;
  }
  function clearRecentSearches() { write(KEYS.recentSearches, []); }
  function getRecentLocations() { return read(KEYS.recentLocations, []).map(normalizedLocation).filter(Boolean); }
  function addRecentLocation(location) {
    const checked = normalizedLocation(location);
    if (!checked) return null;
    write(KEYS.recentLocations, unique([checked, ...getRecentLocations()], locationKey, LOCATION_LIMIT));
    return checked;
  }
  function getSavedLocations() { return read(KEYS.savedLocations, []).map(normalizedLocation).filter(Boolean); }
  function saveLocation(kind, location, label) {
    if (!["home", "work", "favorite"].includes(kind)) return null;
    const checked = normalizedLocation({ ...location, label: clean(label, 120) || location.label });
    if (!checked) return null;
    const record = { ...checked, kind, id: kind === "favorite" ? checked.id : kind };
    const next = [record, ...getSavedLocations().filter((item) => item.id !== record.id)];
    write(KEYS.savedLocations, next.slice(0, 12));
    return record;
  }
  function removeSavedLocation(id) { return write(KEYS.savedLocations, getSavedLocations().filter((item) => item.id !== id)); }
  function cacheKey(meal, location, radius) { return `${clean(meal, 120).toLowerCase()}|${locationKey(location)}|${radius}`; }
  function getCachedResults(meal, location, radius) {
    const key = cacheKey(meal, location, radius);
    const record = read(KEYS.cache, []).find((item) => item.key === key);
    return record && Date.now() - Date.parse(record.cachedAt) <= CACHE_TTL ? record : null;
  }
  function cacheResults(meal, location, radius, restaurants, metadata) {
    const key = cacheKey(meal, location, radius);
    const record = { key, meal: clean(meal, 120), location: normalizedLocation(location), radius, restaurants, metadata: metadata || {}, cachedAt: new Date().toISOString() };
    write(KEYS.cache, [record, ...read(KEYS.cache, []).filter((item) => item.key !== key)].slice(0, CACHE_LIMIT));
    return record;
  }

  root.ROOTS_RESTAURANT_STORAGE = {
    keys: KEYS, getRadius, setRadius, getRecentSearches, addRecentSearch, clearRecentSearches,
    getRecentLocations, addRecentLocation, getSavedLocations, saveLocation, removeSavedLocation,
    getCachedResults, cacheResults, limits: { searches: SEARCH_LIMIT, locations: LOCATION_LIMIT, cache: CACHE_LIMIT },
  };
})(typeof window !== "undefined" ? window : globalThis);
