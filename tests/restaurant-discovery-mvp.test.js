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
global.ROOTS_RUNTIME_CONFIG = { API_BASE_URL: "https://api.roots.test", API_CONFIG_CODE: "OK" };
const requests = [];
global.ROOTS_NETWORK = {
  async request(url, options) {
    requests.push({ url, options });
    if (url.includes("/v1/restaurants/geocode")) {
      return { ok: true, status: 200, data: { provider: "nominatim", results: [{ id: "nyc", label: "New York, NY", latitude: 40.7128, longitude: -74.006 }] }, headers: new Map() };
    }
    return { ok: true, status: 200, data: { provider: "openstreetmap", restaurants: [{
      id: "osm:node:1", provider: "openstreetmap", providerEntityType: "node", providerEntityId: "1", name: "Jain Cafe",
      cuisine: "indian", coordinates: { latitude: 40.713, longitude: -74.005 }, distanceMiles: 0.2,
      website: "https://example.com/menu", dietaryTags: ["vegetarian: yes", "jain: yes"], providerMetadata: { evidenceWarning: "weak metadata" },
    }], metadata: { providerNotes: ["public map data"], searchedAt: "2026-08-20T00:00:00" } }, headers: new Map() };
  },
};
require(path.join(__dirname, "..", "www", "connectivity.js"));
require(path.join(__dirname, "..", "www", "restaurant-provider.js"));
require(path.join(__dirname, "..", "www", "restaurant-storage.js"));
require(path.join(__dirname, "..", "www", "restaurant-search.js"));

const Provider = global.ROOTS_RESTAURANT_PROVIDER;
const Storage = global.ROOTS_RESTAURANT_STORAGE;
const Search = global.ROOTS_RESTAURANT_SEARCH;
const location = { latitude: 40.7128, longitude: -74.006, label: "New York, NY" };

test("backend restaurant provider is installed from runtime config and calls ROOTS API", async () => {
  Provider.installDefaultProvider();
  const found = await Search.searchRestaurants({ meal: "Indian", location, radius: 5 });
  assert.equal(requests.at(-1).url, "https://api.roots.test/v1/restaurants/discover");
  assert.equal(JSON.parse(requests.at(-1).options.body).meal, "Indian");
  assert.equal(found.restaurants[0].provider, "openstreetmap");
  assert.equal(found.restaurants[0].providerEntityId, "1");
  assert.deepEqual(found.restaurants[0].dietaryTags, ["vegetarian: yes", "jain: yes"]);
  assert.equal(found.restaurants[0].menuAvailable, true);
});

test("typed location resolves through geocoder without requiring suggestion click", async () => {
  Provider.installDefaultProvider();
  const resolved = await Search.resolveAddress("New York");
  assert.equal(resolved.label, "New York, NY");
  assert.ok(requests.some((item) => item.url.includes("/v1/restaurants/geocode?q=New%20York")));
});

test("offline discovery serves cached restaurant lists with last-updated metadata", async () => {
  global.localStorage = new MemoryStorage();
  Storage.cacheResults("Indian", location, 5, [{ id: "osm:node:1", name: "Cached Cafe", provider: "openstreetmap" }], { provider: "openstreetmap", searchedAt: "2026-08-20T00:00:00" });
  global.ROOTS_CONNECTIVITY.setForTesting("OFFLINE");
  const cached = await Search.searchRestaurants({ meal: "Indian", location, radius: 5 });
  assert.equal(cached.cached, true);
  assert.equal(cached.metadata.searchedAt, "2026-08-20T00:00:00");
  assert.equal(cached.restaurants[0].name, "Cached Cafe");
  global.ROOTS_CONNECTIVITY.setForTesting("ONLINE");
});

test("restaurant UI exposes map links without embedding OSM tiles", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "..", "www", "restaurant-ui.js"), "utf8");
  assert.match(html, /restaurant-map-preview/);
  assert.match(ui, /openstreetmap\.org/);
  assert.doesNotMatch(html, /tile\.openstreetmap\.org|<iframe/i);
});

test("backend source keeps OSM provider swappable and marks tags as weak evidence", () => {
  const api = fs.readFileSync(path.join(__dirname, "..", "api.py"), "utf8");
  assert.match(api, /ROOTS_OSM_CONTACT/);
  assert.match(api, /@app\.get\("\/v1\/restaurants\/geocode"\)/);
  assert.match(api, /@app\.post\("\/v1\/restaurants\/discover"\)/);
  assert.match(api, /OpenStreetMap dietary tags are weak metadata/);
  assert.match(api, /restaurant_discovery_cache/);
  assert.match(api, /OVERPASS_TIMEOUT_SECONDS/);
  assert.match(api, /KNOWN_OVERPASS_ENDPOINTS/);
  assert.ok(api.includes("https://overpass-api.de/api/interpreter"));
  assert.ok(api.includes("https://overpass.kumi.systems/api/interpreter"));
  assert.ok(api.includes("https://overpass.osm.ch/api/interpreter"));
  assert.match(api, /restaurant_discovery_inflight/);
  assert.match(api, /providerStatus/);
  assert.match(api, /Reused recently discovered public map results/);
  assert.doesNotMatch(api.slice(api.indexOf("async def restaurant_discover"), api.indexOf("@app.post(\"/find-food\")")), /GOOGLE_PLACES_API_KEY|GEOAPIFY_API_KEY/);
});
