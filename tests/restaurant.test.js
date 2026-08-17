"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

global.localStorage = new MemoryStorage();
require(path.join(__dirname, "..", "www", "restaurant-provider.js"));
require(path.join(__dirname, "..", "www", "restaurant-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-search.js"));
const Provider = global.ROOTS_RESTAURANT_PROVIDER;
const Storage = global.ROOTS_RESTAURANT_STORAGE;
const Search = global.ROOTS_RESTAURANT_SEARCH;
const location = { latitude: 40.7128, longitude: -74.006, label: "New York, NY" };
const reset = () => { global.localStorage = new MemoryStorage(); Provider.resetProvider(); };

test("provider interface is abstract and rejects incomplete implementations", () => {
  reset();
  assert.throws(() => Provider.setProvider({ searchRestaurants() {} }), /must implement/);
  class Fake extends Provider.RestaurantProvider {
    async searchRestaurants() { return []; }
    async reverseGeocode() { return location; }
    async autocomplete() { return [location]; }
  }
  Provider.setProvider(new Fake());
  assert.ok(Provider.getProvider() instanceof Fake);
});

test("restaurant normalization validates URLs and optional metadata", () => {
  const item = Provider.normalizeRestaurant({ id: "r1", name: "Cafe", cuisine: "Coffee", image: "javascript:bad", distanceMiles: 1.2, openStatus: "open", priceRange: "$$", rating: 4.7, menuAvailable: true });
  assert.equal(item.image, "");
  assert.equal(item.rating, 4.7);
  assert.equal(item.menuAvailable, true);
  assert.equal(Provider.normalizeRestaurant({ name: "Missing id" }), null);
});

test("location permission is requested only by explicit getCurrentLocation call", async () => {
  reset();
  let calls = 0;
  const geolocation = { getCurrentPosition(success) { calls += 1; success({ coords: { latitude: 40, longitude: -73 } }); } };
  assert.equal(calls, 0);
  const value = await Search.getCurrentLocation({ geolocation });
  assert.equal(calls, 1);
  assert.equal(value.latitude, 40);
});

test("location errors distinguish denied, unavailable, and timeout", () => {
  assert.equal(Search.geolocationError({ code: 1 }).code, "permission_denied");
  assert.equal(Search.geolocationError({ code: 1, restricted: true }).code, "permission_restricted");
  assert.equal(Search.geolocationError({ code: 2 }).code, "location_unavailable");
  assert.equal(Search.geolocationError({ code: 3 }).code, "location_timeout");
});

test("radius preference supports only 5, 10, 20, 30, and 50 miles", () => {
  reset();
  assert.equal(Storage.getRadius(), 10);
  for (const radius of [5, 10, 20, 30, 50]) assert.equal(Storage.setRadius(radius), radius);
  assert.equal(Storage.setRadius(99), 50);
});

test("recent searches are deduplicated, bounded, and clearable", () => {
  reset();
  Storage.addRecentSearch("Pizza", location, 10);
  Storage.addRecentSearch("Pizza", location, 10);
  assert.equal(Storage.getRecentSearches().length, 1);
  for (let index = 0; index < 20; index += 1) Storage.addRecentSearch(`Meal ${index}`, location, 10);
  assert.equal(Storage.getRecentSearches().length, Storage.limits.searches);
  Storage.clearRecentSearches();
  assert.equal(Storage.getRecentSearches().length, 0);
});

test("Home, Work, favorites, and recent locations remain local", () => {
  reset();
  Storage.addRecentLocation(location);
  Storage.saveLocation("home", location, "Home address");
  Storage.saveLocation("work", { ...location, longitude: -73.9 }, "Office");
  Storage.saveLocation("favorite", { ...location, longitude: -73.8 }, "Favorite cafe area");
  assert.equal(Storage.getRecentLocations().length, 1);
  assert.equal(Storage.getSavedLocations().length, 3);
  assert.ok(Storage.getSavedLocations().some((item) => item.id === "home"));
});

test("typed meal and chip searches pass location and radius through provider", async () => {
  reset();
  let request;
  Provider.setProvider({
    async searchRestaurants(input) { request = input; return { provider: "test", restaurants: [{ id: "r1", name: "Pizza Place", cuisine: "Pizza" }] }; },
    async reverseGeocode() { return location; },
    async autocomplete() { return [location]; },
  });
  const result = await Search.searchRestaurants({ meal: "  Pizza  ", location, radius: 20 });
  assert.equal(request.meal, "Pizza");
  assert.equal(request.radius, 20);
  assert.equal(result.restaurants.length, 1);
  assert.equal(Storage.getRecentSearches()[0].meal, "Pizza");
});

test("autocomplete provider remains replaceable", async () => {
  reset();
  Provider.setProvider({
    async searchRestaurants() { return []; },
    async reverseGeocode() { return location; },
    async autocomplete({ query }) { return [{ ...location, id: "nyc", label: `${query}, NY` }]; },
  });
  const results = await Search.autocomplete("New York");
  assert.equal(results[0].id, "nyc");
});

test("offline searches use cached lists and never cache menus", async () => {
  reset();
  Storage.cacheResults("Pizza", location, 10, [{ id: "r1", name: "Cached Pizza" }], { provider: "test" });
  const originalNavigator = global.navigator;
  Object.defineProperty(global, "navigator", { configurable: true, value: { onLine: false } });
  const result = await Search.searchRestaurants({ meal: "Pizza", location, radius: 10 });
  assert.equal(result.cached, true);
  const stored = global.localStorage.getItem(Storage.keys.cache);
  assert.doesNotMatch(stored, /menuItems|menuText|dishes/);
  Object.defineProperty(global, "navigator", { configurable: true, value: originalNavigator });
});

test("timeout and cancellation normalize to stable provider errors", async () => {
  const controller = new AbortController();
  const waiting = Provider.withTimeout(new Promise(() => {}), { signal: controller.signal, timeoutMs: 5000 });
  controller.abort();
  await assert.rejects(waiting, (error) => error.code === "cancelled");
  assert.equal(Provider.normalizeError({ name: "AbortError" }).code, "cancelled");
});

test("Restaurant UI contains location-first accessible controls and no menu analysis", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-ui.js"), "utf8");
  assert.ok(html.indexOf("restaurant-location-step") < html.indexOf("restaurant-meal-step"));
  assert.match(html, /id="restaurant-use-location"[^>]*type="button"/);
  assert.match(html, /id="restaurant-manual-address"[^>]*maxlength="180"/);
  assert.match(html, /id="restaurant-radius"/);
  assert.match(ui, /Compatibility analysis: Not yet analyzed/);
  assert.doesNotMatch(ui, /compatibilityPercent|dishCount|analyzeMenu|menu OCR/i);
});

test("service worker caches all four Restaurant foundation modules", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "www", "sw.js"), "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  for (const file of ["restaurant-provider.js", "restaurant-storage.js", "restaurant-search.js", "restaurant-ui.js"]) {
    assert.match(sw, new RegExp(`\\.\\/${file.replace(".", "\\.")}`));
  }
});
