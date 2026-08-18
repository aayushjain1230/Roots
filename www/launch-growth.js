(function (root) {
  "use strict";
  const VERSION = 1;
  const KEY = "roots-launch-milestones-v1";
  const ALLOWED = new Set(["profile_created", "first_scan", "first_save", "first_restaurant_search", "invite_shared"]);
  const read = () => { try { const value = JSON.parse(root.localStorage?.getItem(KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } };
  const write = (value) => { try { root.localStorage?.setItem(KEY, JSON.stringify(value)); return true; } catch (_) { return false; } };
  function mark(name, options) {
    if (!ALLOWED.has(name)) return false;
    const state = read();
    if (state[name] && options?.once !== false) return false;
    state[name] = { at: new Date().toISOString(), count: Math.min(100000, Number(state[name]?.count || 0) + 1) };
    return write(state);
  }
  function progress() {
    const state = read();
    return Object.freeze({ schemaVersion: VERSION, completed: [...ALLOWED].filter((name) => Boolean(state[name])), milestones: state });
  }
  function invitePayload(options) {
    const url = String(options?.url || root.APP_BRAND?.website || "").trim();
    if (url && !/^https:\/\//i.test(url)) throw new TypeError("Invite URL must use HTTPS.");
    return Object.freeze({ title: "Roots", text: "Roots helps you understand which foods fit your dietary needs.", url });
  }
  async function shareInvite(options) {
    const payload = invitePayload(options);
    if (!payload.url) return { status: "unavailable", reason: "public_url_not_configured" };
    if (typeof root.navigator?.share === "function") {
      await root.navigator.share(payload);
      mark("invite_shared", { once: false });
      return { status: "shared" };
    }
    if (typeof root.navigator?.clipboard?.writeText === "function") {
      await root.navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
      mark("invite_shared", { once: false });
      return { status: "copied" };
    }
    return { status: "unavailable", reason: "share_not_supported" };
  }
  root.ROOTS_LAUNCH = Object.freeze({ VERSION, mark, progress, invitePayload, shareInvite, clear: () => write({}), constants: { KEY, ALLOWED: [...ALLOWED] } });
})(typeof window !== "undefined" ? window : globalThis);
