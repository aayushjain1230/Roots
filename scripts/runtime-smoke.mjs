#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const apiBase = String(process.env.ROOTS_API_BASE || process.argv[2] || "http://127.0.0.1:8000").replace(/\/+$/, "");
const imagePath = process.env.ROOTS_SMOKE_IMAGE || process.argv[3] || "";
const timeoutMs = Number(process.env.ROOTS_SMOKE_TIMEOUT_MS || 15000);

function fail(message, detail = {}) {
  console.error(JSON.stringify({ ok: false, message, ...detail }, null, 2));
  process.exitCode = 1;
}
function pass(message, detail = {}) {
  console.log(JSON.stringify({ ok: true, message, ...detail }, null, 2));
}
async function withTimeout(task, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out`)), timeoutMs);
  try { return await task(controller.signal); }
  finally { clearTimeout(timer); }
}
async function getJson(url) {
  const response = await withTimeout((signal) => fetch(url, { signal, cache: "no-store" }), url);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { response, data };
}
async function postJson(url, body) {
  const response = await withTimeout((signal) => fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), url);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { response, data };
}
async function main() {
  if (!/^https?:\/\//.test(apiBase)) return fail("ROOTS_API_BASE must be an http(s) URL.", { apiBase });

  const healthUrl = `${apiBase}/health`;
  const health = await getJson(healthUrl);
  if (!health.response.ok) return fail("API health failed.", { url: healthUrl, status: health.response.status, data: health.data });
  pass("API health reachable.", { url: healthUrl, status: health.response.status, providerConfigured: health.data?.providerConfigured });

  const geocodeUrl = `${apiBase}/v1/restaurants/geocode?q=Rockville%2C%20MD`;
  const geocode = await getJson(geocodeUrl);
  if (!geocode.response.ok || !Array.isArray(geocode.data?.results) || !geocode.data.results.length) {
    return fail("Restaurant geocode smoke failed.", { url: geocodeUrl, status: geocode.response.status, data: geocode.data });
  }
  const location = geocode.data.results[0];
  pass("Restaurant geocode smoke passed.", { url: geocodeUrl, status: geocode.response.status, first: location.label });

  const discoverUrl = `${apiBase}/v1/restaurants/discover`;
  const cuisines = ["anything", "Thai", "Indian", "Chinese", "Mexican", "Italian", "Mediterranean"];
  for (const meal of cuisines) {
    const discover = await postJson(discoverUrl, { meal, radiusMiles: 5, location });
    const count = Array.isArray(discover.data?.restaurants) ? discover.data.restaurants.length : -1;
    if (!discover.response.ok || count < 0) return fail("Restaurant discovery smoke failed.", { url: discoverUrl, meal, status: discover.response.status, data: discover.data });
    pass("Restaurant discovery smoke passed.", { meal, status: discover.response.status, count });
  }

  if (imagePath) {
    const absolute = path.resolve(imagePath);
    if (!fs.existsSync(absolute)) return fail("OCR smoke image not found.", { imagePath: absolute });
    const bytes = fs.readFileSync(absolute);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: absolute.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }), path.basename(absolute));
    const ocrUrl = `${apiBase}/v1/ocr/label`;
    const response = await withTimeout((signal) => fetch(ocrUrl, { method: "POST", signal, body: form }), ocrUrl);
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) return fail("OCR label smoke failed.", { url: ocrUrl, status: response.status, data });
    pass("OCR label smoke passed.", { url: ocrUrl, status: response.status, hasIngredientText: !!data?.ingredient_text_original || !!data?.ingredientText });
  } else {
    pass("OCR smoke skipped because no image path was supplied.", { hint: "Set ROOTS_SMOKE_IMAGE or pass an image path as the second argument." });
  }
}

main().catch((error) => fail("Runtime smoke crashed.", { apiBase, error: error?.message || String(error), name: error?.name || "Error" }));