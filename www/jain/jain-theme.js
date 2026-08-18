(function (root) {
  "use strict";
  const VERSION = 1;
  function apply(profile, date, target) {
    const doc = target || root.document;
    if (!doc?.documentElement) return null;
    const settings = root.ROOTS_JAIN_PROFILE?.getSettings(profile);
    const active = root.ROOTS_JAIN_OBSERVANCES?.getActive(profile, date);
    const on = settings?.enabled && active?.enabled && settings.festivalAppearance !== "off";
    doc.documentElement.dataset.jainFestival = on ? settings.festivalAppearance : "";
    return on ? { appearance: settings.festivalAppearance, observance: active.observanceId } : null;
  }
  root.ROOTS_JAIN_THEME = Object.freeze({ VERSION, apply });
})(typeof window !== "undefined" ? window : globalThis);
