(function () {
  "use strict";
  const KEY = "ceit-appearance-v1";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function savedPreference() {
    const value = localStorage.getItem(KEY);
    return ["system", "light", "dark"].includes(value) ? value : "system";
  }
  function apply(preference) {
    const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const color = resolved === "dark" ? "#15171C" : "#F5FAEF";
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => { meta.content = color; });
    document.querySelectorAll('input[name="appearance"]').forEach((input) => {
      input.checked = input.value === preference;
    });
    document.dispatchEvent(new CustomEvent("roots:themechange", { detail: { preference, resolved } }));
  }
  function set(preference) {
    localStorage.setItem(KEY, preference);
    apply(preference);
  }
  media.addEventListener("change", () => {
    if (savedPreference() === "system") apply("system");
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches('input[name="appearance"]')) set(event.target.value);
  });
  apply(savedPreference());
  window.APP_THEME = { get: savedPreference, set, apply: () => apply(savedPreference()) };
})();
