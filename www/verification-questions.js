(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  function generate(context) {
    const records = [], seen = new Set();
    const add = (text, reason, priority) => {
      const value = clean(text);
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      records.push({ id: `verify-${records.length + 1}`, text: value, priority, sourceReasonId: reason?.id || "", deterministic: true });
    };
    (context?.reasons || []).forEach((reason) => {
      if (reason.evidenceKind === "source") add(`Can you confirm the source of ${context.subject.displayName}?`, reason, "must_ask");
      else if (reason.evidenceKind === "quantity") add("What amount is present per serving?", reason, "must_ask");
      else if (reason.evidenceKind === "preparation") add(`How is ${context.subject.displayName} prepared?`, reason, "must_ask");
      else if (reason.evidenceKind === "cross_contact") add("Does this use shared equipment, utensils, fryers, grills, or preparation areas?", reason, "must_ask");
      else if (reason.evidenceKind === "certification") add("Is there a current certification that applies to this exact product or dish?", reason, "must_ask");
    });
    (context?.verificationQuestions || []).forEach((question) => add(question, null, "helpful"));
    return records.slice(0, 6);
  }
  root.ROOTS_VERIFICATION_QUESTIONS = { generate };
})(typeof window !== "undefined" ? window : globalThis);
