"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

class MemoryStorage {
  constructor(seed) { this.data = new Map(Object.entries(seed || {})); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

global.localStorage = new MemoryStorage();
require(path.join(__dirname, "..", "www", "profile-definitions.js"));
require(path.join(__dirname, "..", "www", "profile.js"));
const P = global.ROOTS_PROFILE;
const D = P.definitions;

function fresh() {
  global.localStorage = new MemoryStorage();
  return P.createDefaultProfile({ timestamp: "2026-01-01T00:00:00.000Z" });
}
function on(profile, group, id) { return profile[group].find((item) => item.id === id); }

test("default profile has schema v2, validates, and uses Standard cross-contact", () => {
  const profile = fresh();
  assert.equal(profile.schemaVersion, 2);
  assert.equal(P.validateProfile(profile).valid, true);
  assert.deepEqual(profile.crossContact, { preset: "standard", contains: "avoid", mayContain: "caution", sharedEquipment: "caution", sharedFacility: "caution" });
});

test("religious and lifestyle selections persist", () => {
  let profile = fresh();
  P.setDietSelection(profile, "religious", "halal", true);
  P.setDietSelection(profile, "lifestyle", "vegetarian", true);
  profile = P.saveActiveProfile(profile);
  assert.equal(on(P.getActiveProfile(), "religiousDiets", "halal").enabled, true);
  assert.equal(on(P.getActiveProfile(), "lifestyleDiets", "vegetarian").enabled, true);
});

test("built-in and custom allergies persist", () => {
  const profile = fresh();
  profile.allergies.push({ id: "peanut", type: "built_in" }, { label: "Mustard", normalizedTerm: "mustard", type: "custom" });
  const saved = P.saveActiveProfile(profile);
  assert.deepEqual(saved.allergies.map((item) => item.label), ["Peanuts", "Mustard"]);
});

test("Jain, Hindu egg, and gluten options persist", () => {
  const profile = fresh();
  P.setDietSelection(profile, "religious", "jain", true);
  on(profile, "religiousDiets", "jain").options.avoidMushrooms = true;
  P.setDietSelection(profile, "religious", "hindu_vegetarian", true);
  on(profile, "religiousDiets", "hindu_vegetarian").options.allowEggs = true;
  P.setDietSelection(profile, "lifestyle", "gluten_free", true);
  on(profile, "lifestyleDiets", "gluten_free").options.strictCrossContact = true;
  const saved = P.saveActiveProfile(profile);
  assert.equal(on(saved, "religiousDiets", "jain").options.avoidMushrooms, true);
  assert.equal(on(saved, "religiousDiets", "hindu_vegetarian").options.allowEggs, true);
  assert.equal(on(saved, "lifestyleDiets", "gluten_free").options.strictCrossContact, true);
});

test("None clears religious selections and another selection clears None state", () => {
  const profile = fresh();
  P.setDietSelection(profile, "religious", "halal", true);
  P.setDietSelection(profile, "religious", "none", true);
  assert.equal(profile.religiousDiets.some((item) => item.enabled), false);
  P.setDietSelection(profile, "religious", "kosher", true);
  assert.equal(on(profile, "religiousDiets", "kosher").enabled, true);
});

test("None clears lifestyle selections and another selection clears None state", () => {
  const profile = fresh();
  P.setDietSelection(profile, "lifestyle", "vegan", true);
  P.setDietSelection(profile, "lifestyle", "none", true);
  assert.equal(profile.lifestyleDiets.some((item) => item.enabled), false);
  P.setDietSelection(profile, "lifestyle", "vegetarian", true);
  assert.equal(on(profile, "lifestyleDiets", "vegetarian").enabled, true);
});

test("Jain is the only selectable Jain profile", () => {
  const profile = fresh();
  assert.ok(on(profile, "religiousDiets", "jain"));
  assert.equal(on(profile, "religiousDiets", "strict_jain"), undefined);
  assert.equal(on(profile, "religiousDiets", "custom_jain"), undefined);
});

test("Vegan and Pescatarian may coexist and summaries expose both", () => {
  const profile = fresh();
  P.setDietSelection(profile, "lifestyle", "vegan", true);
  P.setDietSelection(profile, "lifestyle", "pescatarian", true);
  assert.match(P.describeProfile(profile), /Vegan, Pescatarian/);
});

test("duplicate IDs and allergies are removed", () => {
  const profile = fresh();
  profile.religiousDiets.push({ id: "halal", enabled: true });
  profile.allergies = [{ id: "peanut", type: "built_in" }, { id: "peanut", type: "built_in" }];
  const repaired = P.validateProfile(profile).profile;
  assert.equal(repaired.religiousDiets.filter((item) => item.id === "halal").length, 1);
  assert.equal(repaired.allergies.length, 1);
});

test("strict and custom cross-contact persist and custom edits change preset", () => {
  const profile = fresh();
  P.applyCrossContactPreset(profile, "strict");
  assert.deepEqual(profile.crossContact, { preset: "strict", ...D.crossContactPresets.strict });
  P.setCrossContactValue(profile, "sharedFacility", "ignore");
  assert.equal(profile.crossContact.preset, "custom");
  assert.equal(P.saveActiveProfile(profile).crossContact.sharedFacility, "ignore");
});

test("invalid custom cross-contact restores Standard", () => {
  const profile = fresh();
  profile.crossContact = { preset: "custom", contains: "maybe", mayContain: "ignore", sharedEquipment: "avoid", sharedFacility: "ignore" };
  assert.deepEqual(P.validateProfile(profile).profile.crossContact, { preset: "standard", ...D.crossContactPresets.standard });
});

test("custom term normalization is conservative", () => {
  assert.equal(P.normalizeCustomTerm("  Peanuts... "), "peanuts");
  assert.equal(P.normalizeCustomTerm("Tree–Nut"), "tree-nut");
  assert.equal(P.normalizeCustomTerm("MSG"), "msg");
  assert.equal(P.normalizeCustomTerm("..."), "");
  assert.notEqual(P.normalizeCustomTerm("nut"), P.normalizeCustomTerm("coconut"));
});

test("empty and capitalization duplicate custom terms are removed", () => {
  const profile = fresh();
  profile.customRules = [
    { label: "MSG", normalizedTerm: "msg", severity: "avoid" },
    { label: "msg", normalizedTerm: "MSG", severity: "caution" },
    { label: "...", severity: "avoid" },
  ];
  const repaired = P.validateProfile(profile).profile;
  assert.equal(repaired.customRules.length, 1);
  assert.equal(repaired.customRules[0].severity, "avoid");
});

test("invalid severity repairs to caution and missing arrays/timestamps are repaired", () => {
  const repaired = P.validateProfile({ schemaVersion: 1, customRules: [{ label: "MSG", severity: "danger" }] }).profile;
  assert.equal(repaired.customRules[0].severity, "caution");
  assert.deepEqual(repaired.allergies, []);
  assert.ok(repaired.createdAt);
  assert.ok(repaired.updatedAt);
});

test("unusable profile is rejected", () => {
  assert.equal(P.validateProfile({ schemaVersion: 999 }).valid, false);
  assert.equal(P.validateProfile(null).valid, false);
});

test("legacy profile becomes Jain with strict defaults, backup, and marker", () => {
  const legacy = { vegan: true, checks: ["peanut", "milk"], extra: ["Mustard"] };
  global.localStorage = new MemoryStorage({ "bij-profile-v4": JSON.stringify(legacy) });
  const migrated = P.migrateLegacyProfile();
  assert.equal(on(migrated, "religiousDiets", "jain").enabled, true);
  assert.deepEqual(on(migrated, "religiousDiets", "jain").options, D.jainDefaults);
  assert.equal(on(migrated, "lifestyleDiets", "vegan").enabled, true);
  assert.deepEqual(migrated.allergies.map((item) => item.label), ["Peanuts", "Milk", "Mustard"]);
  assert.equal(global.localStorage.getItem(P.keys.legacyBackup), JSON.stringify(legacy));
  assert.ok(global.localStorage.getItem(P.keys.migration));
  assert.equal(global.localStorage.getItem(P.keys.legacy), JSON.stringify(legacy));
});

test("legacy migration is idempotent and does not duplicate entries", () => {
  global.localStorage = new MemoryStorage({ "bij-profile-v4": JSON.stringify({ checks: ["peanut"], extra: ["Peanut"] }) });
  const first = P.migrateLegacyProfile();
  const second = P.migrateLegacyProfile();
  assert.equal(first.allergies.length, 1);
  assert.equal(second.allergies.length, 1);
});

test("failed legacy migration leaves original data intact", () => {
  global.localStorage = new MemoryStorage({ "bij-profile-v4": "{broken" });
  assert.equal(P.migrateLegacyProfile(), null);
  assert.equal(global.localStorage.getItem("bij-profile-v4"), "{broken");
  assert.equal(global.localStorage.getItem(P.keys.profile), null);
});

test("obsolete Jain-shaped scanner adapter is not exposed", () => {
  assert.equal(P.getLegacyCompatibleProfile, undefined);
});

test("compact, full, and AI summaries use Jain and expose selected settings", () => {
  const profile = fresh();
  P.setDietSelection(profile, "religious", "jain", true);
  profile.allergies = P.validateProfile({ ...profile, allergies: [{ id: "peanut", type: "built_in" }] }).profile.allergies;
  profile.customRules = [{ id: "r1", label: "MSG", normalizedTerm: "msg", severity: "avoid", aliases: [] }];
  profile.dislikes = [{ id: "d1", label: "Mushrooms", normalizedTerm: "mushroom" }];
  assert.match(P.getCompactProfileSummary(profile), /Jain · Peanuts allergy/);
  assert.match(P.describeProfile(profile), /Custom restrictions: Avoid MSG/);
  const ai = P.getProfileForAI(profile);
  assert.match(ai, /Treat “may contain” as caution/);
  assert.match(ai, /Never override deterministic/);
  assert.match(ai, /Jain settings:/);
  assert.doesNotMatch(ai, /strict_jain|custom_jain|Strict Jain|Custom Jain/);
  assert.doesNotMatch(P.getProfileForAI(fresh()), /\nAllergies:/);
});

test("save/load equivalence leaves unrelated storage untouched", () => {
  const profile = fresh();
  global.localStorage.setItem("bij-history-v2", "history");
  global.localStorage.setItem("bij-shopping-v1", "shopping");
  global.localStorage.setItem("bij-chat-v1", "chat");
  global.localStorage.setItem("ceit-appearance-v1", "dark");
  const saved = P.saveActiveProfile(profile);
  assert.deepEqual(P.getActiveProfile(), saved);
  assert.equal(global.localStorage.getItem("bij-history-v2"), "history");
  assert.equal(global.localStorage.getItem("bij-shopping-v1"), "shopping");
  assert.equal(global.localStorage.getItem("bij-chat-v1"), "chat");
  assert.equal(global.localStorage.getItem("ceit-appearance-v1"), "dark");
});

test("stored strict_jain schema v1 migrates once with strict defaults and backup", () => {
  const legacy = { ...fresh(), schemaVersion: 1, name: "Family", religiousDiets: [
    { id: "strict_jain", enabled: true, options: {} },
    { id: "custom_jain", enabled: false, options: { avoidAllRootVegetables: false, avoidMushrooms: true } },
  ] };
  global.localStorage = new MemoryStorage({ [P.keys.profile]: JSON.stringify(legacy) });
  const migrated = P.getActiveProfile();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.name, "Family");
  assert.deepEqual(on(migrated, "religiousDiets", "jain").options, D.jainDefaults);
  assert.ok(global.localStorage.getItem(P.keys.jainBackup));
  assert.ok(global.localStorage.getItem(P.keys.jainMigration));
  assert.deepEqual(P.getActiveProfile(), migrated);
});

test("stored custom_jain preserves explicit values and fills missing defaults", () => {
  const legacy = { ...fresh(), schemaVersion: 1, religiousDiets: [{ id: "custom_jain", enabled: true, options: { avoidOnionGarlic: false, avoidMushrooms: true } }] };
  global.localStorage = new MemoryStorage({ [P.keys.profile]: JSON.stringify(legacy) });
  const jain = on(P.getActiveProfile(), "religiousDiets", "jain");
  assert.equal(jain.enabled, true);
  assert.equal(jain.options.avoidOnionGarlic, false);
  assert.equal(jain.options.avoidMushrooms, true);
  assert.equal(jain.options.avoidAllRootVegetables, true);
});

test("strict/custom conflict resolves to one Jain entry with custom priority", () => {
  const legacy = { ...fresh(), schemaVersion: 1, religiousDiets: [
    { id: "strict_jain", enabled: true, options: {} },
    { id: "custom_jain", enabled: true, options: { avoidEggs: false } },
  ] };
  global.localStorage = new MemoryStorage({ [P.keys.profile]: JSON.stringify(legacy) });
  const migrated = P.getActiveProfile();
  assert.equal(migrated.religiousDiets.filter((item) => item.id === "jain").length, 1);
  assert.equal(on(migrated, "religiousDiets", "jain").options.avoidEggs, false);
  assert.equal(on(migrated, "religiousDiets", "jain").options.avoidHoney, true);
});

test("pre-release Jain migration is repaired from its v1 backup", () => {
  const v1 = { ...fresh(), schemaVersion: 1, religiousDiets: [
    { id: "strict_jain", enabled: true, options: {} },
    { id: "custom_jain", enabled: false, options: { avoidAllRootVegetables: false } },
  ] };
  const interim = { ...fresh(), religiousDiets: [{ id: "jain", enabled: true, options: { ...D.jainDefaults, avoidAllRootVegetables: false } }] };
  global.localStorage = new MemoryStorage({
    [P.keys.profile]: JSON.stringify(interim),
    [P.keys.jainBackup]: JSON.stringify(v1),
    [P.keys.jainMigration]: JSON.stringify({ schemaVersion: 2, code: "jain_profile_unified" }),
  });
  const repaired = P.getActiveProfile();
  assert.equal(on(repaired, "religiousDiets", "jain").options.avoidAllRootVegetables, true);
  assert.equal(JSON.parse(global.localStorage.getItem(P.keys.jainMigration)).policyVersion, 3);
});
