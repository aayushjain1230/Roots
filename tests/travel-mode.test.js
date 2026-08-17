const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const ROOT=path.join(__dirname,".."),source=(name)=>fs.readFileSync(path.join(ROOT,"www",name),"utf8");
function local(){const map=new Map();return{getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),keys:()=>[...map.keys()]};}
function context(extra={}){const ctx={console,Date,Math,JSON,Map,Set,TextEncoder,localStorage:local(),navigator:{onLine:true},...extra};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);return ctx;}
function load(files,extra){const ctx=context(extra);files.forEach(file=>vm.runInContext(source(file),ctx,{filename:file}));return ctx;}
const profile={id:"p1",name:"Travel profile",updatedAt:"2026-01-01",religiousDiets:[{id:"jain",enabled:true,options:{avoidMeatFishSeafood:true,avoidEggs:true,avoidOnionGarlic:true,avoidAllRootVegetables:false,avoidHoney:true,avoidMushrooms:false}}],lifestyleDiets:[{id:"vegan",enabled:false}],allergies:[{id:"peanut",label:"Peanuts",type:"built_in"}],customRules:[{id:"msg",label:"MSG",severity:"caution"}],crossContact:{sharedEquipment:"avoid"}};
const dependencies=["travel-storage.js","travel-glossary.js","travel-language-packs.js","travel-mode.js"];
const extras={ROOTS_DINING_CARD:{restrictions:()=>["Jain","Peanuts allergy"],generate:()=>({id:"base"})},ROOTS_PROFILE:{getActiveProfile:()=>profile}};
test("destination selection is manual, versioned, and suggests readable languages",async()=>{
 const ctx=load(dependencies,extras),destination=await ctx.ROOTS_TRAVEL.setDestination({countryCode:"JP",city:"Tokyo"});
 assert.equal(destination.schemaVersion,1);assert.equal(destination.primaryLanguage,"ja");assert.equal(destination.currencyCode,"JPY");
 assert.deepEqual(Array.from(destination.languages),["ja","en"]);assert.equal(ctx.ROOTS_TRAVEL.getLanguages().ja,"Japanese");
 assert.doesNotMatch(source("travel-mode.js"),/geolocation|getCurrentPosition|watchPosition/);
});
test("existing active profile is used without creating a duplicate",async()=>{
 const ctx=load(dependencies,extras),destination=await ctx.ROOTS_TRAVEL.setDestination("JP");
 const pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"ja",region:"JP",profile});await ctx.ROOTS_TRAVEL_PACKS.downloadPack(pack);
 const card=await ctx.ROOTS_TRAVEL.prepareCard({destination,language:"ja",profile});
 assert.equal(card.profileId,"p1");assert.equal(card.profileFingerprint,ctx.ROOTS_TRAVEL_PACKS.fingerprint(profile));
});
test("Jain pack includes enabled rules and excludes disabled rules",()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],extras),pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"ja",region:"JP",profile});
 const text=pack.sections.dietaryRestrictions.map(item=>item.sourceText).join(" ");
 assert.match(text,/Jain diet|onion or garlic|eggs|honey/);assert.doesNotMatch(text,/root vegetables|mushrooms/);
});
test("allergies are stored separately ahead of dietary restrictions and dislikes are not allergies",()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],extras),pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"es",region:"MX",profile});
 assert.equal(pack.sections.allergens[0].profileRuleSource,"allergy:peanut");assert.ok(pack.sections.dietaryRestrictions.length);
 assert.doesNotMatch(JSON.stringify(pack.sections.allergens),/dislike/i);
});
test("pack validates, stores offline, removes, and enforces size limit",async()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],extras),pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"es",region:"MX",profile});
 assert.equal(ctx.ROOTS_TRAVEL_PACKS.validatePack(pack).valid,true);await ctx.ROOTS_TRAVEL_PACKS.downloadPack(pack);
 assert.equal((await ctx.ROOTS_TRAVEL_PACKS.getInstalled()).length,1);await ctx.ROOTS_TRAVEL_PACKS.remove(pack.id);assert.equal((await ctx.ROOTS_TRAVEL_PACKS.getInstalled()).length,0);
 const bad={...pack,sections:{...pack.sections,dietaryRestrictions:[{sourceText:"x".repeat(600000)}]}};assert.equal(ctx.ROOTS_TRAVEL_PACKS.validatePack(bad).valid,false);
});
test("malformed pack is rejected and failed update keeps old pack",async()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],extras);
 await assert.rejects(()=>ctx.ROOTS_TRAVEL_PACKS.downloadPack({schemaVersion:9}),/Malformed/);
 const old=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"ja",region:"JP",profile});await ctx.ROOTS_TRAVEL_PACKS.downloadPack(old);
 const result=await ctx.ROOTS_TRAVEL_PACKS.update(old.id,{language:"",region:"JP",profile});assert.equal(result.id,old.id);assert.ok(result.updateError);
});
test("translation preserves source, IDs, transliteration, and structure",async()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],{...extras,BIJ_OCR:{generateText:async(prompt)=>{const match=JSON.parse(prompt.slice(prompt.lastIndexOf('[{"id"')));return JSON.stringify({phrases:match.map(item=>({id:item.id,translatedText:`T:${item.sourceText}`,transliteration:"guide"}))});}}});
 const pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"ja",region:"JP",profile}),translated=await ctx.ROOTS_TRAVEL_PACKS.translatePack(pack);
 const item=translated.sections.dietaryRestrictions[0];assert.match(item.translatedText,/^T:/);assert.ok(item.sourceText);assert.equal(item.transliteration,"guide");
});
test("new translation is blocked offline while installed pack remains readable",async()=>{
 const ctx=load(["travel-storage.js","travel-glossary.js","travel-language-packs.js"],{...extras,navigator:{onLine:false}});
 const pack=ctx.ROOTS_TRAVEL_PACKS.createPack({language:"ja",region:"JP",profile});await ctx.ROOTS_TRAVEL_PACKS.downloadPack(pack);
 await assert.rejects(()=>ctx.ROOTS_TRAVEL_PACKS.translatePack(pack),/internet/);assert.ok(await ctx.ROOTS_TRAVEL_PACKS.getForLanguage("ja","JP"));
});
test("regional aliases are case-insensitive and general knowledge never becomes dish evidence",()=>{
 const ctx=load(["travel-glossary.js"]);
 assert.equal(ctx.ROOTS_TRAVEL_GLOSSARY.search("GROUNDNUT",{allRegions:true})[0].canonicalIngredientIds[0],"peanut");
 assert.equal(ctx.ROOTS_TRAVEL_GLOSSARY.search("aubergine",{allRegions:true})[0].termTranslated,"eggplant");
 assert.equal(ctx.ROOTS_TRAVEL_GLOSSARY.search("brinjal",{allRegions:true})[0].termTranslated,"eggplant");
 assert.ok(ctx.ROOTS_TRAVEL_GLOSSARY.entries.every(item=>item.evidenceLevel==="general_knowledge"));
});
test("country wording adapts deterministic questions without changing evidence linkage",async()=>{
 const ctx=load(dependencies,extras),destination=await ctx.ROOTS_TRAVEL.setDestination("GB");
 const question={id:"q1",question:"Does this contain peanut or eggplant?",priority:"high",sourceEvidenceIds:["e1"]};
 const card=await ctx.ROOTS_TRAVEL.prepareCard({destination,language:"en",profile,questionSet:{questions:[question]}});
 assert.match(card.sections.questions[0].translatedText,/groundnut|aubergine/);assert.deepEqual(Array.from(card.sections.questions[0].sourceEvidenceIds),["e1"]);assert.equal(card.sections.questions[0].priority,"high");
});
test("currency is preserved as metadata and no conversion exists",async()=>{
 const ctx=load(dependencies,extras),destination=await ctx.ROOTS_TRAVEL.setDestination("JP"),card=await ctx.ROOTS_TRAVEL.prepareCard({destination,profile});
 assert.equal(card.currencyCode,"JPY");assert.doesNotMatch(source("travel-mode.js"),/exchangeRate|currency conversion|convertCurrency/i);
});
test("speech selects matching voice, supports slow rate, pause, resume, and stop",()=>{
 const calls=[];function Utterance(text){this.text=text;}
 const synthesis={getVoices:()=>[{name:"Japanese",lang:"ja-JP"}],speak:u=>calls.push(["speak",u]),cancel:()=>calls.push(["cancel"]),pause:()=>calls.push(["pause"]),resume:()=>calls.push(["resume"])};
 const ctx=load(["travel-speech.js"],{speechSynthesis:synthesis,SpeechSynthesisUtterance:Utterance});
 const result=ctx.ROOTS_TRAVEL_SPEECH.speak("こんにちは","ja",{slow:true});ctx.ROOTS_TRAVEL_SPEECH.pause();ctx.ROOTS_TRAVEL_SPEECH.resume();ctx.ROOTS_TRAVEL_SPEECH.stop();
 assert.equal(result.rate,.72);assert.deepEqual(calls.map(item=>item[0]),["cancel","speak","pause","resume","cancel"]);
});
test("missing language voice fails gracefully and speech never autoplays",()=>{
 const ctx=load(["travel-speech.js"],{speechSynthesis:{getVoices:()=>[],cancel:()=>{}},SpeechSynthesisUtterance:function(){}});
 assert.equal(ctx.ROOTS_TRAVEL_SPEECH.speak("x","ja").ok,false);assert.doesNotMatch(source("travel-card-view.js"),/DOMContentLoaded[^]*\.speak\(/);
});
test("Travel UI exposes entry points, full-screen card, modes, privacy controls, and focus handling",()=>{
 const html=source("index.html"),view=source("travel-card-view.js"),css=source("styles.css");
 assert.match(html,/data-open-travel-mode/);assert.match(html,/id="travel-card-screen"[^>]*role="dialog"/);assert.match(html,/Short/);assert.match(html,/Detailed/);
 assert.match(html,/Slow speech/);assert.match(html,/Pause/);assert.match(html,/Resume/);assert.match(html,/clear-travel-destinations/);
 assert.match(view,/aria-live|travel-card-status/);assert.match(view,/event\.key==="Tab"/);assert.match(css,/travel-card-screen/);assert.match(css,/prefers-reduced-motion/);
});
test("rendered travel content is escaped and guarantee language is prohibited",()=>{
 const view=source("travel-card-view.js");assert.match(view,/const esc =/);assert.match(view,/esc\(entry\.termOriginal\)/);
 assert.doesNotMatch([source("travel-mode.js"),source("travel-language-packs.js"),view].join("\n"),/translation guarantees|guarantees the dish is safe/i);
});
test("animation uses a smaller phone, three bounded flash events, and no scan fade",()=>{
 const animation=source("home-animation.js"),css=source("styles.css");
 for(const state of ["scan_one_flash","scan_two_flash","scan_three_flash"])assert.match(animation,new RegExp(`\\["${state}", 110\\]`));
 assert.match(css,/\.phone-group[^}]*scale\(\.68\)/);assert.match(css,/\.state-scan_one_flash \.phone-flash/);assert.match(css,/\.scan-illus\.is-reduced \.phone-flash\{display:none\}/);
 for(const state of ["scan_one","scan_two","scan_three"])assert.match(css,new RegExp(`\\.state-${state} \\.phone-group,[^{]*\\.state-${state}_flash \\.phone-group \\{[^}]*opacity:1`));
 assert.match(animation,/class="phone-flash"[^>]*x="8"[^>]*width="102"/);assert.doesNotMatch(animation,/class="(?:page|screen)-flash"/);
});
test("main and phone camera packages reuse one canonical SVG source",()=>{
 const animation=source("home-animation.js"),uses=animation.match(/href="#roots-canonical-package"/g)||[];
 assert.match(animation,/<symbol id="roots-canonical-package"/);assert.equal(uses.length,2);
 assert.equal((animation.match(/class="package-body"/g)||[]).length,1);assert.equal((animation.match(/class="package-label"/g)||[]).length,1);assert.equal((animation.match(/class="package-leaf"/g)||[]).length,1);
});
test("Travel modules are cached but private IndexedDB data is not in Cache Storage",()=>{
 const sw=source("sw.js");["travel-storage.js","travel-glossary.js","travel-speech.js","travel-language-packs.js","travel-mode.js","travel-card-view.js"].forEach(file=>assert.match(sw,new RegExp(file.replaceAll(".","\\."))));
 assert.match(sw,/roots-shell-v5c-1/);assert.doesNotMatch(sw,/roots-travel-v1|travel-card-[a-z0-9]{6,}|roots-dining-v1/);
});
