"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
class Storage { constructor(){ this.data = new Map(); } getItem(k){ return this.data.get(k) ?? null; } setItem(k,v){ this.data.set(k,String(v)); } }
global.localStorage = new Storage();
require(path.join(__dirname, "..", "www", "launch-growth.js"));
const L = global.ROOTS_LAUNCH;
test("launch milestones are local, allowlisted, and idempotent by default", () => {
  assert.equal(L.mark("profile_created"), true);
  assert.equal(L.mark("profile_created"), false);
  assert.equal(L.mark("food_name"), false);
  assert.deepEqual(L.progress().completed, ["profile_created"]);
});
test("invite payload contains no user or referral identifier", () => {
  const payload = L.invitePayload({ url: "https://roots.example/app" });
  assert.equal(payload.url, "https://roots.example/app");
  assert.doesNotMatch(JSON.stringify(payload), /profile|allergy|referral|token/i);
});
test("invite links reject insecure URLs and fail honestly when unconfigured", async () => {
  assert.throws(() => L.invitePayload({ url: "http://roots.example" }), /HTTPS/);
  assert.deepEqual(await L.shareInvite(), { status: "unavailable", reason: "public_url_not_configured" });
});
