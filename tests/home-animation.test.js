const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    toggle: (item, force) => force ? (values.add(item), true) : (values.delete(item), false),
  };
}

function harness({ reduced = false, home = true, hidden = false } = {}) {
  const listeners = new Map();
  const mediaListeners = new Set();
  const timers = new Map();
  let nextTimer = 1;
  const container = { classList: classList(), dataset: {}, style: {}, hidden: false, innerHTML: "", offsetWidth: 400 };
  const tipText = { classList: classList(), textContent: "" };
  const homeView = { classList: classList(home ? ["active"] : []) };
  const document = {
    hidden,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type) { listeners.get(type)?.forEach((fn) => fn()); },
  };
  const media = {
    matches: reduced,
    addEventListener(_type, fn) { mediaListeners.add(fn); },
    removeEventListener(_type, fn) { mediaListeners.delete(fn); },
    change(value) { this.matches = value; mediaListeners.forEach((fn) => fn()); },
  };
  const setTimeout = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const window = { matchMedia: () => media, setTimeout, clearTimeout };
  return {
    container, tipText, homeView, document, media, timers, window, setTimeout, clearTimeout,
    fireNext(ms) {
      const found = [...timers.entries()].find(([, timer]) => timer.ms === ms);
      if (!found) return false;
      timers.delete(found[0]);
      found[1].fn();
      return true;
    },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) + mediaListeners.size,
  };
}

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("www/home-animation.js", "utf8"), context);
const API = context.ROOTS_HOME_ANIMATION;

test("Home contains required structure and four destinations", () => {
  const html = fs.readFileSync("www/index.html", "utf8");
  assert.match(html, /data-brand-name/);
  assert.match(html, /id="active-profile-summary"/);
  assert.doesNotMatch(html.slice(html.indexOf('<section id="scanView"'), html.indexOf('<section id="assistantView"')), /id="scanAnimation"|id="tip-box"/);
  assert.match(html, /id="scan-entry-btn"/);
  assert.match(html, /id="scanEntryModal"/);
  assert.match(html, /id="scan-barcode-btn"/);
  assert.match(html, /id="scan-label-btn"/);
  assert.match(html, /id="scan-photo-btn"/);
  assert.equal((html.match(/class="dock-btn/g) || []).length, 4);
});

test("custom SVG has one package, one smartphone camera UI, and one badge", () => {
  assert.equal((API.SVG.match(/class="package-group"/g) || []).length, 1);
  assert.equal((API.SVG.match(/class="phone-group"/g) || []).length, 1);
  assert.equal((API.SVG.match(/class="phone-screen"/g) || []).length, 1);
  assert.equal((API.SVG.match(/class="focus-frame"/g) || []).length, 1);
  assert.equal((API.SVG.match(/class="result-badge-group"/g) || []).length, 1);
  assert.doesNotMatch(API.SVG, /camera-group|camera-lens|flash-group/);
  assert.doesNotMatch(API.SVG, /<image|https?:|emoji/i);
});

test("controller creates one running loop and one tip timer", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media, tipIntervalMs: 7000 });
  assert.equal(h.container.dataset.controllerCount, "1");
  assert.equal(controller.getState().running, true);
  assert.equal(controller.getState().timerActive, true);
  assert.equal([...h.timers.values()].filter((timer) => timer.ms === 7000).length, 1);
  controller.sync();
  assert.equal([...h.timers.values()].filter((timer) => timer.ms === 7000).length, 1);
});

test("leaving and returning Home pauses and resumes once", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media, tipIntervalMs: 7000 });
  h.homeView.classList.remove("active");
  h.document.dispatch("roots:viewchange");
  assert.equal(controller.getState().running, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.container.dataset.animationState, "paused");
  h.homeView.classList.add("active");
  h.document.dispatch("roots:viewchange");
  assert.equal(controller.getState().running, true);
  assert.equal([...h.timers.values()].filter((timer) => timer.ms === 7000).length, 1);
});

test("document visibility pauses and resumes animation and tips", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media });
  h.document.hidden = true;
  h.document.dispatch("visibilitychange");
  assert.equal(controller.getState().running, false);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.document.dispatch("visibilitychange");
  assert.equal(controller.getState().running, true);
  assert.equal(controller.getState().timerActive, true);
});

test("tips rotate statically and do not duplicate", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media, tipIntervalMs: 7000 });
  const first = h.tipText.textContent;
  assert.equal(h.fireNext(7000), true);
  assert.notEqual(h.tipText.textContent, first);
  assert.equal(controller.getState().tipIndex, 1);
  assert.equal([...h.timers.values()].filter((timer) => timer.ms === 7000).length, 1);
  assert.ok(API.TIPS.every((tip) => !/[<>]/.test(tip)));
});

