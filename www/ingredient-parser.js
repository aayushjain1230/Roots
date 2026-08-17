(function (root) {
  "use strict";
  const K = root.ROOTS_INGREDIENT_KNOWLEDGE;
  const NORMALIZE_CACHE_LIMIT = 500;
  const normalizeCache = new Map();
  function normalizeIngredientText(value) {
    const rawText = String(value || "").trim();
    if (normalizeCache.has(rawText)) return normalizeCache.get(rawText);
    let normalizedName = rawText.normalize("NFKC").toLowerCase()
      .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[‐‑‒–—―]/g,"-")
      .replace(/\r?\n/g," ").replace(/\s+/g," ").replace(/^\s*ingredients?\s*:\s*/i,"")
      .replace(/\b(\d+(?:\.\d+)?)\s*%/g,"").replace(/\be\s+(\d{3,4})\b/g,"e$1")
      .replace(/^[\s,;:.]+/,"").replace(/[\s,;:.]+$/,"").replace(/\)+$/,"").trim();
    normalizedName = normalizedName.replace(/\bnatural flavours?\b/g,"natural flavors").replace(/\bground nut\b/g,"groundnut");
    const isFreeClaim = /\b(peanut|dairy|egg|gluten|soy|nut)[ -]free\b/.test(normalizedName);
    const correction = K.ocrCorrections[normalizedName];
    const result = Object.freeze({rawText,normalizedName:correction||normalizedName,ocrCorrection:correction||null,isFreeClaim});
    normalizeCache.set(rawText,result);
    if(normalizeCache.size>NORMALIZE_CACHE_LIMIT)normalizeCache.delete(normalizeCache.keys().next().value);
    return result;
  }
  function splitOutside(value) {
    const out=[]; let start=0,depth=0;
    for(let i=0;i<value.length;i++){const c=value[i];if(c==="("||c==="[")depth++;else if(c===")"||c==="]")depth=Math.max(0,depth-1);else if((c===","||c===";"||c==="\n")&&depth===0){out.push(value.slice(start,i));start=i+1;}}
    out.push(value.slice(start)); return out.map(x=>x.trim()).filter(Boolean);
  }
  function parseSegment(segment,depth) {
    const raw=segment.trim().replace(/^[•*\-]\s*/,"").replace(/\.+$/,"").trim();
    const open=raw.indexOf("("); const close=raw.lastIndexOf(")");
    const parentRaw=open>0?raw.slice(0,open).trim():raw.replace(/\)+$/,"").trim();
    const n=normalizeIngredientText(parentRaw);
    const children=(open>0&&close>open&&depth<3)?splitOutside(raw.slice(open+1,close)).map(x=>parseSegment(x,depth+1)).filter(Boolean):[];
    if(!n.normalizedName)return null;
    return {rawName:raw,name:parentRaw.replace(/\b\w/g,c=>c.toUpperCase()),normalizedName:n.normalizedName,percentage:(raw.match(/\d+(?:\.\d+)?\s*%/)||[])[0]||null,ocrCorrection:n.ocrCorrection,isFreeClaim:n.isFreeClaim,subingredients:children};
  }
  function cleanIngredientSection(raw) {
    return String(raw||"").replace(/^\s*ingredients?\s*:\s*/i,"").split(/\b(?:nutrition facts|supplement facts|serving size|calories)\b/i)[0];
  }
  function parseIngredientList(rawText){return splitOutside(cleanIngredientSection(rawText)).map(x=>parseSegment(x,0)).filter(Boolean);}
  function statementItems(text){return String(text||"").replace(/^(?:allergen information\s*:\s*)?(?:contains|may contain(?: traces of)?|made on shared equipment with|processed on equipment that also processes|produced on shared machinery with|made in a facility that processes|manufactured in a facility that also handles|produced in a plant that processes)\s*:?\s*/i,"").split(/\s*(?:,|;|\band\b)\s*/i).map(x=>parseSegment(x,0)).filter(Boolean);}
  function parseAllergenStatements(rawText){
    const raw=String(rawText||""); const result={contains:[],mayContain:[],sharedEquipment:[],sharedFacility:[]};
    const patterns=[
      ["sharedEquipment",/(?:made on shared equipment with|processed on equipment that also processes|produced on shared machinery with)\s*:?\s*([^\n.]+)/gi],
      ["sharedFacility",/(?:made in a facility that processes|manufactured in a facility that also handles|produced in a plant that processes)\s*:?\s*([^\n.]+)/gi],
      ["mayContain",/may contain(?: traces of)?\s*:?\s*([^\n.]+)/gi],
      ["contains",/(?:allergen information\s*:\s*)?contains\s*:?\s*([^\n.]+)/gi],
    ];
    patterns.forEach(([key,re])=>{let m;while((m=re.exec(raw)))result[key].push(...statementItems(m[1]));});
    return result;
  }
  function parseIngredientText(rawText){
    const task=root.ROOTS_PERFORMANCE?.startTask?.("ingredient_parse",{bytes:String(rawText||"").length});
    const statements=parseAllergenStatements(rawText);
    const ingredientOnly=String(rawText||"").split(/\b(?:contains|may contain|made on shared equipment|processed on equipment|produced on shared machinery|made in a facility|manufactured in a facility|produced in a plant)\b/i)[0];
    const result={rawText:String(rawText||""),ingredients:parseIngredientList(ingredientOnly),...statements,certifications:[]};
    root.ROOTS_PERFORMANCE?.endTask?.(task,{count:result.ingredients.length});
    return result;
  }
  root.ROOTS_INGREDIENT_PARSER={normalizeIngredientText,parseIngredientList,parseIngredientText,parseAllergenStatements,splitOutside,clearNormalizationCache:()=>normalizeCache.clear(),normalizationCacheSize:()=>normalizeCache.size};
})(typeof window!=="undefined"?window:globalThis);
