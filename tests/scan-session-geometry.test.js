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

const review = loadReview();
const plain = (value) => JSON.parse(JSON.stringify(value));

test("contained rendered rectangles preserve portrait, landscape, narrow, and square aspect ratios", () => {
  const stage = { width: 390, height: 520 };
  const cases = [[1600, 900], [900, 1600], [600, 2400], [1200, 1200]];
  cases.forEach(([width, height]) => {
    const rect = review.getRenderedImageRect(stage, width, height);
    assert.ok(rect.width <= stage.width && rect.height <= stage.height);
    assert.ok(Math.abs(rect.width / rect.height - width / height) < 1e-9);
  });
  assert.deepEqual(plain(review.getRenderedImageRect({ width: 400, height: 400 }, 200, 400)),
    { left: 100, top: 0, width: 200, height: 400, baseWidth: 200, baseHeight: 400 });
});

test("normalized and rendered crop conversion round trips inside letterboxed image bounds", () => {
  const rect = review.getRenderedImageRect({ width: 400, height: 400 }, 200, 400);
  const normalized = { x: .15, y: .2, width: .7, height: .45 };
  const rendered = review.normalizedToRendered(normalized, rect);
  assert.ok(rendered.left >= rect.left && rendered.top >= rect.top);
  assert.ok(rendered.left + rendered.width <= rect.left + rect.width);
  assert.deepEqual(plain(review.renderedToNormalized(rendered, rect)), normalized);
});

test("rotation transforms normalized crops and swaps canonical oriented dimensions", () => {
  const crop = { x: .1, y: .2, width: .3, height: .4 };
  const rotated90 = review.transformCropForRotation(crop, 90);
  assert.ok(Math.abs(rotated90.x - .4) < 1e-12);
  assert.deepEqual(plain({ y: rotated90.y, width: rotated90.width, height: rotated90.height }), { y: .1, width: .4, height: .3 });
  const rotated180 = review.transformCropForRotation(crop, 180);
  assert.ok(Math.abs(rotated180.x - .6) < 1e-12 && Math.abs(rotated180.y - .4) < 1e-12);
  const rotated270 = review.transformCropForRotation(crop, 270);
  assert.ok(Math.abs(rotated270.x - .2) < 1e-12 && Math.abs(rotated270.y - .6) < 1e-12);
  const state = review.createState({ name: "portrait.jpg", type: "image/jpeg" }, "library");
  state.geometry.naturalWidth = 900;
  state.geometry.naturalHeight = 1600;
  state.geometry.orientedWidth = 900;
  state.geometry.orientedHeight = 1600;
  review.rotateState(state);
  assert.equal(state.geometry.orientedWidth, 1600);
  assert.equal(state.geometry.orientedHeight, 900);
});

test("OCR source coordinates use original oriented pixels and ignore CSS display size", () => {
  const state = review.createState({ name: "label.jpg", type: "image/jpeg" }, "library");
  state.geometry.orientedWidth = 2400;
  state.geometry.orientedHeight = 3200;
  state.geometry.normalizedCrop = { x: .25, y: .2, width: .5, height: .4 };
  state.geometry.renderedRect = { left: 20, top: 40, width: 120, height: 160 };
  assert.deepEqual(plain(review.sourceCropPixels(state)), { x: 600, y: 640, width: 1200, height: 1280 });
});

test("quality warnings are based on source crop pixels, not displayed pixels", () => {
  const highResolution = review.createState({ name: "narrow.jpg", type: "image/jpeg" }, "library");
  highResolution.geometry.orientedWidth = 4000;
  highResolution.geometry.orientedHeight = 3000;
  highResolution.geometry.normalizedCrop = { x: .35, y: .1, width: .3, height: .8 };
  highResolution.geometry.renderedRect = { left: 180, top: 0, width: 30, height: 500 };
  assert.equal(review.qualityWarningsForCrop(highResolution).some((warning) => warning.code === "image_too_small"), false);

  const lowResolution = review.createState({ name: "small.jpg", type: "image/jpeg" }, "library");
  lowResolution.geometry.orientedWidth = 500;
  lowResolution.geometry.orientedHeight = 250;
  assert.equal(review.qualityWarningsForCrop(lowResolution).some((warning) => warning.code === "image_too_small"), true);
});

