(function (root) {
  "use strict";
  const STATES = Object.freeze({ ONLINE: "ONLINE", OFFLINE: "OFFLINE", DEGRADED: "DEGRADED" });
  const META_KEY = "roots-connectivity-meta-v1";
  const listeners = new Set();
  let state = root.navigator?.onLine === false ? STATES.OFFLINE : STATES.ONLINE;
  let changedAt = new Date().toISOString();
  let lastKnownOnlineAt = (() => { try { return JSON.parse(root.localStorage?.getItem(META_KEY) || "{}").lastKnownOnlineAt || (state === STATES.ONLINE ? changedAt : null); } catch (_) { return state === STATES.ONLINE ? changedAt : null; } })();
  function dispatch(name, detail) {
    try { root.dispatchEvent?.(new root.CustomEvent(name, { detail })); } catch (_) { /* events are optional in non-browser runtimes */ }
  }
  function set(next, reason) {
    if (!Object.values(STATES).includes(next)) return state;
    if (next === state) return state;
    const previous = state;
    state = next; changedAt = new Date().toISOString();
    if (state === STATES.ONLINE) lastKnownOnlineAt = changedAt;
    try { root.localStorage?.setItem(META_KEY, JSON.stringify({ lastKnownOnlineAt, changedAt, state })); } catch (_) { /* connectivity remains in memory */ }
    listeners.forEach((listener) => { try { listener(snapshot(), reason || "state_change"); } catch (_) { /* isolated observer */ } });
    if (state === STATES.ONLINE && previous !== STATES.ONLINE) dispatch("roots:connectionrestored", snapshot());
    if (state === STATES.OFFLINE && previous !== STATES.OFFLINE) dispatch("roots:connectionlost", snapshot());
    dispatch("roots:connectivitychange", snapshot());
    return state;
  }
  const snapshot = () => Object.freeze({ state, changedAt, lastKnownOnlineAt, online: state === STATES.ONLINE, offline: state === STATES.OFFLINE, degraded: state === STATES.DEGRADED });
  const subscribe = (listener) => { if (typeof listener !== "function") return () => {}; listeners.add(listener); return () => listeners.delete(listener); };
  root.addEventListener?.("online", () => set(STATES.ONLINE, "platform_online"));
  root.addEventListener?.("offline", () => set(STATES.OFFLINE, "platform_offline"));
  root.ROOTS_CONNECTIVITY = Object.freeze({ STATES, get: snapshot, subscribe, noteSuccess: () => set(STATES.ONLINE, "request_success"), noteFailure: () => set(root.navigator?.onLine === false ? STATES.OFFLINE : STATES.DEGRADED, "request_failure"), setForTesting: set, constants: { META_KEY } });
})(typeof window !== "undefined" ? window : globalThis);
