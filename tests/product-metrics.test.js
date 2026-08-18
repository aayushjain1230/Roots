"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path");
class Storage{constructor(){this.data=new Map();}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
global.localStorage=new Storage();require(path.join(__dirname,"..","www","product-metrics.js"));const M=global.ROOTS_METRICS;
test("metrics are opt-in and disabled collection stores nothing",()=>{assert.equal(M.consent(),false);assert.equal(M.track("scan_completed",{decision:"MATCH"}),false);assert.equal(M.summary().eventCount,0);});
test("metrics allow only bounded non-sensitive fields",()=>{M.setConsent(true);M.track("scan_completed",{decision:"VERIFY",product:"Secret Food",location:"Home"});const event=M.exportData().events[0];assert.deepEqual(event.details,{decision:"VERIFY"});assert.doesNotMatch(JSON.stringify(event),/Secret Food|Home/);});
test("unknown events are rejected",()=>{assert.equal(M.track("user_profile",{outcome:"x"}),false);});
test("VERIFY to RESOLVED rate is transparent",()=>{M.clear();M.track("verify_result",{});M.track("verify_result",{});M.track("resolution_succeeded",{});assert.equal(M.summary().verifyToResolvedRate,0.5);});
test("disabling consent clears all local metrics",()=>{M.setConsent(false);assert.equal(M.summary().eventCount,0);});