test("source retains original and processed representations until explicit disposal", () => {
  const source = fs.readFileSync("www/image-review.js", "utf8");
  assert.match(source, /originalBlob:\s*file/);
  assert.match(source, /processedBlob:\s*null/);
  assert.match(source, /async function restore\(\)/);
  assert.match(source, /if \(state\.processedFile && state\.processedMetadata\)/);
  assert.match(source, /function invalidateProcessed\(\)/);
  assert.match(source, /releaseUrl\(session\)/);
});

test("retry is same-image, attempt-isolated, and processing begins after two paints", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  const processing = fs.readFileSync("www/scan-processing.js", "utf8");
  assert.match(script, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
  assert.match(script, /const prepared = await reviewControl\.prepare\(\)/);
  assert.match(script, /processing\.isAttemptCurrent\(sessionId, attempt\)/);
  assert.match(processing, /session\.attempt \+= 1/);
  assert.match(processing, /session\.abortController = new AbortController\(\)/);
  assert.match(processing, /active\.attempt === attempt/);
});

test("same-file selection clears inputs without discarding retained image state", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /function openLabelImagePicker[\s\S]*fileInput\.value = ""[\s\S]*fileInput\.click\(\)/);
  assert.match(script, /const file = e\.target\.files\[0\];[\s\S]*e\.target\.value = ""/);
  assert.match(script, /barcodeInput\.value = "";\s*barcodeInput\.click\(\)/);
  assert.match(script, /pendingImageReplacement && !replacementAccepted[\s\S]*ROOTS_IMAGE_REVIEW\?\.restore/);
});

test("processing animation has lifecycle, real stages, and reduced-motion behavior", () => {
  const animation = fs.readFileSync("www/home-animation.js", "utf8");
  const processing = fs.readFileSync("www/scan-processing.js", "utf8");
  const css = fs.readFileSync("www/styles.css", "utf8");
  assert.match(animation, /createProcessingController/);
  ["start", "setStage", "complete", "fail", "stop", "reset"].forEach((name) => {
    assert.ok(animation.includes(`function ${name}(`), name);
  });
  assert.match(processing, /ROOTS_PROCESSING_ANIMATION\?\.start/);
  assert.match(processing, /ROOTS_PROCESSING_ANIMATION\?\.setStage/);
  assert.match(processing, /ROOTS_PROCESSING_ANIMATION\?\.fail/);
  assert.match(css, /\.processing-animation[^}]*height:\s*210px/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*processing-animation/);
});

test("new scan entry uses one canonical reset lifecycle", () => {
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(script, /function resetScanSession\(options = \{\}\)/);
  assert.match(script, /ROOTS_REPORT\?\.close\?\.\(false\)/);
  assert.match(script, /ROOTS_SCAN_PROCESSING\?\.reset\?\.\(\)/);
  assert.match(script, /ROOTS_IMAGE_REVIEW\?\.dispose\?\.\(false\)/);
  assert.match(script, /ROOTS_SCAN_PIPELINE\?\.clearCurrent\?\.\(\)/);
  assert.match(script, /fileInput\) fileInput\.value = ""/);
  assert.match(script, /barcodeInput\) barcodeInput\.value = ""/);
  assert.match(script, /result\.innerHTML = ""/);
  assert.match(script, /classList\.remove\("has-scan-result", "report-view-active", "capture-active"\)/);
  assert.match(script, /function startFreshScan[\s\S]*resetScanSession\(\{ reason: "open_scan_entry" \}\)[\s\S]*openScanEntry/);
  assert.match(script, /scan-entry-btn"\)\?\.addEventListener\("click", \(\) => startFreshScan\(\)\)/);
});

test("report scan-another action reuses the canonical new-scan path", () => {
  const report = fs.readFileSync("www/report-view.js", "utf8");
  const script = fs.readFileSync("www/script.js", "utf8");
  assert.match(report, /data-action="scan-again">Scan another product<\/button>/);
  assert.match(script, /onScanAgain:\s*\(\) => startFreshScan\(\)/);
  assert.doesNotMatch(script, /onScanAgain:\s*\(\) => \{[\s\S]*fileInput\.value = "";[\s\S]*barcodeInput\.value = "";[\s\S]*\}/);
});
