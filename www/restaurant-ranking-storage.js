(function (root) {
  "use strict";
  const KEY = "roots-restaurant-ranking-cache-v1", TTL = 6 * 60 * 60 * 1000, LIMIT = 60;
  const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const write = (value) => { try { localStorage.setItem(KEY, JSON.stringify(value.slice(0, LIMIT))); return true; } catch (_) { return false; } };
  function profileFingerprint(profile) {
    return JSON.stringify({ id: profile?.id, updatedAt: profile?.updatedAt, schemaVersion: profile?.schemaVersion, religiousDiets: profile?.religiousDiets, lifestyleDiets: profile?.lifestyleDiets, allergies: profile?.allergies, crossContact: profile?.crossContact, customRules: profile?.customRules });
  }
  function cacheKey(restaurant, menu, profile, context) {
    const location = context?.location ? `${Number(context.location.latitude).toFixed(4)},${Number(context.location.longitude).toFixed(4)}` : "unknown";
    return [restaurant?.id, location, menu?.id || "no-menu", menu?.lastNormalizedAt || "no-version", profileFingerprint(profile), root.ROOTS_RESTAURANT_EVIDENCE?.constants?.VERSION, root.ROOTS_RESTAURANT_RANKING?.getRankingVersion()].join("|");
  }
  function get(key, now) {
    const found = read().find((item) => item.key === key);
    return found && (now || Date.now()) - Date.parse(found.cachedAt) <= TTL ? found.summary : null;
  }
  function set(key, summary) {
    const item = { key, summary, cachedAt: new Date().toISOString() };
    write([item, ...read().filter((entry) => entry.key !== key)]);
    return summary;
  }
  function invalidateRestaurant(id) { const next = read().filter((item) => item.summary?.restaurantId !== id); write(next); return next.length; }
  function clearExpired(now) { const next = read().filter((item) => (now || Date.now()) - Date.parse(item.cachedAt) <= TTL); write(next); return next.length; }
  root.ROOTS_RESTAURANT_RANKING_STORAGE = { key: KEY, ttl: TTL, limit: LIMIT, profileFingerprint, cacheKey, get, set, invalidateRestaurant, clearExpired };
})(typeof window !== "undefined" ? window : globalThis);
