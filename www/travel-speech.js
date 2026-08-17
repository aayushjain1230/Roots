(function (root) {
  "use strict";
  const SETTINGS_KEY = "roots-travel-speech-v1";
  let activeUtterance = false;
  const settings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { return {}; } };
  function voices(language) {
    const requested = String(language || "").toLowerCase();
    return (root.speechSynthesis?.getVoices?.() || []).filter((voice) => voice.lang.toLowerCase().startsWith(requested.split("-")[0]));
  }
  function speak(text, language, options) {
    stop();
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return { ok:false, message:"Speech is not available on this device." };
    const matches = voices(language), saved = options?.voiceName || settings().voices?.[language], selected = matches.find((voice) => voice.name === saved) || matches[0];
    if (!selected) return { ok:false, message:"Speech is not available for this language on this device." };
    const utterance = new root.SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = selected.lang; utterance.voice = selected; utterance.rate = options?.slow ? .72 : .94;
    utterance.onend = () => {
      if (options?.repeat) root.speechSynthesis.speak(utterance);
      else if (activeUtterance) { activeUtterance = false; root.ROOTS_PERFORMANCE?.trackResource?.("speech_instances", -1); }
    };
    activeUtterance = true; root.ROOTS_PERFORMANCE?.trackResource?.("speech_instances", 1);
    root.speechSynthesis.speak(utterance); return { ok:true, voice:selected.name, rate:utterance.rate };
  }
  function stop() { root.speechSynthesis?.cancel?.(); if (activeUtterance) { activeUtterance = false; root.ROOTS_PERFORMANCE?.trackResource?.("speech_instances", -1); } }
  function pause() { root.speechSynthesis?.pause?.(); }
  function resume() { root.speechSynthesis?.resume?.(); }
  function setRate(value) { const next = value === "slow" ? "slow" : "normal"; localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings(), rate:next })); return next; }
  function setVoice(language,name){const current=settings();localStorage.setItem(SETTINGS_KEY,JSON.stringify({...current,voices:{...(current.voices||{}),[language]:name}}));return name;}
  root.ROOTS_TRAVEL_SPEECH = { speak, pause, resume, stop, getVoices: voices, setRate, setVoice, getRate: () => settings().rate || "normal" };
})(typeof window !== "undefined" ? window : globalThis);
