(function (root) {
  "use strict";
  const VERSION = 1;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const yearOf = (event) => String(event?.year || new Date().getFullYear());
  function state(profile, observanceId, year) {
    return root.ROOTS_JAIN_PROFILE?.getSettings(profile).observances?.[observanceId]?.[String(year)] || {};
  }
  function isEnabled(profile, event) {
    if (!event?.observanceRulesetId) return false;
    const s = state(profile, event.observanceId, yearOf(event));
    return s.enabled === true;
  }
  function shouldPrompt(profile, date) {
    if (!root.ROOTS_JAIN_PROFILE?.isEnabled(profile)) return null;
    const upcoming = root.ROOTS_JAIN_CALENDAR?.getUpcoming(profile, date)?.[0];
    if (!upcoming?.observanceRulesetId) return null;
    const days = Math.round((new Date(`${upcoming.startDate}T00:00:00Z`) - new Date(`${String(date || new Date()).slice(0, 10)}T00:00:00Z`)) / 86400000);
    const s = state(profile, upcoming.observanceId, upcoming.year);
    if (days >= 1 && days <= 2 && s.dismissed !== true && s.notThisYear !== true && s.enabled !== true) return upcoming;
    return null;
  }
  function withState(profile, observanceId, year, patch) {
    const next = clone(profile);
    if (!next.jain) next.jain = root.ROOTS_JAIN_PROFILE.getSettings(next);
    if (!next.jain.observances) next.jain.observances = {};
    if (!next.jain.observances[observanceId]) next.jain.observances[observanceId] = {};
    next.jain.observances[observanceId][String(year)] = { ...(next.jain.observances[observanceId][String(year)] || {}), ...patch };
    return next;
  }
  function activate(profile, observanceId, settings) {
    const year = settings?.year || new Date().getFullYear();
    return withState(profile, observanceId, year, { enabled: true, notThisYear: false, dismissed: false, overrides: settings?.overrides || {}, activatedAt: new Date().toISOString() });
  }
  function dismissForYear(profile, observanceId, year) { return withState(profile, observanceId, year, { dismissed: true, notThisYear: true, enabled: false }); }
  function getActive(profile, date) {
    const event = root.ROOTS_JAIN_CALENDAR?.getActive(profile, date);
    if (!event) return null;
    return { ...event, enabled: isEnabled(profile, event), day: root.ROOTS_JAIN_CALENDAR.getDayNumber(event, date) };
  }
  root.ROOTS_JAIN_OBSERVANCES = Object.freeze({ VERSION, getUpcoming: (p, d) => root.ROOTS_JAIN_CALENDAR?.getUpcoming(p, d) || [], getActive, shouldPrompt, activate, dismissForYear, isEnabled });
})(typeof window !== "undefined" ? window : globalThis);
