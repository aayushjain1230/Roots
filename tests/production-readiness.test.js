const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("viewport permits user zoom and text scaling", () => {
  const html = read("www/index.html");
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
});

test("production shell contains bounded user inputs", () => {
  const html = read("www/index.html");
  for (const id of ["chatInput", "recipeInput", "mealInput", "shopInput"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*maxlength="\\d+"`));
  }
  const profile = read("www/profile-ui.js");
  for (const id of ["custom-allergy", "dislike-input", "rule-input"]) {
    assert.match(profile, new RegExp(`id="${id}"[^>]*maxlength="80"`));
  }
});

test("service worker caches static shell only and has navigation fallback", () => {
  const sw = read("www/sw.js");
  assert.match(sw, /roots-shell-v5c-1/);
  assert.match(sw, /req\.mode === "navigate"/);
  assert.match(sw, /caches\.match\("\.\/index\.html"\)/);
  assert.doesNotMatch(sw, /generativelanguage|openfoodfacts|roots-profile|roots-saved-products/);
  const assets = [...sw.matchAll(/"\.\/([^"?]+)"/g)].map((match) => match[1]);
  for (const asset of assets) assert.ok(fs.existsSync(path.join(__dirname, "..", "www", asset)), asset);
});

test("manifest supplies raster and maskable production icons", () => {
  const manifest = JSON.parse(read("www/manifest.webmanifest"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => String(icon.purpose).includes("maskable")));
});

test("obsolete animation and font assets are absent", () => {
  for (const file of [
    "www/lottie-light.min.js", "www/animations/scan.json",
    "www/fonts/poppins-400.woff2", "www/fonts/poppins-500.woff2",
    "www/fonts/poppins-600.woff2", "www/fonts/poppins-700.woff2",
  ]) assert.equal(fs.existsSync(path.join(__dirname, "..", file)), false, file);
});

test("image review lifecycle removes temporary listeners and objects", () => {
  const source = read("www/image-review.js");
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /source\.close/);
  assert.match(source, /removeEventListener\("wheel", wheel\)/);
  assert.match(source, /document\.removeEventListener\("keydown", keydown\)/);
  assert.match(source, /pointers\.clear\(\)/);
});

test("runtime sources contain no unconditional debug logging or TODOs", () => {
  const files = fs.readdirSync(path.join(__dirname, "..", "www"))
    .filter((name) => name.endsWith(".js"))
    .filter((name) => name !== "scan-processing.js");
  const source = files.map((name) => read(`www/${name}`)).join("\n");
  assert.doesNotMatch(source, /console\.(log|warn|error)\s*\(/);
  assert.doesNotMatch(source, /\bTODO\b|\bFIXME\b/);
  const processing = read("www/scan-processing.js");
  assert.match(processing, /ROOTS_DEBUG !== true/);
});

test("tracked configuration contains no Gemini key or paste-key prompt", () => {
  const files = ["www/config.example.js", "www/index.html", "www/ocr.js"];
  const source = files.map(read).join("\n");
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(source, /PASTE_YOUR_GEMINI_API_KEY/i);
});

test("release documentation is ROOTS-specific and contains no fake contact values", () => {
  const docs = [read("AGENTS.md"), read("SUBMISSION.md"), read("CLAUDE.md")].join("\n");
  assert.match(docs, /ROOTS/);
  assert.doesNotMatch(docs, /\[DATE\]|\[your email\]|lorem ipsum/i);
});
