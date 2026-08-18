(function () {
  "use strict";

  const P = window.ROOTS_PROFILE;
  const D = P.definitions;
  const F = window.ROOTS_DIETARY_FEATURES;
  const $ = (id) => document.getElementById(id);
  const modal = $("onboardingModal");
  const body = $("onboarding-body");
  const error = $("onboarding-error");
  const back = $("onboarding-back");
  const cancel = $("onboarding-cancel");
  const next = $("onboarding-continue");
  let activeProfile = P.getActiveProfile();
  let draft = null;
  let step = 0;
  let editSingleStep = false;
  let returnFocus = null;
  const stepNames = ["Welcome", "Religious preferences", "Lifestyle preferences", "Allergies", "Preferences and cross-contact", "Review your profile"];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function enabled(list, id) { return !!list.find((item) => item.id === id)?.enabled; }
  function card(id, label, description, checked, category) {
    return `<button class="profile-option ${checked ? "selected" : ""}" type="button" data-category="${category}" data-option="${id}" role="checkbox" aria-checked="${checked}">
      <span><b>${esc(label)}</b>${description ? `<small>${esc(description)}</small>` : ""}</span><span class="option-check" aria-hidden="true">${checked ? "✓" : ""}</span>
    </button>`;
  }
  function termChip(item, kind) {
    return `<span class="profile-chip"><span>${esc(item.label)}</span><button type="button" data-remove-kind="${kind}" data-remove-id="${esc(item.id)}" aria-label="Remove ${esc(item.label)}">×</button></span>`;
  }

  function jainPanel() {
    const item = draft.religiousDiets.find((entry) => entry.id === "jain");
    if (!item.enabled) return "";
    draft.jain = window.ROOTS_JAIN_PROFILE?.getSettings?.(draft) || draft.jain || {};
    const labels = {
      avoidMeatFishSeafood: "Meat, fish, and seafood", avoidEggs: "Eggs", avoidOnionGarlic: "Onion and garlic",
      avoidAllRootVegetables: "All root vegetables", avoidHoney: "Honey", avoidAnimalDerivedAdditives: "Animal-derived additives",
      avoidFermentedIngredients: "Fermented ingredients", avoidMushrooms: "Mushrooms", avoidArtificialAdditives: "Artificial additives",
    };
    const option = (key, label, current) => `<option value="${key}" ${current === key ? "selected" : ""}>${label}</option>`;
    const effective = window.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile?.({ profile: draft });
    return `<div class="profile-subpanel jain-settings-panel"><div class="section-head with-action"><h3>Jain Settings</h3><button type="button" class="text-btn" data-restore="jain">Restore defaults</button></div><p class="muted">Jain practices vary. Adjust these rules to match what you follow.</p>
      <label class="settings-info"><span>Tradition</span><select data-jain-setting="tradition" aria-label="Jain tradition">${option("shwetambar", "Shwetambar", draft.jain.tradition)}${option("digambar", "Digambar", draft.jain.tradition)}${option("not_sure", "Not sure", draft.jain.tradition)}</select></label>
      <label class="settings-info"><span>Mother tongue</span><select data-jain-setting="motherTongue" aria-label="Mother tongue">${option("gujarati", "Gujarati", draft.jain.motherTongue)}${option("kutchi", "Kutchi", draft.jain.motherTongue)}${option("hindi", "Hindi", draft.jain.motherTongue)}${option("english", "English", draft.jain.motherTongue)}${option("other", "Other", draft.jain.motherTongue)}</select></label>
      <label class="settings-info"><span>Festival appearance</span><select data-jain-setting="festivalAppearance" aria-label="Festival appearance">${option("subtle", "Subtle", draft.jain.festivalAppearance)}${option("full", "Full", draft.jain.festivalAppearance)}${option("off", "Off", draft.jain.festivalAppearance)}</select></label>
      <details class="profile-subdetails" open><summary>My food rules</summary><div class="compact-options">${Object.entries(labels).map(([key, label]) =>
      `<label class="compact-check"><input type="checkbox" data-jain-option="${key}" ${item.options[key] ? "checked" : ""}><span>Avoid ${label.toLowerCase()}</span></label>`).join("")}</div></details>
      <details class="profile-subdetails"><summary>My Jain Rules</summary><div class="review-list"><div><span>Tradition</span><b>${esc(draft.jain.tradition.replace("_", " "))}</b></div><div><span>Permanent food settings</span><b>${Object.entries(labels).filter(([key]) => item.options[key]).map(([, label]) => label).join(", ") || "None"}</b></div><div><span>Current observance</span><b>${effective?.activeObservance ? `${esc(effective.activeObservance.label)} · Day ${effective.activeObservance.day}` : "None"}</b></div><div><span>Temporary rules</span><b>${effective?.observanceRules?.length || 0} active</b></div></div></details>
      <p class="phase-note">Fasting and time-of-day reminders are a separate practice layer and do not change packaged-food compatibility.</p></div>`;
  }
  function hinduVegetarianPanel() {
    const item = draft.religiousDiets.find((entry) => entry.id === "hindu_vegetarian");
    if (!item.enabled) return "";
    return `<div class="profile-subpanel"><h3>Hindu Vegetarian options</h3><label class="compact-check"><input type="checkbox" id="hindu-allow-eggs" ${item.options.allowEggs ? "checked" : ""}><span>Allow eggs</span></label></div>`;
  }

  function religiousStep() {
    const none = !draft.religiousDiets.some((item) => item.enabled);
    return `<h2 id="onboarding-title" tabindex="-1">Religious preferences</h2><p class="muted">Select any dietary traditions you follow.</p><div class="profile-options">
      ${D.religiousDiets.filter((item) => F?.isAvailable?.(item.id) !== false).map((item) => card(item.id, item.label, item.description, enabled(draft.religiousDiets, item.id), "religious")).join("")}
      ${card("none", "None", "No religious dietary preference", none, "religious")}
    </div>${jainPanel()}${hinduVegetarianPanel()}${(enabled(draft.religiousDiets, "halal") || enabled(draft.religiousDiets, "kosher")) ? `<p class="phase-note">Source-dependent ingredients may still require certification or manufacturer confirmation.</p>` : ""}`;
  }
  function lifestyleStep() {
    return `<h2 id="onboarding-title" tabindex="-1">Launch dietary support</h2>
      <p class="muted">This release specializes in configurable Jain rules, the major food allergens, and custom ingredient avoids.</p>
      <p class="phase-note">Additional dietary modes remain preserved for future ROOTS rollouts.</p>`;
  }
  function allergiesStep() {
    const builtIns = new Set(draft.allergies.filter((item) => item.type === "built_in").map((item) => item.id));
    const custom = draft.allergies.filter((item) => item.type === "custom");
    return `<h2 id="onboarding-title" tabindex="-1">Allergies</h2><p class="muted">Select any allergies ROOTS should check for.</p><div class="profile-options allergy-options">
      ${D.allergies.map((item) => card(item.id, item.label, "", builtIns.has(item.id), "allergy")).join("")}
    </div><div class="profile-subpanel"><label for="custom-allergy"><b>Other allergy</b></label><div class="profile-add-row"><input id="custom-allergy" type="text" placeholder="For example, Mustard" autocomplete="off" maxlength="80"><button type="button" data-add="allergy">Add</button></div><div class="profile-chips">${custom.map((item) => termChip(item, "allergy")).join("")}</div></div>`;
  }
  function crossContactStep() {
    const c = draft.crossContact;
    const presetCard = (id, label, description) => card(id, label, description, c.preset === id, "cross");
    const select = (key, label) => `<label class="cross-row"><span>${label}</span><select data-cross-key="${key}">${D.crossContactValues.map((value) => `<option value="${value}" ${c[key] === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label>`;
    return `<h2 id="onboarding-title" tabindex="-1">Cross-contact</h2><p class="muted">How cautious should ROOTS be with “may contain” and shared-facility warnings?</p><div class="profile-options">
      ${presetCard("standard", "Standard", "Contains: Avoid. Other warnings: Caution.")}
      ${presetCard("strict", "Strict", "Contains, may contain, and shared equipment: Avoid.")}
      ${presetCard("custom", "Custom", "Choose how each warning should be handled.")}
    </div>${c.preset === "custom" ? `<div class="profile-subpanel cross-grid">${select("contains", "Contains")}${select("mayContain", "May contain")}${select("sharedEquipment", "Shared equipment")}${select("sharedFacility", "Shared facility")}</div>` : ""}`;
  }
  function welcomeStep() {
    return `<div class="onboarding-welcome"><p class="eyebrow">Welcome to ROOTS</p><h2 id="onboarding-title" tabindex="-1">Can I eat this?</h2><p>Scan food and restaurant menus using a dietary profile that matches what you follow.</p>
      <ul><li>Check barcodes and ingredient labels</li><li>Find restaurant dishes</li><li>Prepare questions and translated dining cards</li></ul>
      <p class="phase-note"><b>Your profile starts with no restrictions.</b> Set it up now for personalized results, or choose Set Up Later and edit it before relying on a result.</p></div>`;
  }
  function extrasStep(includeHeading = true) {
    return `${includeHeading ? '<h2 id="onboarding-title" tabindex="-1">Preferences and cross-contact</h2><p class="muted">Set handling for warnings, then add personal preferences if useful.</p>' : ""}
      <div class="profile-subpanel"><label for="dislike-input"><b>Dislikes</b></label><p class="muted">These are preferences, not allergies.</p><div class="profile-add-row"><input id="dislike-input" type="text" placeholder="For example, Mushrooms" maxlength="80"><button type="button" data-add="dislike">Add</button></div><div class="profile-chips">${draft.dislikes.map((item) => termChip(item, "dislike")).join("")}</div></div>
      <div class="profile-subpanel"><label for="rule-input"><b>Custom rules</b></label><div class="profile-add-row rule-row"><input id="rule-input" type="text" placeholder="For example, MSG" maxlength="80"><select id="rule-severity" aria-label="Rule severity"><option value="avoid">Avoid</option><option value="caution">Caution</option><option value="preference">Preference only</option></select><button type="button" data-add="rule">Add</button></div><div class="profile-chips">${draft.customRules.map((item) => termChip({ ...item, label: `${item.label} · ${item.severity}` }, "rule")).join("")}</div></div>`;
  }
  function preferencesStep() {
    return crossContactStep()
      .replace("Cross-contact</h2>", "Preferences and cross-contact</h2>")
      .replace("How cautious should ROOTS be with “may contain” and shared-facility warnings?", "Choose how ROOTS should handle package warnings.")
      + extrasStep(false);
  }
  function reviewStep() {
    const sections = summarySections(draft);
    return `<h2 id="onboarding-title" tabindex="-1">Review your profile</h2><p class="muted">ROOTS will use these settings as your active profile.</p><div class="review-list">${sections.map((section) => `<div><span>${esc(section.label)}</span><b>${esc(section.value)}</b></div>`).join("")}</div>`;
  }
  const renderers = [welcomeStep, religiousStep, lifestyleStep, allergiesStep, preferencesStep, reviewStep];

  function render() {
    error.textContent = "";
    $("onboarding-step-label").textContent = `Step ${step + 1} of 6`;
    $("onboarding-progress-bar").style.width = `${((step + 1) / 6) * 100}%`;
    body.innerHTML = renderers[step]();
    back.hidden = editSingleStep || step === 0 || (!!activeProfile && step === 1);
    cancel.hidden = !!editSingleStep;
    cancel.textContent = !activeProfile && step === 0 ? "Set Up Later" : "Cancel";
    next.textContent = editSingleStep ? "Save" : step === 0 ? "Get Started" : step === 5 ? "Finish" : "Continue";
    setTimeout(() => body.querySelector("h2")?.focus?.(), 0);
  }

  function open(options) {
    const opts = options || {};
    activeProfile = P.getActiveProfile();
    draft = P.clone(activeProfile || P.createDefaultProfile());
    step = Number.isInteger(opts.step) ? opts.step : activeProfile ? 1 : 0;
    editSingleStep = !!opts.singleStep;
    returnFocus = document.activeElement;
    document.body.classList.add("full-page-modal-open");
    document.querySelector(".app-main")?.setAttribute("inert", "");
    document.querySelector(".bottom-dock")?.setAttribute("inert", "");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    render();
    next.focus();
  }
  function close() {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("full-page-modal-open");
    document.querySelector(".app-main")?.removeAttribute("inert");
    document.querySelector(".bottom-dock")?.removeAttribute("inert");
    if (returnFocus?.focus) returnFocus.focus();
  }
  function toast(message) {
    if (window.ROOTS_UI?.toast) {
      window.ROOTS_UI.toast(message, { kind: "success" });
      return;
    }
    const el = $("profile-toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  function summarySections(profile) {
    const names = (entries, defs) => entries.filter((item) => item.enabled && F?.isAvailable?.(item.id) !== false).map((item) => defs.find((def) => def.id === item.id)?.label || item.id);
    const religious = names(profile.religiousDiets, D.religiousDiets);
    const lifestyle = names(profile.lifestyleDiets, D.lifestyleDiets);
    const rules = profile.customRules.map((item) => `${item.severity === "avoid" ? "Avoid" : item.severity === "caution" ? "Caution" : "Preference"} ${item.label}`);
    return [
      { label: "Religious preferences", value: religious.join(", ") || "None", step: 1 },
      { label: "Launch dietary modes", value: lifestyle.join(", ") || "None", step: 2 },
      { label: "Allergies", value: profile.allergies.map((item) => item.label).join(", ") || "None", step: 3 },
      { label: "Cross-contact", value: profile.crossContact.preset[0].toUpperCase() + profile.crossContact.preset.slice(1), step: 4 },
      { label: "Dislikes", value: profile.dislikes.map((item) => item.label).join(", ") || "None", step: 4 },
      { label: "Custom restrictions", value: rules.join(", ") || "None", step: 4 },
    ];
  }

  function renderAppSummaries() {
    activeProfile = P.getActiveProfile();
    if (!activeProfile) return;
    const definitions = window.ROOTS_PROFILE_DEFINITIONS;
    const labelFor = (id, list) => list.find((item) => item.id === id)?.label || id;
    const allergies = activeProfile.allergies.map((item) => ({ label: `${item.label} allergy`, allergy: true }));
    const religious = activeProfile.religiousDiets
      .filter((item) => item.enabled && F?.isAvailable?.(item.id) !== false)
      .map((item) => ({ label: labelFor(item.id, definitions.religiousDiets) }));
    const medicalIds = new Set(["dairy_free", "egg_free", "gluten_free"]);
    const enabledLifestyle = activeProfile.lifestyleDiets.filter((item) => item.enabled && F?.isAvailable?.(item.id) !== false);
    const medical = enabledLifestyle
      .filter((item) => medicalIds.has(item.id))
      .map((item) => ({ label: labelFor(item.id, definitions.lifestyleDiets) }));
    const lifestyle = enabledLifestyle
      .filter((item) => !medicalIds.has(item.id))
      .map((item) => ({ label: labelFor(item.id, definitions.lifestyleDiets) }));
    const typeOrder = { allergy: 1, religious: 2, medical: 3, digestive: 4, intolerance: 4, lifestyle: 5, sensitivity: 6, preference: 7 };
    const expanded = (activeProfile.restrictions || []).filter((item) => item.enabled !== false && F?.isSelectableRestriction?.(item) !== false)
      .map((item) => window.ROOTS_RESTRICTIONS?.getRestriction(item.id)).filter(Boolean)
      .sort((a, b) => (typeOrder[a.type] || 20) - (typeOrder[b.type] || 20))
      .map((item) => ({ label: item.shortLabel, allergy: item.type === "allergy" }));
    const prioritized = [...allergies, ...religious, ...medical, ...expanded, ...lifestyle]
      .filter((item, index, list) => list.findIndex((other) => other.label.toLowerCase() === item.label.toLowerCase()) === index);
    const visible = prioritized.slice(0, 3);
    const remaining = Math.max(0, prioritized.length - visible.length);
    const restrictions = visible.length
      ? `${visible.map((item) => `<span class="profile-summary-item${item.allergy ? " is-allergy" : ""}">${esc(item.label)}</span>`).join("")}${remaining ? `<span class="profile-summary-item profile-summary-more" aria-label="${remaining} more dietary rules">+${remaining}</span>` : ""}`
      : '<span class="profile-summary-empty">No dietary rules selected</span>';
    $("active-profile-summary").innerHTML = `<span class="profile-summary-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 5 39 11v11c0 10-6.1 17.2-15 21-8.9-3.8-15-11-15-21V11Z"></path><path d="m17 24 5 5 10-11"></path></svg></span><span class="profile-summary-copy"><small>Scanning for</small><b>${esc(activeProfile.name)}</b></span><span class="profile-summary-edit">Manage <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></span><span class="profile-summary-restrictions">${restrictions}</span>`;
    $("active-profile-summary").setAttribute("aria-label", `Scanning for ${activeProfile.name}. Edit dietary profile.`);
    $("profile-settings-summary").innerHTML = summarySections(activeProfile).map((section) =>
      `<button type="button" data-edit-step="${section.step}"><span>${esc(section.label)}</span><b>${esc(section.value)}</b><span aria-hidden="true">›</span></button>`).join("");
  }

  function addTerm(kind) {
    const input = $(kind === "allergy" ? "custom-allergy" : kind === "dislike" ? "dislike-input" : "rule-input");
    const term = P.normalizeCustomTerm(input.value);
    if (!term) { error.textContent = "Enter a valid ingredient or allergy."; return; }
    const list = kind === "allergy" ? draft.allergies : kind === "dislike" ? draft.dislikes : draft.customRules;
    const duplicate = list.some((item) => item.normalizedTerm === term || P.normalizeCustomTerm(item.label) === term || (item.type === "built_in" && item.id === term));
    if (duplicate) { error.textContent = "That item is already in your profile."; return; }
    const item = { id: P.generateStableLocalId(kind, term), label: input.value.trim(), normalizedTerm: term };
    if (kind === "allergy") Object.assign(item, { type: "custom", severity: "standard", customAliases: [] });
    if (kind === "rule") Object.assign(item, { severity: $("rule-severity").value, aliases: [] });
    list.push(item);
    render();
  }

  body.addEventListener("click", (event) => {
    const option = event.target.closest("[data-option]");
    if (option) {
      const category = option.dataset.category;
      const id = option.dataset.option;
      if (category === "religious" || category === "lifestyle") {
        const list = category === "religious" ? draft.religiousDiets : draft.lifestyleDiets;
        P.setDietSelection(draft, category, id, id === "none" ? true : !enabled(list, id));
      } else if (category === "allergy") {
        const existing = draft.allergies.findIndex((item) => item.type === "built_in" && item.id === id);
        if (existing >= 0) draft.allergies.splice(existing, 1);
        else {
          const def = D.allergies.find((item) => item.id === id);
          draft.allergies.push({ id, label: def.label, normalizedTerm: id, type: "built_in", severity: "standard", customAliases: [] });
        }
      } else if (category === "cross") P.applyCrossContactPreset(draft, id);
      render();
      return;
    }
    const add = event.target.closest("[data-add]");
    if (add) { addTerm(add.dataset.add); return; }
    const restore = event.target.closest("[data-restore]");
    if (restore?.dataset.restore === "jain") {
      draft.religiousDiets.find((item) => item.id === "jain").options = P.clone(D.jainDefaults);
      render();
      return;
    }
    const remove = event.target.closest("[data-remove-kind]");
    if (remove) {
      const key = remove.dataset.removeKind === "allergy" ? "allergies" : remove.dataset.removeKind === "dislike" ? "dislikes" : "customRules";
      draft[key] = draft[key].filter((item) => item.id !== remove.dataset.removeId);
      render();
    }
  });
  body.addEventListener("change", (event) => {
    if (event.target.dataset.jainOption) draft.religiousDiets.find((item) => item.id === "jain").options[event.target.dataset.jainOption] = event.target.checked;
    if (event.target.dataset.jainSetting) {
      draft.jain = window.ROOTS_JAIN_PROFILE?.getSettings?.(draft) || draft.jain || {};
      draft.jain[event.target.dataset.jainSetting] = event.target.value;
      window.ROOTS_JAIN_EFFECTIVE_PROFILE?.clearCache?.();
      render();
    }
    if (event.target.id === "hindu-allow-eggs") draft.religiousDiets.find((item) => item.id === "hindu_vegetarian").options.allowEggs = event.target.checked;
    if (event.target.id === "gluten-strict") draft.lifestyleDiets.find((item) => item.id === "gluten_free").options.strictCrossContact = event.target.checked;
    if (event.target.dataset.crossKey) P.setCrossContactValue(draft, event.target.dataset.crossKey, event.target.value);
  });
  body.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("#custom-allergy,#dislike-input,#rule-input")) {
      event.preventDefault();
      addTerm(event.target.id === "custom-allergy" ? "allergy" : event.target.id === "dislike-input" ? "dislike" : "rule");
    }
  });

  back.addEventListener("click", () => { if (step > 0) { step -= 1; render(); } });
  cancel.addEventListener("click", () => {
    if (!activeProfile && step === 0) {
      const limited = P.createDefaultProfile();
      limited.onboardingComplete = true;
      activeProfile = P.saveActiveProfile(limited);
      close();
      renderAppSummaries();
      toast("Profile setup skipped. Add your restrictions before relying on personalized results.");
      setTimeout(() => $("scan-barcode-btn")?.focus?.(), 0);
      return;
    }
    close();
  });
  next.addEventListener("click", () => {
    if (!editSingleStep && step < 5) { step += 1; render(); return; }
    draft.onboardingComplete = true;
    try {
      activeProfile = P.saveActiveProfile(draft);
      window.ROOTS_LAUNCH?.mark?.("profile_created");
      close();
      renderAppSummaries();
      if (!editSingleStep) {
        document.querySelector('[data-view="scanView"]')?.click();
        toast("ROOTS is now checking food for your profile.");
        setTimeout(() => $("scan-barcode-btn")?.focus?.(), 0);
      } else toast("Dietary profile updated.");
    } catch (err) { error.textContent = err.message || "Check your profile and try again."; }
  });

  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll('button:not([hidden]):not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  $("profile-settings-summary").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-step]");
    if (button) { document.getElementById("closeProfile").click(); open({ step: +button.dataset.editStep, singleStep: true }); }
  });
  $("edit-full-profile").addEventListener("click", () => { document.getElementById("closeProfile").click(); open(); });
  $("reset-profile").addEventListener("click", () => {
    if (!window.confirm("Reset your dietary profile? Your history, shopping list, and chats will not be changed.")) return;
    localStorage.removeItem(P.keys.profile);
    activeProfile = null;
    document.getElementById("closeProfile").click();
    open();
  });

  function openSettings() {
    renderAppSummaries();
    if (typeof openModal === "function") openModal($("profileModal"));
    else { $("profileModal").style.display = "flex"; $("profileModal").setAttribute("aria-hidden", "false"); }
  }

  renderAppSummaries();
  if (!activeProfile || !activeProfile.onboardingComplete) open();
  else if (localStorage.getItem(P.keys.migration) && !localStorage.getItem("roots-migration-notice-v1")) {
    localStorage.setItem("roots-migration-notice-v1", "1");
    toast("Your existing dietary settings were moved to ROOTS.");
  }

  window.ROOTS_PROFILE_UI = { open, openSettings, renderAppSummaries };
})();
