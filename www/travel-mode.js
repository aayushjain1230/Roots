(function (root) {
  "use strict";
  const SETTINGS_KEY = "roots-travel-settings-v1";
  const COUNTRIES = Object.freeze([
    ["JP","Japan","ja","JPY",["ja","en"]],["IN","India","hi","INR",["hi","gu","en"]],["MX","Mexico","es","MXN",["es","en"]],
    ["ES","Spain","es","EUR",["es","en"]],["FR","France","fr","EUR",["fr","en"]],["IT","Italy","it","EUR",["it","en"]],
    ["DE","Germany","de","EUR",["de","en"]],["GB","United Kingdom","en","GBP",["en"]],["IL","Israel","he","ILS",["he","ar","en"]],
    ["AE","United Arab Emirates","ar","AED",["ar","en"]],["KR","South Korea","ko","KRW",["ko","en"]],["CN","China","zh","CNY",["zh","en"]],
  ].map(([code,name,language,currency,languages])=>Object.freeze({countryCode:code,countryName:name,primaryLanguage:language,currencyCode:currency,languages})));
  const LANGUAGES = Object.freeze({ja:"Japanese",es:"Spanish",fr:"French",hi:"Hindi",gu:"Gujarati",ar:"Arabic",he:"Hebrew",it:"Italian",de:"German",ko:"Korean",zh:"Mandarin Chinese",en:"English"});
  const settings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { return {}; } };
  const saveSettings = (value) => localStorage.setItem(SETTINGS_KEY,JSON.stringify({...settings(),...value}));
  function destination(countryCode, extra) {
    const country = COUNTRIES.find((item)=>item.countryCode===countryCode); if (!country) throw new TypeError("Choose a supported destination.");
    const now = new Date().toISOString();
    return {schemaVersion:1,id:extra?.id||`travel-${countryCode.toLowerCase()}-${Date.now().toString(36)}`,...country,region:extra?.region||null,city:String(extra?.city||"").slice(0,120)||null,selectedLanguages:extra?.selectedLanguages||[country.primaryLanguage,"en"],createdAt:extra?.createdAt||now,updatedAt:now,offlinePackIds:extra?.offlinePackIds||[]};
  }
  async function setDestination(value) {
    const record = value?.schemaVersion===1 ? {...value,updatedAt:new Date().toISOString()} : destination(value?.countryCode||value,value);
    await root.ROOTS_TRAVEL_STORAGE.put("destinations",record); saveSettings({destinationId:record.id,language:record.primaryLanguage}); return record;
  }
  async function currentDestination() { const id=settings().destinationId; return id?root.ROOTS_TRAVEL_STORAGE.get("destinations",id):null; }
  function setLanguage(language) { if (!LANGUAGES[language]) throw new TypeError("Choose a supported language."); saveSettings({language}); return language; }
  async function prepareCard(options) {
    const profile = options?.profile||root.ROOTS_PROFILE?.getActiveProfile?.(), destinationRecord=options?.destination||await currentDestination();
    if (!profile||!destinationRecord) throw new Error("Choose a destination and active profile first.");
    const language=options?.language||settings().language||destinationRecord.primaryLanguage;
    const pack=await root.ROOTS_TRAVEL_PACKS.getForLanguage(language,destinationRecord.countryCode);
    const base=root.ROOTS_DINING_CARD.generate({profile,restaurant:options?.restaurant||{},questionSet:options?.questionSet});
    const allergyPhrases=pack?.sections?.allergens||[], dietaryPhrases=pack?.sections?.dietaryRestrictions||[], translatedQuestions=new Map((options?.translatedQuestions?.questions||[]).map((item)=>[item.id,item]));
    const card={schemaVersion:1,id:`travel-card-${Date.now().toString(36)}`,destination:destinationRecord,language,currencyCode:destinationRecord.currencyCode,profileFingerprint:root.ROOTS_TRAVEL_PACKS.fingerprint(profile),profileId:profile.id,contentLevel:options?.contentLevel||"standard",sourceCard:base,
      effectiveRules:root.ROOTS_EFFECTIVE_RULES?.expand?.(profile)||null,
      evidenceContext:{questionSetId:options?.questionSet?.id||null,sourceEvidenceIds:[...new Set((options?.questionSet?.questions||[]).flatMap((item)=>item.sourceEvidenceIds||[]))],generatedFromDeterministicQuestions:true},
      sections:{allergies:allergyPhrases,religiousAndDietary:dietaryPhrases,questions:(options?.questionSet?.questions||[]).map((item)=>({id:item.id,sourceText:item.question,translatedText:translatedQuestions.get(item.id)?.question||root.ROOTS_TRAVEL_GLOSSARY.adaptQuestion(item.question,destinationRecord.countryCode),transliteration:translatedQuestions.get(item.id)?.transliteration||"",sourceQuestionId:item.id,sourceEvidenceIds:item.sourceEvidenceIds,priority:item.priority,translationStatus:translatedQuestions.has(item.id)?"saved_translation":"regional_wording"})),thankYou:pack?.sections?.thankYou||[]},
      translationSource:pack?"offline_pack":"source_only",createdAt:new Date().toISOString(),profileUpdatedAt:profile.updatedAt};
    await root.ROOTS_TRAVEL_STORAGE.put("cards",card); return card;
  }
  async function recentPhrase(record) {
    const phrase={id:`phrase-${Date.now().toString(36)}`,sourceText:String(record.sourceText||"").slice(0,1000),translatedText:String(record.translatedText||"").slice(0,1000),language:record.language,createdAt:new Date().toISOString()};
    await root.ROOTS_TRAVEL_STORAGE.put("phrases",phrase); const all=await root.ROOTS_TRAVEL_STORAGE.all("phrases");
    await Promise.all(all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(30).map((item)=>root.ROOTS_TRAVEL_STORAGE.remove("phrases",item.id))); return phrase;
  }
  root.ROOTS_TRAVEL = {open:(options,button)=>root.ROOTS_TRAVEL_VIEW?.open(button,options),setDestination,setLanguage,useProfile:(id)=>id,prepareCard,openSavedCard:(id)=>root.ROOTS_TRAVEL_CARD?.openSaved(id),destroy:()=>root.ROOTS_TRAVEL_VIEW?.close(),getCurrentDestination:currentDestination,getSettings:settings,getCountries:()=>COUNTRIES,getLanguages:()=>LANGUAGES,recentPhrase};
})(typeof window !== "undefined" ? window : globalThis);
