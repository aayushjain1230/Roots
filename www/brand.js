(function () {
  "use strict";
  window.APP_BRAND = Object.freeze({
    name: "Roots",
    shortName: "Roots",
    tagline: "Can I eat this?",
  });
  function applyBrand() {
    const brand = window.APP_BRAND;
    document.title = brand.name;
    document.querySelectorAll("[data-brand-name]").forEach((el) => { el.textContent = brand.name; });
    document.querySelectorAll("[data-brand-short-name]").forEach((el) => { el.textContent = brand.shortName; });
    document.querySelectorAll("[data-brand-tagline]").forEach((el) => { el.textContent = brand.tagline; });
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.content = brand.shortName;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyBrand);
  else applyBrand();
})();
