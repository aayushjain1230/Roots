(function (root) {
  "use strict";
  const VERSION = 1;
  const DEFAULTS = Object.freeze({ enabled: false, tradition: "not_sure", motherTongue: "english", festivalAppearance: "subtle", observances: {}, reviewSettings: false });
  const traditions = Object.freeze(["shwetambar", "digambar", "not_sure"]);
  const motherTongues = Object.freeze(["gujarati", "kutchi", "hindi", "english", "other"]);
  const appearances = Object.freeze(["full", "subtle", "off"]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function isEnabled(profile) { return !!profile?.religiousDiets?.find((item) => item.id === "jain")?.enabled; }
  function getSettings(profile) {
    const source = profile?.jain && typeof profile.jain === "object" ? profile.jain : {};
    return {
      ...clone(DEFAULTS),
      ...clone(source),
      enabled: isEnabled(profile),
      tradition: traditions.includes(source.tradition) ? source.tradition : "not_sure",
      motherTongue: motherTongues.includes(source.motherTongue) ? source.motherTongue : "english",
      festivalAppearance: appearances.includes(source.festivalAppearance) ? source.festivalAppearance : "subtle",
      observances: source.observances && typeof source.observances === "object" ? clone(source.observances) : {},
    };
  }
  function normalize(profile) {
    if (!profile || typeof profile !== "object") return profile;
    profile.jain = getSettings(profile);
    return profile;
  }
  root.ROOTS_JAIN_PROFILE = Object.freeze({ VERSION, DEFAULTS, traditions, motherTongues, appearances, isEnabled, getSettings, normalize });
})(typeof window !== "undefined" ? window : globalThis);
