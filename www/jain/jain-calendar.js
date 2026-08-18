(function (root) {
  "use strict";
  const VERSION = 1;
  const events = Object.freeze([
    { id: "paryushan-2026", observanceId: "paryushan", label: "Paryushan", year: 2026, startDate: "2026-09-08", endDate: "2026-09-15", traditionApplicability: ["shwetambar"], observanceRulesetId: "paryushan", sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "samvatsari-2026", observanceId: "samvatsari", label: "Samvatsari", year: 2026, startDate: "2026-09-15", endDate: "2026-09-15", traditionApplicability: ["shwetambar"], observanceRulesetId: "paryushan", sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "das-lakshan-2026", observanceId: "das_lakshan", label: "Das Lakshan", year: 2026, startDate: "2026-09-16", endDate: "2026-09-25", traditionApplicability: ["digambar"], observanceRulesetId: "das_lakshan", sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "kshamavani-2026", observanceId: "kshamavani", label: "Kshamavani", year: 2026, startDate: "2026-09-26", endDate: "2026-09-26", traditionApplicability: ["digambar"], observanceRulesetId: "das_lakshan", sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "mahavir-jayanti-2026", observanceId: "mahavir_jayanti", label: "Mahavir Jayanti", year: 2026, startDate: "2026-03-31", endDate: "2026-03-31", traditionApplicability: ["general"], observanceRulesetId: null, sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "ayambil-oli-spring-2026", observanceId: "ayambil_oli", label: "Ayambil Oli", year: 2026, startDate: "2026-04-20", endDate: "2026-04-28", traditionApplicability: ["general"], observanceRulesetId: null, sourceRefs: ["jain-calendar-static-v1"], version: 1 },
    { id: "ayambil-oli-fall-2026", observanceId: "ayambil_oli", label: "Ayambil Oli", year: 2026, startDate: "2026-10-17", endDate: "2026-10-25", traditionApplicability: ["general"], observanceRulesetId: null, sourceRefs: ["jain-calendar-static-v1"], version: 1 },
  ]);
  const day = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  const inRange = (event, date) => day(event.startDate) <= day(date) && day(date) <= day(event.endDate);
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
  function applies(event, profile) {
    const t = root.ROOTS_JAIN_PROFILE?.getSettings?.(profile).tradition || "not_sure";
    return event.traditionApplicability.includes("general") || event.traditionApplicability.includes(t);
  }
  function active(profile, date) { return events.find((event) => applies(event, profile) && inRange(event, date || new Date())) || null; }
  function upcoming(profile, date) {
    const now = day(date || new Date());
    return events.filter((event) => applies(event, profile) && day(event.startDate) >= now).sort((a, b) => day(a.startDate) - day(b.startDate));
  }
  function dayNumber(event, date) { return event ? Math.max(1, daysBetween(event.startDate, date || new Date()) + 1) : null; }
  root.ROOTS_JAIN_CALENDAR = Object.freeze({ VERSION, events, getActive: active, getUpcoming: upcoming, getDayNumber: dayNumber });
})(typeof window !== "undefined" ? window : globalThis);