test("reduced motion uses a static phone and disables timers", () => {
  const h = harness({ reduced: true });
  const controller = API.createController({ ...h, motionMedia: h.media });
  assert.equal(controller.getState().running, false);
  assert.equal(controller.getState().reducedMotion, true);
  assert.equal(h.container.classList.contains("is-reduced"), true);
  assert.equal(h.timers.size, 0);
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.match(css, /\.scan-illus\.is-reduced \.phone-group\s*\{[^}]*opacity:\s*1[^}]*transition:\s*none/s);
  assert.doesNotMatch(css, /\.scan-illus\.is-reduced \.phone-group\s*\{[^}]*rotate/s);
});

test("theme changes reuse the same controller and do not duplicate timers", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media });
  h.document.dispatch("roots:themechange");
  assert.equal(h.container.dataset.controllerCount, "1");
  assert.equal([...h.timers.values()].filter((timer) => timer.ms === 7000).length, 1);
  assert.equal(controller.getState().destroyed, false);
});

test("destroy removes timers and every listener", () => {
  const h = harness();
  const controller = API.createController({ ...h, motionMedia: h.media });
  controller.destroy();
  assert.equal(controller.getState().destroyed, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.container.dataset.controllerCount, "0");
  assert.equal(h.listenerCount(), 0);
});

test("scan actions retain original handlers and native button accessibility", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  const html = fs.readFileSync("www/index.html", "utf8");
  assert.match(script, /scanBarcodeBtn\.addEventListener\("click", \(\) => \{ closeModal\(scanEntryModal\); startBarcodeScanner\(\); \}\)/);
  assert.match(script, /fileInput\.addEventListener\("change"/);
  assert.match(script, /barcodeInput\.addEventListener\("change"/);
  assert.match(script, /getElementById\("scan-label-btn"\)\?\.addEventListener\("click", \(\) => \{ closeModal\(scanEntryModal\); startLabelCamera\(\); \}\)/);
  assert.match(script, /getElementById\("scan-photo-btn"\)\?\.addEventListener/);
  assert.match(html, /id="scan-barcode-btn"[^>]*type="button"/);
  assert.match(html, /id="scan-label-btn"[^>]*type="button"/);
});

test("layout and waypoints are relative to an SVG viewBox", () => {
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.match(API.SVG, /viewBox="0 0 400 300"/);
  assert.match(css, /\.scan-illus\s*\{[^}]*width:\s*min\(100%, 400px\)[^}]*aspect-ratio:\s*4 \/ 3/s);
  assert.doesNotMatch(css, /\.scan-illus\s*\{[^}]*width:\s*\d{3,}px/s);
  assert.match(css, /\.state-scan_one \.phone-group,[^{]*\.state-scan_one_flash \.phone-group[^}]*translate\(149px,85px\)/);
  assert.match(css, /\.state-scan_two \.phone-group,[^{]*\.state-scan_two_flash \.phone-group[^}]*translate\(123px,60px\)/);
  assert.match(css, /\.state-scan_three \.phone-group,[^{]*\.state-scan_three_flash \.phone-group[^}]*translate\(174px,73px\)/);
  assert.doesNotMatch(css, /\.phone-group[^}]*rotate|perspective|rotate[XYZ]/);
});

test("phone stays opaque until completion and fades only while exiting", () => {
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.doesNotMatch(css.match(/\.state-entering \.phone-group\s*\{([^}]*)\}/)?.[1] || "", /opacity\s*:\s*0/);
  for (const state of ["scan_one", "scan_two", "scan_three"]) assert.match(css, new RegExp(`\\.state-${state} \\.phone-group,[^{]*\\.state-${state}_flash \\.phone-group \\{[^}]*opacity:1`));
  assert.match(css, /\.state-exiting \.phone-group\s*\{[^}]*opacity:\s*0/s);
  assert.equal(API.SEQUENCE.filter(([state]) => /^scan_/.test(state)).map(([state]) => state).join(","), "scan_one,scan_one_flash,scan_two,scan_two_flash,scan_three,scan_three_flash");
  assert.ok(API.SEQUENCE.findIndex(([state]) => state === "result") > API.SEQUENCE.findIndex(([state]) => state === "complete"));
});

test("service worker caches new controller and no obsolete animation assets", () => {
  const sw = fs.readFileSync("www/sw.js", "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /\.\/home-animation\.js/);
  assert.match(sw, /\.\/camera-capture\.js/);
  assert.match(sw, /\.\/image-review\.js/);
  assert.doesNotMatch(sw, /lottie-light|animations\/scan\.json/);
});
