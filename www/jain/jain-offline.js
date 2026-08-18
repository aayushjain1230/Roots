(function (root) {
  "use strict";
  const VERSION = 1;
  function snapshot(profile, date) {
    return {
      schemaVersion: 1, createdAt: new Date().toISOString(),
      effectiveProfile: root.ROOTS_JAIN_EFFECTIVE_PROFILE?.getEffectiveProfile({ profile, date }) || null,
      knowledgeVersion: root.ROOTS_JAIN_KNOWLEDGE?.VERSION || null,
      sourceVersion: root.ROOTS_JAIN_SOURCES?.VERSION || null,
      calendarVersion: root.ROOTS_JAIN_CALENDAR?.VERSION || null,
      ingredientDictionaryIds: root.ROOTS_JAIN_INGREDIENTS?.ids || [],
      explanationTemplateIds: (root.ROOTS_JAIN_KNOWLEDGE?.records || []).map((item) => item.id),
    };
  }
  root.ROOTS_JAIN_OFFLINE = Object.freeze({ VERSION, snapshot });
})(typeof window !== "undefined" ? window : globalThis);
