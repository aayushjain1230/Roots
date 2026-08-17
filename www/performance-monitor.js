(function (root) {
  "use strict";
  const MAX_ENTRIES = 500;
  let enabled = false, sequence = 0;
  const entries = [], tasks = new Map(), resources = new Map();
  const clock = () => root.performance?.now?.() ?? Date.now();
  const cleanName = (value) => String(value || "task").replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 80);
  const safeMetadata = (value) => {
    const output = {};
    Object.entries(value || {}).forEach(([key, item]) => {
      if (!/^(count|bytes|cache|status|code|source|stage|concurrency|durationMs)$/i.test(key)) return;
      if (typeof item === "number" || typeof item === "boolean") output[key] = item;
      else output[key] = String(item).slice(0, 80);
    });
    return output;
  };
  function push(entry) {
    if (!enabled) return null;
    entries.push(Object.freeze(entry));
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    return entry;
  }
  function mark(name) {
    if (!enabled) return null;
    const id = cleanName(name);
    root.performance?.mark?.(`roots:${id}`);
    return push({ type: "mark", name: id, at: clock() });
  }
  function measure(name, startMark, endMark) {
    if (!enabled) return null;
    const id = cleanName(name);
    let duration = 0;
    try {
      const result = root.performance?.measure?.(`roots:${id}`, `roots:${cleanName(startMark)}`, endMark ? `roots:${cleanName(endMark)}` : undefined);
      duration = result?.duration || 0;
    } catch (_) { /* missing browser marks use task timing instead */ }
    return push({ type: "measure", name: id, durationMs: duration, at: clock() });
  }
  function startTask(name, metadata) {
    const id = `${cleanName(name)}:${++sequence}`;
    if (enabled) tasks.set(id, { name: cleanName(name), startedAt: clock(), metadata: safeMetadata(metadata) });
    return id;
  }
  function endTask(id, metadata) {
    if (!enabled) return null;
    const task = tasks.get(id);
    if (!task) return null;
    tasks.delete(id);
    return push({ type: "task", name: task.name, durationMs: Math.max(0, clock() - task.startedAt), metadata: { ...task.metadata, ...safeMetadata(metadata) }, at: clock() });
  }
  function trackResource(type, delta) {
    const key = cleanName(type);
    resources.set(key, Math.max(0, (resources.get(key) || 0) + Number(delta || 0)));
    return resources.get(key);
  }
  function recordMemorySnapshot(label) {
    if (!enabled) return null;
    const memory = root.performance?.memory;
    return push({
      type: "memory", name: cleanName(label), at: clock(),
      usedJSHeapBytes: Number(memory?.usedJSHeapSize) || null,
      resources: Object.fromEntries(resources),
    });
  }
  function getReport() {
    return {
      enabled, generatedAt: new Date().toISOString(),
      entries: entries.slice(), activeTasks: tasks.size, resources: Object.fromEntries(resources),
    };
  }
  function clear() { entries.length = 0; tasks.clear(); resources.clear(); root.performance?.clearMarks?.(); root.performance?.clearMeasures?.(); }
  function enable() { enabled = true; mark("monitor_enabled"); return true; }
  function disable() { enabled = false; tasks.clear(); return false; }
  try {
    const queryEnabled = new URLSearchParams(root.location?.search || "").get("rootsPerformance") === "1";
    const storedEnabled = root.localStorage?.getItem?.("roots-performance-enabled") === "1";
    if (queryEnabled || storedEnabled) enable();
  } catch (_) { /* disabled by default */ }
  root.addEventListener?.("load", () => {
    if (!enabled) return;
    const navigation = root.performance?.getEntriesByType?.("navigation")?.[0];
    if (navigation) push({
      type: "navigation", name: "app_startup", at: clock(),
      htmlParseMs: Math.max(0, navigation.domInteractive - navigation.responseEnd),
      domInteractiveMs: navigation.domInteractive,
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      loadMs: navigation.loadEventEnd,
    });
  }, { once: true });
  root.ROOTS_PERFORMANCE = { mark, measure, startTask, endTask, recordMemorySnapshot, getReport, clear, enable, disable, trackResource, isEnabled: () => enabled };
})(typeof window !== "undefined" ? window : globalThis);
