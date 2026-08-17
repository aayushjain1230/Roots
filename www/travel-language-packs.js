(function (root) {
  "use strict";
  const VERSION = 1, MAX_BYTES = 524288;
  const clean = (value, limit = 1000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  const CORE = Object.freeze({
    es:{intro:"Tengo restricciones alimentarias.",check:"¿Podría consultar con la cocina?",thanks:"Gracias por ayudarme.",peanut:"Tengo alergia al cacahuate.",milk:"Tengo alergia a la leche.",egg:"Tengo alergia al huevo."},
    fr:{intro:"J’ai des restrictions alimentaires.",check:"Pourriez-vous vérifier auprès de la cuisine ?",thanks:"Merci de m’aider.",peanut:"Je suis allergique aux cacahuètes.",milk:"Je suis allergique au lait.",egg:"Je suis allergique aux œufs."},
    ja:{intro:"食事制限があります。",check:"厨房に確認していただけますか。",thanks:"ご協力ありがとうございます。",peanut:"ピーナッツアレルギーがあります。",milk:"乳アレルギーがあります。",egg:"卵アレルギーがあります。"},
    hi:{intro:"मेरे कुछ आहार संबंधी प्रतिबंध हैं।",check:"क्या आप रसोई से पुष्टि कर सकते हैं?",thanks:"मेरी मदद करने के लिए धन्यवाद।",peanut:"मुझे मूंगफली से एलर्जी है।",milk:"मुझे दूध से एलर्जी है।",egg:"मुझे अंडे से एलर्जी है।"},
    gu:{intro:"મારે આહાર સંબંધિત પ્રતિબંધો છે.",check:"કૃપા કરીને રસોડામાં તપાસશો?",thanks:"મને મદદ કરવા બદલ આભાર.",peanut:"મને મગફળીની એલર્જી છે.",milk:"મને દૂધની એલર્જી છે.",egg:"મને ઈંડાની એલર્જી છે."},
    ar:{intro:"لدي قيود غذائية.",check:"هل يمكنكم التأكد من المطبخ؟",thanks:"شكرًا لمساعدتي.",peanut:"لدي حساسية من الفول السوداني.",milk:"لدي حساسية من الحليب.",egg:"لدي حساسية من البيض."},
    he:{intro:"יש לי הגבלות תזונתיות.",check:"האם תוכלו לבדוק עם המטבח?",thanks:"תודה על העזרה.",peanut:"יש לי אלרגיה לבוטנים.",milk:"יש לי אלרגיה לחלב.",egg:"יש לי אלרגיה לביצים."},
    it:{intro:"Ho delle restrizioni alimentari.",check:"Potrebbe verificare con la cucina?",thanks:"Grazie per l’aiuto.",peanut:"Sono allergico alle arachidi.",milk:"Sono allergico al latte.",egg:"Sono allergico alle uova."},
    de:{intro:"Ich habe Ernährungseinschränkungen.",check:"Könnten Sie bitte in der Küche nachfragen?",thanks:"Vielen Dank für Ihre Hilfe.",peanut:"Ich habe eine Erdnussallergie.",milk:"Ich habe eine Milchallergie.",egg:"Ich habe eine Eierallergie."},
    ko:{intro:"저는 식이 제한이 있습니다.",check:"주방에 확인해 주시겠어요?",thanks:"도와주셔서 감사합니다.",peanut:"땅콩 알레르기가 있습니다.",milk:"우유 알레르기가 있습니다.",egg:"달걀 알레르기가 있습니다."},
    zh:{intro:"我有饮食限制。",check:"可以请您向厨房确认吗？",thanks:"谢谢您的帮助。",peanut:"我对花生过敏。",milk:"我对牛奶过敏。",egg:"我对鸡蛋过敏。"},
  });
  const labels = Object.freeze({ intro:"I have dietary restrictions.", check:"Could you please check with the kitchen?", thanks:"Thank you for helping me.", peanut:"I am allergic to peanuts.", milk:"I am allergic to milk.", egg:"I am allergic to eggs." });
  const fingerprint = (profile) => {
    const stable = JSON.stringify({ id:profile?.id,updatedAt:profile?.updatedAt,religiousDiets:profile?.religiousDiets,lifestyleDiets:profile?.lifestyleDiets,allergies:profile?.allergies,customRules:profile?.customRules,crossContact:profile?.crossContact });
    let hash = 2166136261; for (const char of stable) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(36);
  };
  const phrase = (id, language, category, sourceText, translatedText, extra) => ({ id,sourceText,translatedText:translatedText || sourceText,transliteration:"",language,category,profileRuleSource:extra?.rule || null,userReviewed:false,speechAvailable:true,version:VERSION,translationStatus:translatedText?"curated":"source_only" });
  function profileRestrictions(profile, language) {
    const records = [], jain = (profile.religiousDiets || []).find((item) => item.id === "jain" && item.enabled);
    const add = (id, text, rule) => records.push(phrase(id,language,"dietaryRestrictions",text,"",{rule}));
    if (jain) {
      add("diet-jain","I follow a Jain diet.","jain");
      const rules = [["avoidMeatFishSeafood","Please do not use meat, fish, or seafood."],["avoidEggs","Please do not use eggs."],["avoidOnionGarlic","Please do not use onion or garlic."],["avoidAllRootVegetables","Please do not use root vegetables."],["avoidHoney","Please do not use honey."],["avoidAnimalDerivedAdditives","Please do not use animal-derived additives."],["avoidFermentedIngredients","Please do not use fermented ingredients."],["avoidMushrooms","Please do not use mushrooms."],["avoidArtificialAdditives","Please do not use artificial additives."]];
      rules.filter(([key])=>jain.options?.[key]).forEach(([key,text])=>add(`jain-${key}`,text,`jain:${key}`));
    }
    [...(profile.religiousDiets || []),...(profile.lifestyleDiets || [])].filter((item)=>item.enabled && item.id!=="jain").forEach((item)=>add(`diet-${item.id}`,`I follow a ${clean(item.id).replaceAll("_"," ")} diet.`,item.id));
    (profile.customRules || []).filter((item)=>item.severity!=="preference").forEach((item)=>add(`custom-${item.id||records.length}`,`${item.severity==="caution"?"Please ask about":"Please avoid"} ${clean(item.label)}.`,`custom:${item.id||item.normalizedTerm}`));
    return records;
  }
  function createPack(config) {
    const language = clean(config?.language, 16).toLowerCase(), region = clean(config?.region, 8).toUpperCase(), profile = config?.profile || {};
    if (!language || !region) throw new TypeError("Language and destination region are required.");
    const dictionary = CORE[language] || {};
    const allergens = (profile.allergies || []).map((item) => { const id = item.id || item.normalizedTerm, key = ["peanut","milk","egg"].includes(id) ? id : ""; return phrase(`allergy-${id}`,language,"allergens",`I am allergic to ${clean(item.label || id)}.`,dictionary[key],{rule:`allergy:${id}`}); });
    const dietary = profileRestrictions(profile,language);
    const glossary = root.ROOTS_TRAVEL_GLOSSARY?.getRelevant(profile,{countryCode:region}) || [];
    const pack = {
      schemaVersion:1,id:`${language}-${region}-roots-dining-v${VERSION}-${fingerprint(profile)}`,language,region,version:VERSION,
      generatedAt:new Date().toISOString(),source:"roots_curated_and_generated",profileFingerprint:fingerprint(profile),
      sections:{
        introduction:[phrase("intro",language,"introduction",labels.intro,dictionary.intro)],
        dietaryRestrictions:dietary,allergens,crossContact:[phrase("shared-prep",language,"crossContact","Please tell me if shared equipment is used.","")],
        preparationQuestions:[phrase("check-kitchen",language,"preparationQuestions",labels.check,dictionary.check)],
        modificationRequests:[],thankYou:[phrase("thanks",language,"thankYou",labels.thanks,dictionary.thanks)],
        ingredientGlossary:glossary,
      },downloadedAt:null,sizeBytes:0,
    };
    pack.sizeBytes = new TextEncoder().encode(JSON.stringify(pack)).length;
    if (pack.sizeBytes > MAX_BYTES) throw new Error("This language pack is too large to store safely.");
    return pack;
  }
  function validate(pack) {
    if (!pack || pack.schemaVersion !== 1 || pack.version !== VERSION || !/^[a-z]{2,3}$/.test(pack.language) || !/^[A-Z]{2}$/.test(pack.region) || !pack.profileFingerprint || !pack.sections) return {valid:false,error:"Malformed language pack."};
    const required = ["dietaryRestrictions","allergens","crossContact","preparationQuestions","thankYou","ingredientGlossary"];
    if (required.some((key) => !Array.isArray(pack.sections[key]))) return {valid:false,error:"Language pack sections are incomplete."};
    const bytes = new TextEncoder().encode(JSON.stringify(pack)).length;
    if (bytes > MAX_BYTES) return {valid:false,error:"Language pack exceeds the size limit."};
    return {valid:true,sizeBytes:bytes};
  }
  async function download(pack) {
    const result = validate(pack); if (!result.valid) throw new Error(result.error);
    const record = {...pack,sizeBytes:result.sizeBytes,downloadedAt:new Date().toISOString()};
    await root.ROOTS_TRAVEL_STORAGE.put("packs",record); return record;
  }
  async function translatePack(pack) {
    const result=validate(pack); if(!result.valid) throw new Error(result.error);
    const phrases=Object.values(pack.sections).flat().filter((item)=>item?.sourceText&&item.translationStatus==="source_only");
    if(!phrases.length) return pack;
    if(root.navigator?.onLine===false) throw new Error("Connect to the internet to prepare new offline translations.");
    if(!root.BIJ_OCR?.generateText) throw new Error("Translation is not configured for this build.");
    const prompt=`Translate the following fixed ROOTS travel phrases into language ${pack.language}. Do not add, remove, reorder, answer, soften, or strengthen dietary restrictions. Preserve IDs. Transliteration must be separate and only included when useful. Return JSON {"phrases":[{"id","translatedText","transliteration"}]}. ${JSON.stringify(phrases.map(({id,sourceText})=>({id,sourceText})))}`;
    const parsed=JSON.parse(await root.BIJ_OCR.generateText(prompt,{temperature:0,json:true})), translated=Array.isArray(parsed?.phrases)?parsed.phrases:[];
    if(translated.length!==phrases.length||translated.some((item,index)=>item.id!==phrases[index].id||!clean(item.translatedText))) throw new Error("The translation changed the language-pack structure and was rejected.");
    const byId=new Map(translated.map((item)=>[item.id,item]));
    const sections=Object.fromEntries(Object.entries(pack.sections).map(([key,items])=>[key,items.map((item)=>byId.has(item.id)?{...item,translatedText:clean(byId.get(item.id).translatedText),transliteration:clean(byId.get(item.id).transliteration||""),translationStatus:"generated"}:item)]));
    const next={...pack,sections,generatedAt:new Date().toISOString()}; next.sizeBytes=new TextEncoder().encode(JSON.stringify(next)).length;
    if(next.sizeBytes>MAX_BYTES) throw new Error("This language pack is too large to store safely."); return next;
  }
  async function update(packId, config) {
    const old = await root.ROOTS_TRAVEL_STORAGE.get("packs",packId);
    try { const next = createPack(config); return await download(next); } catch (error) { if (old) return {...old,updateError:error.message}; throw error; }
  }
  const installed = () => root.ROOTS_TRAVEL_STORAGE.all("packs");
  async function getForLanguage(language, region) { return (await installed()).find((pack) => pack.language === language && pack.region === region) || null; }
  async function markReviewed(packId, phraseId, reviewed) {
    const pack=await root.ROOTS_TRAVEL_STORAGE.get("packs",packId); if(!pack)throw new Error("Language pack not found.");
    let found=false; const sections=Object.fromEntries(Object.entries(pack.sections).map(([key,items])=>[key,items.map((item)=>{if(item.id!==phraseId)return item;found=true;return{...item,userReviewed:reviewed!==false};})]));
    if(!found)throw new Error("Phrase not found.");const next={...pack,sections};await root.ROOTS_TRAVEL_STORAGE.put("packs",next);return next;
  }
  root.ROOTS_TRAVEL_PACKS = { createPack, translatePack, downloadPack:download, validatePack:validate, getInstalled:installed, getForLanguage, update, markReviewed, remove:(id)=>root.ROOTS_TRAVEL_STORAGE.remove("packs",id), fingerprint, constants:{VERSION,MAX_BYTES,CORE} };
})(typeof window !== "undefined" ? window : globalThis);
