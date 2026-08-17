(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character]));
  let initialized=false, trigger=null, step=0, draft={}, card=null, showSource=false, wakeLock=null, parentModal=null;
  const levels=["short","standard","detailed"];
  const translated = (item) => item?.translatedText || item?.sourceText || "";
  function close() { $("travel-mode-modal").classList.remove("open"); $("travel-mode-modal").setAttribute("aria-hidden","true");if(parentModal)parentModal.setAttribute("aria-hidden","false");parentModal=null;trigger?.focus?.(); }
  async function open(button,options) {
    trigger=button||document.activeElement;parentModal=trigger?.closest?.(".modal.open")||null;if(parentModal)parentModal.setAttribute("aria-hidden","true");step=0; const existing=await root.ROOTS_TRAVEL.getCurrentDestination();
    draft={destination:existing,language:root.ROOTS_TRAVEL.getSettings().language||existing?.primaryLanguage,offline:true,questionSet:options?.questionSet,translatedQuestions:options?.translatedQuestions}; render();
    $("travel-mode-modal").classList.add("open"); $("travel-mode-modal").setAttribute("aria-hidden","false"); $("travel-mode-close").focus();
  }
  function render() {
    const target=$("travel-mode-content"), countries=root.ROOTS_TRAVEL.getCountries(), languages=root.ROOTS_TRAVEL.getLanguages(), profile=root.ROOTS_PROFILE?.getActiveProfile?.();
    const panels=[
      `<h2>Where are you traveling?</h2><p>Choose manually. ROOTS does not track your location.</p><label for="travel-country">Destination country<select id="travel-country"><option value="">Choose destination</option>${countries.map((item)=>`<option value="${item.countryCode}" ${draft.destination?.countryCode===item.countryCode?"selected":""}>${esc(item.countryName)}</option>`).join("")}</select></label><label for="travel-city">City or region (optional)<input id="travel-city" maxlength="120" value="${esc(draft.destination?.city||"")}"></label>`,
      `<h2>Which language should ROOTS use?</h2><p>Suggested languages come from the destination. English remains available as a fallback.</p><label for="travel-language">Card language<select id="travel-language">${Object.entries(languages).map(([code,name])=>`<option value="${code}" ${draft.language===code?"selected":""}>${esc(name)}</option>`).join("")}</select></label><p class="muted">Suggested: ${esc((draft.destination?.languages||[]).map((code)=>languages[code]).join(", ")||"Choose a destination first")}</p>`,
      `<h2>Review dietary profile</h2><p>Travel Mode uses your existing active profile. It does not create a duplicate.</p><article class="travel-profile-review"><b>${esc(profile?.name||"Active profile")}</b><p>${esc(root.ROOTS_PROFILE?.summary?.(profile)?.compact||"Your enabled restrictions and allergies will be used.")}</p></article><p>Allergies appear before religious and lifestyle restrictions. Personal dislikes remain separate.</p>`,
      `<h2>Prepare offline language pack</h2><p>Core phrases and country terminology can be stored on this device. New arbitrary translations still require internet.</p><label class="compact-check"><input id="travel-offline-pack" type="checkbox" ${draft.offline?"checked":""}><span>Make this language pack available offline</span></label><p id="travel-pack-status" role="status" aria-live="polite"></p>`,
      `<h2>Travel Mode is ready</h2><p>Prepare a server-facing card for ${esc(draft.destination?.countryName||"your destination")} in ${esc(languages[draft.language]||"the selected language")}.${draft.questionSet?.questions?.length?` ${draft.questionSet.questions.length} deterministic server question(s) will stay linked to their evidence.`:""}</p><button type="button" class="primary-btn" data-travel-action="prepare-card">Prepare Dining Card</button><button type="button" class="ghost-btn" data-travel-action="glossary">Open Travel Glossary</button>`,
    ];
    target.innerHTML=`<p class="eyebrow">Travel Mode · Step ${step+1} of ${panels.length}</p>${panels[step]}<div class="travel-wizard-actions">${step?'<button type="button" class="ghost-btn" data-travel-action="back">Back</button>':""}${step<panels.length-1?'<button type="button" class="primary-btn" data-travel-action="next">Continue</button>':""}</div>`;
  }
  async function next() {
    const status=$("travel-pack-status");
    if(step===0){const country=$("travel-country").value;if(!country)throw new Error("Choose a destination.");draft.destination=await root.ROOTS_TRAVEL.setDestination({countryCode:country,city:$("travel-city").value});draft.language=draft.destination.primaryLanguage;}
    else if(step===1){draft.language=root.ROOTS_TRAVEL.setLanguage($("travel-language").value);}
    else if(step===3&&draft.offline){
      status.textContent="Preparing language pack…"; const profile=root.ROOTS_PROFILE.getActiveProfile(); let pack=root.ROOTS_TRAVEL_PACKS.createPack({language:draft.language,region:draft.destination.countryCode,profile});
      if(root.navigator?.onLine!==false&&root.BIJ_OCR?.hasCloudKey?.()){try{pack=await root.ROOTS_TRAVEL_PACKS.translatePack(pack);}catch(_){status.textContent="Some phrases remain in English; the verified source text is preserved.";}}
      const saved=await root.ROOTS_TRAVEL_PACKS.downloadPack(pack); draft.destination.offlinePackIds=[...new Set([...(draft.destination.offlinePackIds||[]),saved.id])]; await root.ROOTS_TRAVEL.setDestination(draft.destination);
    }
    step=Math.min(4,step+1);render();
  }
  function sourceBlock(items) { return `<details class="travel-source-text" ${showSource?"open":""}><summary>English/source text</summary><ul lang="en">${items.map((item)=>`<li>${esc(item.sourceText)}</li>`).join("")}</ul></details>`; }
  async function showCard(value) {
    card=value; const profile=root.ROOTS_PROFILE.getActiveProfile(), stale=card.profileFingerprint!==root.ROOTS_TRAVEL_PACKS.fingerprint(profile);
    const all=[...card.sections.allergies,...card.sections.religiousAndDietary,...card.sections.questions,...card.sections.thankYou], level=card.contentLevel||"standard";
    const primary=level==="short"?[...card.sections.allergies,...card.sections.religiousAndDietary.slice(0,4),...card.sections.questions.slice(0,1)]:level==="detailed"?all:[...card.sections.allergies,...card.sections.religiousAndDietary,...card.sections.questions.slice(0,4),...card.sections.thankYou];
    $("travel-card-content").innerHTML=`<header><p class="eyebrow">ROOTS Dining Card</p><h1>${esc(card.destination.countryName)}</h1><p lang="${esc(card.language)}">Show this card to restaurant staff and confirm preparation details.</p><p class="muted">${esc(card.translationSource==="offline_pack"?"Loaded from an installed offline language pack.":"Verified source text; untranslated phrases remain in English.")}</p></header>${stale?'<p class="travel-card-warning">Your dietary profile changed after this card was prepared. Update it before relying on the restrictions.</p>':""}
      <section aria-labelledby="travel-allergy-heading"><h2 id="travel-allergy-heading">Allergies</h2><ul>${card.sections.allergies.map((item)=>`<li lang="${esc(card.language)}">${esc(translated(item))}${item.transliteration?`<small>Pronunciation guide: ${esc(item.transliteration)}</small>`:""}</li>`).join("")||"<li>No allergies are saved in this profile.</li>"}</ul></section>
      <section aria-labelledby="travel-restriction-heading"><h2 id="travel-restriction-heading">Dietary restrictions and questions</h2><ul>${primary.filter((item)=>!card.sections.allergies.includes(item)).map((item)=>`<li lang="${esc(card.language)}">${esc(translated(item))}${item.transliteration?`<small>Pronunciation guide: ${esc(item.transliteration)}</small>`:""}</li>`).join("")}</ul></section>${sourceBlock(primary)}
      <p class="travel-safety-note">Translation helps communication; it does not guarantee that a dish is compatible.</p>`;
    $("travel-card-screen").hidden=false; $("travel-card-screen").dataset.level=level;$("travel-card-level").value=level;
    const voices=root.ROOTS_TRAVEL_SPEECH.getVoices(card.language),voiceSelect=$("travel-card-voice");voiceSelect.innerHTML=voices.map((voice)=>`<option value="${esc(voice.name)}">${esc(voice.name)}</option>`).join("");voiceSelect.closest("label").hidden=!voices.length;
    $("travel-card-title").focus();
  }
  async function openSaved(id){const saved=await root.ROOTS_TRAVEL_STORAGE.get("cards",id);if(saved)await showCard(saved);}
  async function refreshSaved(){
    const cards=await root.ROOTS_TRAVEL_STORAGE.all("cards"),phrases=await root.ROOTS_TRAVEL_STORAGE.all("phrases"),packs=await root.ROOTS_TRAVEL_PACKS.getInstalled();
    const target=$("savedTravelData");if(!target)return;
    target.innerHTML=`<p>${packs.length} offline pack(s) · ${cards.length} saved card(s)</p>${cards.map((item)=>`<article data-travel-card-id="${esc(item.id)}"><div><b>${esc(item.destination.countryName)}</b><small>${esc(root.ROOTS_TRAVEL.getLanguages()[item.language]||item.language)}</small></div><button type="button" class="ghost-btn" data-travel-saved="open">Open</button><button type="button" class="text-btn" data-travel-saved="delete">Delete</button></article>`).join("")||'<p class="empty-state">Prepared travel cards will appear here.</p>'}<details><summary>Recent travel phrases (${phrases.length})</summary>${phrases.map((item)=>`<p>${esc(item.translatedText)}</p>`).join("")||"<p>No recent travel phrases.</p>"}</details>`;
  }
  async function openGlossary() {
    const entries=root.ROOTS_TRAVEL_GLOSSARY.getRelevant(root.ROOTS_PROFILE.getActiveProfile(),draft.destination);
    $("travel-mode-content").innerHTML=`<h2>Offline Travel Glossary</h2><form id="travel-glossary-form"><label for="travel-glossary-search">Search local terms</label><div><input id="travel-glossary-search" type="search" maxlength="120"><button class="primary-btn">Search</button></div></form><div id="travel-glossary-results">${entries.map(glossaryItem).join("")}</div><h3>Destination notes</h3><ul>${root.ROOTS_TRAVEL_GLOSSARY.countryNotes(draft.destination?.countryCode).map((note)=>`<li>${esc(note)}</li>`).join("")}</ul><p>Country terminology can explain uncertainty or create a question. It never confirms what a dish contains.</p>`;
  }
  const glossaryItem=(entry)=>`<article class="travel-glossary-item"><h3>${esc(entry.termOriginal)} <small>${esc(entry.termTranslated)}</small></h3>${entry.transliteration?`<p>Pronunciation guide: ${esc(entry.transliteration)}</p>`:""}<p>${esc(entry.description)}</p></article>`;
  function bind(){
    $("travel-mode-close")?.addEventListener("click",close);$("travel-mode-content")?.addEventListener("change",(event)=>{if(event.target.id==="travel-offline-pack")draft.offline=event.target.checked;});
    $("travel-mode-content")?.addEventListener("click",async(event)=>{const action=event.target.closest("[data-travel-action]")?.dataset.travelAction;try{if(action==="next")await next();else if(action==="back"){step--;render();}else if(action==="prepare-card"){const value=await root.ROOTS_TRAVEL.prepareCard({destination:draft.destination,language:draft.language,profile:root.ROOTS_PROFILE.getActiveProfile(),questionSet:draft.questionSet,translatedQuestions:draft.translatedQuestions});close();await showCard(value);await refreshSaved();}else if(action==="glossary")await openGlossary();}catch(error){const status=$("travel-pack-status")||$("travel-mode-content");status.textContent=error.message;}});
    $("travel-mode-content")?.addEventListener("submit",(event)=>{if(event.target.id!=="travel-glossary-form")return;event.preventDefault();const results=root.ROOTS_TRAVEL_GLOSSARY.search($("travel-glossary-search").value,{countryCode:draft.destination?.countryCode,allRegions:true});$("travel-glossary-results").innerHTML=results.map(glossaryItem).join("")||"<p>No matching term is stored offline.</p>";});
    $("travel-card-back")?.addEventListener("click",async()=>{root.ROOTS_TRAVEL_SPEECH.stop();if(wakeLock){await wakeLock.release();wakeLock=null;}$("travel-card-screen").hidden=true;trigger?.focus?.();});
    $("travel-card-speak")?.addEventListener("click",async()=>{const text=$("travel-card-content").innerText,result=root.ROOTS_TRAVEL_SPEECH.speak(text,card.language,{slow:$("travel-card-slow").checked,repeat:$("travel-card-repeat").checked,voiceName:$("travel-card-voice").value});$("travel-card-status").textContent=result.message||`Speaking with ${result.voice}.`;if(result.ok)await root.ROOTS_TRAVEL.recentPhrase({sourceText:text,translatedText:text,language:card.language});});
    $("travel-card-pause")?.addEventListener("click",()=>root.ROOTS_TRAVEL_SPEECH.pause());
    $("travel-card-resume")?.addEventListener("click",()=>root.ROOTS_TRAVEL_SPEECH.resume());
    $("travel-card-stop")?.addEventListener("click",()=>root.ROOTS_TRAVEL_SPEECH.stop());
    $("travel-card-source")?.addEventListener("click",()=>{showSource=!showSource;showCard(card);});
    $("travel-card-level")?.addEventListener("change",(event)=>{card.contentLevel=levels.includes(event.target.value)?event.target.value:"standard";showCard(card);});
    $("travel-card-slow")?.addEventListener("change",(event)=>root.ROOTS_TRAVEL_SPEECH.setRate(event.target.checked?"slow":"normal"));
    $("travel-card-voice")?.addEventListener("change",(event)=>root.ROOTS_TRAVEL_SPEECH.setVoice(card.language,event.target.value));
    $("travel-card-copy")?.addEventListener("click",()=>root.ROOTS_QUESTION_ACTIONS.copy($("travel-card-content").innerText));
    $("travel-card-share")?.addEventListener("click",async()=>{const text=$("travel-card-content").innerText;if(root.navigator?.share){try{await root.navigator.share({title:"ROOTS Travel Dining Card",text});}catch(error){if(error?.name!=="AbortError")throw error;}}else await root.ROOTS_QUESTION_ACTIONS.copy(text);});
    $("travel-card-print")?.addEventListener("click",()=>root.print());
    $("travel-card-wake")?.addEventListener("click",async()=>{try{wakeLock=await root.navigator?.wakeLock?.request("screen");$("travel-card-status").textContent=wakeLock?"Screen will stay awake while this card is open.":"Screen wake lock is unavailable.";}catch(_){$("travel-card-status").textContent="Screen wake lock is unavailable.";}});
    $("savedTravelData")?.addEventListener("click",async(event)=>{const article=event.target.closest("[data-travel-card-id]"),action=event.target.closest("[data-travel-saved]")?.dataset.travelSaved;if(!article||!action)return;if(action==="open")await openSaved(article.dataset.travelCardId);else{await root.ROOTS_TRAVEL_STORAGE.remove("cards",article.dataset.travelCardId);await refreshSaved();}});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)root.ROOTS_TRAVEL_SPEECH.stop();});
    document.addEventListener("click",(event)=>{const button=event.target.closest("[data-open-travel-mode]");if(button)open(button,{});});
    ["destinations","packs","cards","phrases"].forEach((store)=>$(`clear-travel-${store}`)?.addEventListener("click",async()=>{if(root.confirm?.(`Delete local travel ${store}?`)){await root.ROOTS_TRAVEL_STORAGE.clear(store);if(store==="destinations")localStorage.removeItem("roots-travel-settings-v1");await refreshSaved();}}));
    document.addEventListener("keydown",(event)=>{if(!$("travel-card-screen")?.hidden){if(event.key==="Escape"){$("travel-card-back").click();return;}if(event.key==="Tab"){const controls=[...$("travel-card-screen").querySelectorAll("button:not([disabled]),select:not([disabled]),input:not([disabled])")];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}}}});
  }
  function init(){if(initialized)return;initialized=true;bind();refreshSaved();}
  root.ROOTS_TRAVEL_VIEW={open,close,refreshSaved};root.ROOTS_TRAVEL_CARD={open:showCard,openSaved,setMode:(mode)=>{if(card&&levels.includes(mode)){card.contentLevel=mode;showCard(card);}},toggleSourceText:()=>{showSource=!showSource;if(card)showCard(card);},print:()=>root.print(),copy:()=>root.ROOTS_QUESTION_ACTIONS.copy($("travel-card-content").innerText),share:()=>$("travel-card-share").click(),destroy:()=>{$("travel-card-back").click();}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})(typeof window !== "undefined" ? window : globalThis);
