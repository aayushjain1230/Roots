(function (root) {
  "use strict";
  const VERSION=1, KEY="roots-product-metrics-v1", CONSENT_KEY="roots-product-metrics-consent-v1", LIMIT=1000, RETENTION_DAYS=90;
  const ALLOWED=new Set(["app_open","scan_completed","verify_result","resolution_attempted","resolution_succeeded","result_corrected","restaurant_searched","menu_analyzed","product_saved"]);
  const clean=(value,limit=80)=>String(value??"").replace(/\s+/g," ").trim().slice(0,limit);
  const read=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(value)?value:[];}catch(_){return[];}};
  const consent=()=>{try{return JSON.parse(localStorage.getItem(CONSENT_KEY)||"false")===true;}catch(_){return false;}};
  function write(items){try{localStorage.setItem(KEY,JSON.stringify(items));return true;}catch(_){return false;}}
  function setConsent(value){const enabled=value===true;localStorage.setItem(CONSENT_KEY,JSON.stringify(enabled));if(!enabled)write([]);return enabled;}
  function track(name,details){if(!consent()||!ALLOWED.has(name))return false;const now=new Date(),cutoff=now.getTime()-RETENTION_DAYS*86400000,safe={};
    ["decision","outcome","source","category"].forEach((key)=>{if(details?.[key]!=null)safe[key]=clean(details[key]);});
    const items=read().filter((item)=>Date.parse(item.at)>=cutoff);items.push({schemaVersion:VERSION,name,at:now.toISOString(),details:safe});return write(items.slice(-LIMIT));}
  function summary(options){const items=read(),now=Number(options?.now)||Date.now(),count=(name)=>items.filter((item)=>item.name===name).length;
    const verifies=count("verify_result"),resolved=count("resolution_succeeded"),days=new Set(items.map((item)=>item.at.slice(0,10))),validTimes=items.map((item)=>Date.parse(item.at)).filter(Number.isFinite),first=validTimes.length?Math.min(...validTimes):null;
    const activeSince=(daysBack)=>[...days].some((day)=>{const age=(now-Date.parse(`${day}T00:00:00Z`))/86400000;return age>=daysBack-1&&age<=daysBack+1;});
    return {schemaVersion:VERSION,consent:consent(),eventCount:items.length,counts:Object.fromEntries([...ALLOWED].map((name)=>[name,count(name)])),verifyToResolvedRate:verifies?resolved/verifies:null,activeDays:days.size,retention:{eligible7:first!=null&&now-first>=7*86400000,returnedDay7:activeSince(7),eligible30:first!=null&&now-first>=30*86400000,returnedDay30:activeSince(30)}};}
  function exportData(){return {generatedAt:new Date().toISOString(),summary:summary(),events:read()};}
  root.ROOTS_METRICS=Object.freeze({VERSION,track,summary,consent,setConsent,exportData,clear:()=>write([]),constants:{KEY,CONSENT_KEY,LIMIT,RETENTION_DAYS,ALLOWED:[...ALLOWED]}});
})(typeof window!=="undefined"?window:globalThis);
