(function(root){
"use strict";
const K=root.ROOTS_INGREDIENT_KNOWLEDGE,P=root.ROOTS_INGREDIENT_PARSER,ENGINE_VERSION=2,STATUS={SAFE:0,PREFERENCE:1,CAUTION:2,AVOID:3};
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const phraseAliases=[...K.aliasIndex.entries()].sort((a,b)=>b[0].length-a[0].length);
const boundary=(text,alias)=>{let start=-1;while((start=text.indexOf(alias,start+1))>=0){const before=start?text[start-1]:"",after=text[start+alias.length]||"";if((!before||/[^a-z0-9]/i.test(before))&&(!after||/[^a-z0-9]/i.test(after)))return true;}return false;};
function resolveIngredient(value){
 const n=typeof value==="string"?P.normalizeIngredientText(value):P.normalizeIngredientText(value?.normalizedName||value?.name||value?.rawName);
 if(n.isFreeClaim)return {record:null,normalizedName:n.normalizedName,matchType:"free_claim",evidenceLevel:"confirmed"};
 let rec=K.aliasIndex.get(n.normalizedName)||root.ROOTS_OFFLINE_KNOWLEDGE?.findAlias?.(n.normalizedName),matchType=n.ocrCorrection?"ocr_correction":"exact";
 if(!rec&&root.ROOTS_OFFLINE_KNOWLEDGE){const dynamic=root.ROOTS_OFFLINE_KNOWLEDGE.getRecords().flatMap(record=>[record.label,...record.aliases].map(alias=>[String(alias).toLowerCase(),record])).sort((a,b)=>b[0].length-a[0].length).find(([alias])=>boundary(n.normalizedName,alias));if(dynamic){rec=dynamic[1];matchType="whole_phrase";}}
 if(!rec){const candidate=phraseAliases.find(([alias])=>boundary(n.normalizedName,alias));if(candidate){rec=candidate[1];matchType="whole_phrase";}}
 return {record:rec||null,normalizedName:n.normalizedName,matchType,evidenceLevel:n.ocrCorrection?"likely":"confirmed",ocrCorrection:n.ocrCorrection};
}
const active=(p,g,id)=>!!p?.[g]?.find(x=>x.id===id)?.enabled;
const entry=(p,g,id)=>p?.[g]?.find(x=>x.id===id);
const has=(r,c)=>r?.categories?.includes(c);
const any=(r,cs)=>cs.some(c=>has(r,c));
function ruleMatchesRecord(rule,rec){
 if(!rec)return false;
 if(rule.id==="rule-jain-animal-additives"&&any(rec,["dairy","egg","honey"]))return false;
 return (rule.ingredientIds||[]).includes(rec.id)||(rule.categories||[]).some(c=>has(rec,c))||(rule.aliasIds||[]).some(c=>has(rec,c));
}
function reason(id,category,rule,severity,label,evidenceType,evidenceLevel,extra){return {id,category,profileRuleId:rule,severity,label,evidenceType:evidenceType||"direct_ingredient",evidenceLevel:evidenceLevel||"confirmed",...(extra||{})};}
function addReason(reasons,r){if(!reasons.some(x=>x.id===r.id))reasons.push(r);}
function statusFromReasons(rs){let s="SAFE";rs.forEach(r=>{const x=r.severity==="avoid"?"AVOID":r.severity==="caution"?"CAUTION":r.severity==="preference"?"PREFERENCE":"SAFE";if(STATUS[x]>STATUS[s])s=x;});return s;}
const priority={allergy:1,declared_contains:2,cross_contact:3,religious:4,lifestyle:5,custom_avoid:6,source_dependent:7,custom_caution:8,preference:9};
function sortReasons(rs){return rs.map((x,i)=>({...x,_i:i})).sort((a,b)=>(priority[a.category]||50)-(priority[b.category]||50)||a._i-b._i).map(({_i,...x})=>x);}
function matchesTerm(text,term){const normalized=P.normalizeIngredientText(term).normalizedName;return normalized&&boundary(text,normalized);}
function phase6RestrictionReasons(profile,n,trigger){
 const selected=root.ROOTS_RESTRICTIONS?.getSelected?.(profile)||[];
 selected.filter(item=>item.source!=="legacy_profile").forEach(selection=>{
  const definition=root.ROOTS_RESTRICTIONS.getRestriction(selection.id);if(!definition)return;
  const settings={...definition.defaultSettings,...(selection.settings||{})},rules=definition.rules||{};
  if((rules.exclusions||[]).some(term=>matchesTerm(n,term)))return;
  let direct=(rules.direct||[]).some(term=>matchesTerm(n,term));
  let caution=(rules.caution||[]).some(term=>matchesTerm(n,term));
  const source=(rules.sourceDependent||[]).some(term=>matchesTerm(n,term));
  const quantity=(rules.quantityDependent||[]).some(term=>matchesTerm(n,term));
  const preparation=(rules.preparationDependent||[]).some(term=>matchesTerm(n,term));
  if(selection.id==="tree_nut_allergy_group"&&direct){
   const chosen=(settings.selectedTreeNuts||[]).map(x=>String(x).replace(/_/g," "));
   if(chosen.length&&!chosen.some(term=>matchesTerm(n,term)))return;
  }
  if(selection.id==="alpha_gal_syndrome"){
   if(matchesTerm(n,"carrageenan"))return;
   if(matchesTerm(n,"gelatin")){if(!settings.avoidGelatin)return;direct=true;caution=false;}
   if(["milk","cream","butter","whey","casein"].some(term=>matchesTerm(n,term))){if(!settings.avoidDairy)return;direct=true;}
  }
  if(selection.id==="celiac_disease"&&matchesTerm(n,"oats")){
   if(/\bcertified[\s-]+gluten[\s-]+free\b/.test(n))return;
   if(!settings.avoidOatsUnlessCertified)caution=false;
  }
  if(selection.id==="gluten_sensitivity"&&matchesTerm(n,"oats")&&settings.oatsAllowed)caution=false;
  if(selection.id==="oral_allergy_syndrome"&&/\bcooked\b/.test(n)&&settings.rawOnly)return;
  const category=definition.type==="preference"?"preference":definition.type==="allergy"?"allergy":definition.type;
  if(preparation||selection.id==="oral_allergy_syndrome"&&direct)trigger(selection.id,category,"caution",`${definition.label} depends on how this ingredient is prepared.`,`restriction-${selection.id}-${n}`,"needs_confirmation",{evidenceTypeOverride:"preparation_dependent",restrictionType:definition.type,userSettings:settings});
  else if(quantity)trigger(selection.id,category,"caution",`${definition.label} depends on amount or serving size; confirm the quantity.`,`restriction-${selection.id}-${n}`,"needs_confirmation",{evidenceTypeOverride:"quantity_dependent",restrictionType:definition.type,userSettings:settings});
  else if(source)trigger(selection.id,"source_dependent","caution",`${definition.label} depends on the ingredient source; confirm with the manufacturer.`,`restriction-${selection.id}-${n}`,"needs_confirmation",{evidenceTypeOverride:"source_dependent",restrictionType:definition.type,userSettings:settings});
  else if(direct){
   const severity=definition.type==="preference"?"preference":definition.type==="sensitivity"?"caution":"avoid";
   trigger(selection.id,category,severity,`${definition.label} is triggered by ${n}.`,`restriction-${selection.id}-${n}`,"confirmed",{restrictionType:definition.type,userSettings:settings});
  }else if(caution)trigger(selection.id,category,"caution",`${n} is a possible trigger for ${definition.label}; individual guidance may vary.`,`restriction-${selection.id}-${n}`,"likely",{restrictionType:definition.type,userSettings:settings});
 });
}
function evaluateIngredient(ingredient,profile,context){
 const ctx=context||{},resolved=resolveIngredient(ingredient),rec=resolved.record,n=resolved.normalizedName,rs=[],triggeredRules=[];
 const raw=ingredient?.rawName||ingredient?.name||String(ingredient||""), evidenceType=ctx.evidenceType||"direct_ingredient";
 function trigger(rule,category,severity,label,id,level,extra){triggeredRules.push(rule);addReason(rs,reason(id||`${rule}-${rec?.id||n}`,category,rule,severity,label,evidenceType,level||resolved.evidenceLevel,extra));}
 const allergyMatches=(profile?.allergies||[]).filter(a=>a.type==="built_in"?(rec?.allergens||[]).includes(a.id)||has(rec,a.id):new RegExp(`(?:^|[^a-z0-9])${escRe(a.normalizedTerm)}(?:$|[^a-z0-9])`,"i").test(n));
 allergyMatches.forEach(a=>trigger(a.id,"allergy","avoid",`Contains ${a.label.toLowerCase()}, which matches your allergy.`,`allergy-${a.id}-${rec?.id||n}`,"confirmed"));
 if(rec){
  const jain=entry(profile,"religiousDiets","jain"),jo=jain?.options||{};
  const animal=any(rec,["meat","fish","shellfish","egg","pork"]),animalAdd=any(rec,["animal_derived","insect_derived"])&&!any(rec,["dairy","egg","honey"]);
  if(jain?.enabled){
   const effective=root.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile?.({profile,date:ctx.date||ctx.evaluatedAt||new Date()});
   const rules=effective?.effectiveRules||[];
   const matched=rules.filter(rule=>ruleMatchesRecord(rule,rec));
   if(matched.length){
    matched.forEach(rule=>{
     const severity=rule.effect==="caution"||rec.sourceDependent?"caution":"avoid";
     const sourceUnknown=severity==="caution";
     const label=sourceUnknown?`${rec.label} source needs confirmation for your Jain settings.`:`Your Jain settings exclude ${rec.label.toLowerCase()}.`;
     trigger("jain",sourceUnknown?"source_dependent":"religious",severity,label,`${rule.id}-${rec.id}`,sourceUnknown?"needs_confirmation":"confirmed",{jainRuleId:rule.id,jainRuleType:rule.type,activeObservance:effective?.activeObservance||null});
    });
   } else if(!effective){
    const conflict=(jo.avoidMeatFishSeafood&&any(rec,["meat","fish","shellfish"]))||(jo.avoidEggs&&has(rec,"egg"))||(jo.avoidOnionGarlic&&has(rec,"onion_garlic"))||(jo.avoidAllRootVegetables&&has(rec,"root_vegetable"))||(jo.avoidHoney&&has(rec,"honey"))||(jo.avoidAnimalDerivedAdditives&&animalAdd)||(jo.avoidMushrooms&&has(rec,"mushroom"))||(jo.avoidArtificialAdditives&&has(rec,"artificial_additive"))||(jo.avoidFermentedIngredients&&has(rec,"fermentation"));
    if(conflict)trigger("jain","religious",rec.sourceDependent?"caution":"avoid",rec.sourceDependent?`${rec.label} source needs confirmation for your Jain settings.`:`Your Jain settings exclude ${rec.label.toLowerCase()}.`,null,rec.sourceDependent?"needs_confirmation":"confirmed");
    else if(rec.id==="natural_flavors"&&jo.avoidAnimalDerivedAdditives)trigger("jain","source_dependent","caution","Natural flavor sources need confirmation for your Jain settings.",null,"needs_confirmation");
   } else if(rec.id==="natural_flavors"&&jo.avoidAnimalDerivedAdditives)trigger("jain","source_dependent","caution","Natural flavor sources need confirmation for your Jain settings.",null,"needs_confirmation");
  }
  if(active(profile,"religiousDiets","halal")){
   if(any(rec,["pork","blood","alcohol","carnivorous_animal","non_halal_meat"])||rec.id==="porcine_gelatin")trigger("halal","religious","avoid",`${rec.label} is not compatible with Halal ingredient rules.`);
   else if((any(rec,["meat","source_dependent","enzyme"])&&!any(rec,["fish","plant_derived","fermentation"]))||rec.id==="natural_flavors")trigger("halal","source_dependent","caution",`${rec.label} source or certification must be verified for Halal compatibility.`,null,"needs_confirmation",{certificationCouldResolve:true});
  }
  if(active(profile,"religiousDiets","kosher")){
   if(any(rec,["pork","shellfish","blood","non_kosher_animal"]))trigger("kosher","religious","avoid",`${rec.label} is not compatible with Kosher ingredient rules.`);
   else if((any(rec,["meat","source_dependent","enzyme"])&&!has(rec,"plant_derived"))||rec.id==="natural_flavors"||has(rec,"grape_product"))trigger("kosher","source_dependent","caution",`${rec.label} source or certification must be verified for Kosher compatibility.`,null,"needs_confirmation",{certificationCouldResolve:true});
  }
  const hindu=entry(profile,"religiousDiets","hindu_vegetarian");if(hindu?.enabled&&(any(rec,["meat","fish","shellfish"])||(has(rec,"egg")&&!hindu.options.allowEggs)))trigger("hindu_vegetarian","religious","avoid",`${rec.label} conflicts with your Hindu Vegetarian settings.`);
  if(active(profile,"lifestyleDiets","vegetarian")&&(any(rec,["meat","fish","shellfish"])||animalAdd))trigger("vegetarian","lifestyle","avoid",`${rec.label} is not vegetarian.`);
  if(active(profile,"lifestyleDiets","vegan")){
   if(any(rec,["meat","fish","shellfish","egg","dairy","honey","animal_derived","insect_derived"]))trigger("vegan","lifestyle","avoid",`${rec.label} is animal-derived and not vegan.`);
   else if(rec.sourceDependent)trigger("vegan","source_dependent","caution",`${rec.label} source must be verified for Vegan compatibility.`,null,"needs_confirmation");
  }
  if(active(profile,"lifestyleDiets","pescatarian")){
   if(has(rec,"meat")&&!any(rec,["fish","shellfish"]))trigger("pescatarian","lifestyle","avoid",`${rec.label} is a land-animal ingredient.`);
   else if(rec.id==="gelatin")trigger("pescatarian","source_dependent","caution","Gelatin source must be verified for Pescatarian compatibility.",null,"needs_confirmation");
  }
  if(active(profile,"lifestyleDiets","dairy_free")&&has(rec,"dairy"))trigger("dairy_free","lifestyle","avoid",`${rec.label} contains dairy.`);
  if(active(profile,"lifestyleDiets","egg_free")&&has(rec,"egg"))trigger("egg_free","lifestyle","avoid",`${rec.label} contains egg.`);
  if(active(profile,"lifestyleDiets","gluten_free")){
   if(has(rec,"gluten_grain")&&rec.id!=="oats"&&rec.id!=="certified_gf_oats")trigger("gluten_free","lifestyle","avoid",`${rec.label} contains gluten.`);
   else if(rec.id==="oats"||rec.id==="modified_food_starch"||rec.id==="brewers_yeast")trigger("gluten_free","source_dependent","caution",`${rec.label} needs confirmation for Gluten-Free compatibility.`,null,"needs_confirmation");
  }
 }
 phase6RestrictionReasons(profile,n,(rule,category,severity,label,id,level,extra)=>{
  const evidenceOverride=extra?.evidenceTypeOverride;
  trigger(rule,category,severity,label,id,level,{...(extra||{}),...(evidenceOverride?{evidenceType:evidenceOverride}:{})});
  if(evidenceOverride&&rs.length)rs[rs.length-1].evidenceType=evidenceOverride;
 });
 (profile?.customRules||[]).forEach(rule=>{const terms=[rule.normalizedTerm,...(rule.aliases||[])];if(terms.some(t=>new RegExp(`(?:^|[^a-z0-9])${escRe(t)}(?:$|[^a-z0-9])`,"i").test(n))){const cat=rule.severity==="avoid"?"custom_avoid":rule.severity==="caution"?"custom_caution":"preference";trigger(rule.id,cat,rule.severity,`${rule.label} matches your custom ${rule.severity==="preference"?"preference":rule.severity+" rule"}.`,`custom-${rule.id}`);}});
 (profile?.dislikes||[]).forEach(d=>{if(new RegExp(`(?:^|[^a-z0-9])${escRe(d.normalizedTerm)}(?:$|[^a-z0-9])`,"i").test(n))trigger(d.id,"preference","preference",`You marked ${d.label.toLowerCase()} as disliked.`,`dislike-${d.id}`);});
 const childResults=(ingredient?.subingredients||[]).map(x=>evaluateIngredient(x,profile,ctx));const highest=childResults.reduce((a,x)=>STATUS[x.status]>STATUS[a.status]?x:a,{status:"SAFE"});
 if(STATUS[highest.status]>STATUS[statusFromReasons(rs)])addReason(rs,reason(`child-${highest.matchedIngredientId||highest.normalizedName}`,"child",highest.status.toLowerCase(),highest.status==="AVOID"?"avoid":highest.status==="CAUTION"?"caution":"preference",`Contains ${highest.displayName}.`,"subingredient",highest.evidenceLevel));
 const sorted=sortReasons(rs),status=statusFromReasons(sorted);
 const evaluated={engineVersion:ENGINE_VERSION,ingredientKnowledgeVersion:K.version,profileSchemaVersion:profile?.schemaVersion||null,rawName:raw,displayName:rec?.label||ingredient?.name||raw,normalizedName:n,matchedIngredientId:rec?.id||null,matchedAliases:rec?.aliases||[],matchType:resolved.matchType,status,reasons:dedupeLabels(sorted),triggeredRules:[...new Set(triggeredRules)],subingredientResults:childResults,evidenceLevel:sorted.some(x=>x.evidenceLevel==="needs_confirmation")?"needs_confirmation":resolved.evidenceLevel,sourceDependent:!!rec?.sourceDependent,verificationQuestions:sorted.filter(x=>x.evidenceLevel!=="confirmed").map(x=>`Can you confirm the source, amount, or preparation of ${rec?.label||n}?`).slice(0,1)};
 return root.ROOTS_RULE_TRACE?.attach?.(evaluated,{region:profile?.region,userSettings:Object.fromEntries((profile?.restrictions||[]).map(x=>[x.id,x.settings||{}]))})||evaluated;
}
function dedupeLabels(rs){const seen=new Set();return rs.filter(r=>{const k=r.label.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});}
function crossContactResults(items,profile,key,evidenceType){const action=profile?.crossContact?.[key]||"caution";if(action==="ignore")return[];return (items||[]).map(i=>{const base=evaluateIngredient(i,profile,{evidenceType});const legacyRelevant=(profile?.allergies||[]).some(a=>a.type==="built_in"?(base.matchedIngredientId&&((K.byId.get(base.matchedIngredientId)?.allergens||[]).includes(a.id)||has(K.byId.get(base.matchedIngredientId),a.id))):new RegExp(`\\b${escRe(a.normalizedTerm)}\\b`,"i").test(base.normalizedName));const restrictionRelevant=(root.ROOTS_RESTRICTIONS?.getSelected?.(profile)||[]).filter(x=>x.source!=="legacy_profile").some(x=>{const d=root.ROOTS_RESTRICTIONS.getRestriction(x.id);return d?.type==="allergy"&&[...(d.rules?.direct||[]),...(d.rules?.sourceDependent||[])].some(t=>matchesTerm(base.normalizedName,t));});if(!legacyRelevant&&!restrictionRelevant)return null;const label=`${evidenceType==="declared_contains"?"Contains":evidenceType==="declared_may_contain"?"May contain":evidenceType==="shared_equipment"?"Shared equipment with":"Shared facility handles"} ${base.displayName}.`;return {...base,status:action==="avoid"?"AVOID":"CAUTION",reasons:[reason(`${evidenceType}-${base.normalizedName}` ,evidenceType==="declared_contains"?"declared_contains":"cross_contact","allergy",action,label,evidenceType,"confirmed")]};}).filter(Boolean);}
function aggregateProductVerdict(results){const verdict=results.some(x=>x.status==="AVOID")?"AVOID":results.some(x=>x.status==="CAUTION")?"CAUTION":"SAFE";return verdict;}
function evaluateParsedProduct(product,profile,options){
 const task=root.ROOTS_PERFORMANCE?.startTask?.("dietary_evaluation",{count:(product.ingredients||[]).length});
 const evalContext={evaluatedAt:options?.evaluatedAt,date:options?.date,sourceType:options?.sourceType};
 const direct=(product.ingredients||[]).map(i=>evaluateIngredient(i,profile,evalContext)),contains=crossContactResults(product.contains,profile,"contains","declared_contains"),may=crossContactResults(product.mayContain,profile,"mayContain","declared_may_contain"),equip=crossContactResults(product.sharedEquipment,profile,"sharedEquipment","shared_equipment"),facility=crossContactResults(product.sharedFacility,profile,"sharedFacility","shared_facility");
 let all=[...direct,...contains,...may,...equip,...facility];
 const explicitSelections=(root.ROOTS_RESTRICTIONS?.getSelected?.(profile)||[]).filter(item=>item.source!=="legacy_profile");
 const addProductEvidence=(selection,status,label,evidenceType,value)=>{
  const definition=root.ROOTS_RESTRICTIONS.getRestriction(selection.id);
  const item={status,displayName:definition.label,normalizedName:selection.id,reasons:[reason(`product-${selection.id}-${evidenceType}`,definition.type,selection.id,status==="AVOID"?"avoid":"caution",label,evidenceType,value==null?"needs_confirmation":"confirmed",{restrictionType:definition.type,userSettings:selection.settings||{},evidenceValue:value})],subingredientResults:[],engineVersion:ENGINE_VERSION,ingredientKnowledgeVersion:K.version,evidenceLevel:value==null?"needs_confirmation":"confirmed"};
  all.push(root.ROOTS_RULE_TRACE?.attach?.(item,{region:profile?.region,userSettings:{[selection.id]:selection.settings||{}}})||item);
 };
 const certifications=(product.certifications||[]).map(value=>String(value).toLowerCase());
 explicitSelections.forEach(selection=>{
  const settings={...(root.ROOTS_RESTRICTIONS.getRestriction(selection.id)?.defaultSettings||{}),...(selection.settings||{})};
  if(selection.id==="celiac_disease"&&settings.requireCertifiedGlutenFree&&!certifications.some(value=>/\b(gluten[\s-]*free|gfco)\b/.test(value))){
   addProductEvidence(selection,"CAUTION","A recognized gluten-free certification was not present in the available product evidence.","certification",null);
  }
  if(selection.id==="low_sodium"){
   const sodium=Number(product.nutrition?.sodiumMgPerServing??product.nutrition?.sodiumMg??product.nutrition?.sodium_mg);
   if(Number.isFinite(sodium)){
    if(sodium>Number(settings.maxMgPerServing||140))addProductEvidence(selection,"AVOID",`Sodium is ${sodium} mg per serving, above your ${Number(settings.maxMgPerServing||140)} mg limit.`,"nutrition_quantity",sodium);
   }else addProductEvidence(selection,"CAUTION","Sodium per serving is missing, so ROOTS cannot compare this product with your limit.","nutrition_quantity",null);
  }
  if(selection.id==="renal_diet"){
   const nutrition=product.nutrition||{};
   const missing=[settings.trackSodium&&nutrition.sodiumMgPerServing==null&&nutrition.sodiumMg==null&&nutrition.sodium_mg==null?"sodium":null,settings.trackPotassium&&nutrition.potassiumMgPerServing==null&&nutrition.potassiumMg==null?"potassium":null,settings.trackPhosphorus&&nutrition.phosphorusMgPerServing==null&&nutrition.phosphorusMg==null?"phosphorus":null].filter(Boolean);
   if(missing.length)addProductEvidence(selection,"CAUTION",`${missing.join(", ")} nutrition evidence is missing; confirm it for your renal-diet settings.`,"nutrition_quantity",null);
  }
 });
 if(active(profile,"religiousDiets","kosher")&&direct.some(x=>has(K.byId.get(x.matchedIngredientId),"meat"))&&direct.some(x=>has(K.byId.get(x.matchedIngredientId),"dairy")))all.push({status:"AVOID",displayName:"Meat and dairy combination",normalizedName:"meat dairy combination",reasons:[reason("kosher-meat-dairy","religious","kosher","avoid","Contains an explicit meat and dairy combination.","direct_ingredient","confirmed")],subingredientResults:[],engineVersion:1,ingredientKnowledgeVersion:K.version});
 const verdict=aggregateProductVerdict(all),groups=s=>all.filter(x=>x.status===s),allReasons=sortReasons(all.flatMap(x=>x.reasons||[])),summaryReasons=dedupeLabels(allReasons).slice(0,5);
 const jainEffective=root.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile?.({profile,date:options?.evaluatedAt||new Date()})||null;
 const jainReasons=allReasons.filter(x=>x.profileRuleId==="jain");
 const conflicts=root.ROOTS_RESTRICTION_CONFLICTS?.detectConflicts?.(profile)||[];
 const result={engineVersion:ENGINE_VERSION,ingredientKnowledgeVersion:K.version,profileSchemaVersion:profile?.schemaVersion||null,restrictionSchemaVersion:1,verdict,summaryReasons:summaryReasons.length?summaryReasons:[reason("no-conflicts","summary","none","safe","No conflicts were found for your selected profile.","direct_ingredient","confirmed")],avoidItems:groups("AVOID"),cautionItems:groups("CAUTION"),safeItems:groups("SAFE"),preferenceItems:groups("PREFERENCE"),allergenEvidence:allReasons.filter(x=>x.category==="allergy"||x.category==="declared_contains"),crossContactEvidence:allReasons.filter(x=>x.category==="cross_contact"),unresolvedItems:all.filter(x=>x.evidenceLevel==="needs_confirmation"),profileConflicts:conflicts,ruleTrace:allReasons.map((x,index)=>({order:index,restrictionId:x.profileRuleId,ruleId:x.id,evidenceLevel:x.evidenceLevel,evidenceType:x.evidenceType,effect:x.severity})),phase6Handoff:{schemaVersion:1,ingredients:all.map(x=>x.phase6Handoff).filter(Boolean),conflicts},jain:jainEffective?.jainEnabled?{effectiveProfile:jainEffective,verdict:root.ROOTS_JAIN_RELIABILITY?.fromDietaryResult?.({avoidItems:groups("AVOID").filter(x=>(x.reasons||[]).some(r=>r.profileRuleId==="jain")),cautionItems:groups("CAUTION").filter(x=>(x.reasons||[]).some(r=>r.profileRuleId==="jain")),unresolvedItems:all.filter(x=>x.evidenceLevel==="needs_confirmation"&&(x.reasons||[]).some(r=>r.profileRuleId==="jain"))},{sourceType:options?.sourceType,ingredientCount:(product.ingredients||[]).length}),activeObservance:jainEffective.activeObservance,changedByObservance:jainReasons.some(x=>x.activeObservance),reasons:jainReasons}:null,evaluatedAt:options?.evaluatedAt||new Date().toISOString(),certifications:product.certifications||[]};
 root.ROOTS_PERFORMANCE?.endTask?.(task,{count:all.length,status:verdict});return result;
}
function getRuleDefinitions(){return {religious:["jain","halal","kosher","hindu_vegetarian"],lifestyle:["vegetarian","vegan","pescatarian","dairy_free","egg_free","gluten_free"],statuses:Object.keys(STATUS)};}
root.ROOTS_DIETARY_ENGINE={normalizeIngredientText:P.normalizeIngredientText,parseIngredientText:P.parseIngredientText,parseIngredientList:P.parseIngredientList,parseAllergenStatements:P.parseAllergenStatements,resolveIngredient,evaluateIngredient,evaluateParsedProduct,aggregateProductVerdict,getIngredientById:id=>K.byId.get(id)||null,getIngredientAliases:id=>K.byId.get(id)?.aliases||[],getRuleDefinitions,getEngineVersion:()=>ENGINE_VERSION,getIngredientKnowledgeVersion:()=>K.version};
})(typeof window!=="undefined"?window:globalThis);
