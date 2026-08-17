const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadReview() {
  const context = { console, URL: { revokeObjectURL() {} } };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("www/image-review.js", "utf8"), context);
  return context.ROOTS_IMAGE_REVIEW;
}

function loadCamera(getUserMedia) {
  const listeners = new Map();
  const context = {
    console,
    navigator: { mediaDevices: getUserMedia ? { getUserMedia } : undefined },
    document: {
      hidden: false,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type) { listeners.delete(type); },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("www/camera-capture.js", "utf8"), context);
  return { api: context.ROOTS_CAMERA, document: context.document, listeners };
}

const review = loadReview();

test("source chooser and review controls are connected and accessible", () => {
  const html = fs.readFileSync("www/index.html", "utf8");
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(html, /Take Photo/);
  assert.match(html, /Choose (?:from )?Library/);
  assert.match(html, /id="image-review-screen"[^>]*role="dialog"/);
  assert.match(html, /id="review-rotate"/);
  assert.match(html, /id="review-revert"/);
  assert.match(html, /id="review-retake"/);
  assert.match(html, /id="review-use"/);
  assert.equal((html.match(/data-handle="/g) || []).length, 4);
  assert.match(html, /data-crop-adjust="left"/);
  assert.match(script, /deferProcessing:\s*true/);
  assert.match(script, /onUse:\s*\(_workingFile,\s*_metadata,\s*control\)\s*=>\s*handleFile\(control\)/);
});

test("rotation cycles through every right angle without changing the original", () => {
  const file = { name: "label.jpg" };
  const state = review.createState(file, "library");
  assert.equal(state.rotation, 0);
  [90, 180, 270, 0].forEach((expected) => {
    review.rotateState(state);
    assert.equal(state.rotation, expected);
    assert.equal(state.originalFile, file);
  });
});

test("crop movement and corner resizing remain normalized and usable", () => {
  const moved = review.moveCrop({ x: .1, y: .1, width: .5, height: .5 }, 2, -2);
  assert.deepEqual(JSON.parse(JSON.stringify(moved)), { x: .5, y: 0, width: .5, height: .5 });
  for (const handle of ["nw", "ne", "sw", "se"]) {
    const crop = review.resizeCrop({ x: .2, y: .2, width: .6, height: .6 }, handle, 5, 5);
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(crop.x + crop.width <= 1 && crop.y + crop.height <= 1);
    assert.ok(crop.width >= review.constants.MIN_CROP);
    assert.ok(crop.height >= review.constants.MIN_CROP);
  }
});

test("zoom and pan clamp, while revert restores the untouched full image", () => {
  const file = { name: "original.png" };
  const state = review.createState(file, "camera");
  review.setZoom(state, 99);
  review.setPan(state, 99, -99);
  assert.equal(state.zoom, review.constants.MAX_ZOOM);
  assert.ok(Math.abs(state.panX) <= 1);
  assert.ok(Math.abs(state.panY) <= 1);
  review.rotateState(state);
  state.crop = { x: .3, y: .3, width: .2, height: .2 };
  review.revertState(state);
  assert.equal(state.rotation, 0);
  assert.equal(state.zoom, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.crop)), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(state.originalFile, file);
});

test("working image path is bounded JPEG and guards duplicate Use Photo", () => {
  const source = fs.readFileSync("www/image-review.js", "utf8");
  assert.match(source, /2200 \/ Math\.max\(pixels\.width, pixels\.height\)/);
  assert.match(source, /"image\/jpeg", 0\.92/);
  assert.match(source, /new File\(\[blob\]/);
  assert.match(source, /if \(!session \|\| submitting\) return/);
  assert.match(source, /submitting = true/);
  assert.match(source, /URL\.revokeObjectURL/);
});

test("camera requests the rear camera, cleans up tracks, and reports permission states", async () => {
  let attempts = 0;
  const stopped = [];
  const track = {
    stop() { stopped.push(true); },
    getCapabilities() { return { torch: true }; },
    async applyConstraints() {},
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const requested = [];
  const camera = loadCamera(async (constraints) => {
    attempts += 1;
    requested.push(constraints);
    if (attempts < 3) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    return stream;
  }).api;
  const video = { srcObject: null, async play() {} };
  await assert.rejects(camera.start(video), (error) => error.code === "permission_denied");
  await assert.rejects(camera.start(video), (error) => error.code === "permission_denied_permanently");
  const caps = await camera.start(video);
  assert.equal(caps.camera, true);
  assert.equal(caps.torch, true);
  assert.equal(requested[0].video.facingMode.ideal, "environment");
  assert.equal(requested[0].audio, false);
  camera.stop();
  assert.equal(stopped.length, 1);
});

test("unsupported camera has an honest fallback and camera screen is responsive", async () => {
  const camera = loadCamera().api;
  await assert.rejects(camera.start({}), (error) => error.code === "camera_unavailable");
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.capture-screen/);
  assert.match(css, /\.review-screen/);
  assert.match(css, /@media \(orientation: landscape\)/);
});

test("service worker caches every Phase 3B module", () => {
  const sw = fs.readFileSync("www/sw.js", "utf8");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /\.\/camera-capture\.js/);
  assert.match(sw, /\.\/image-review\.js/);
});
