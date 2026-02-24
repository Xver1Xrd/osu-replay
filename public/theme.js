(() => {
  const STORAGE_KEY = "osuReplaySiteTheme";
  const SUPPORTED = new Set(["dark", "light"]);
  const DARK_HREF = "/styles-dark.css";
  const LIGHT_HREF = "/styles.css";

  function normalizeTheme(value) {
    const raw = String(value || "").toLowerCase();
    return SUPPORTED.has(raw) ? raw : "light";
  }

  function getTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch {
      return "light";
    }
  }

  function updateMetaThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", theme === "dark" ? "#18191d" : "#0a2b74");
  }

  function updateStylesheet(theme) {
    const link = document.getElementById("siteStylesheet");
    if (!link) return;
    const nextHref = theme === "dark" ? DARK_HREF : LIGHT_HREF;
    const current = link.getAttribute("href") || "";
    if (current !== nextHref) {
      link.setAttribute("href", nextHref);
    }
  }

  function updateThemeButtons(theme) {
    for (const btn of document.querySelectorAll(".lang-btn[data-theme-option]")) {
      btn.classList.toggle("is-active", btn.dataset.themeOption === theme);
      btn.setAttribute("aria-pressed", btn.dataset.themeOption === theme ? "true" : "false");
    }
  }

  function applyTheme(theme) {
    const next = normalizeTheme(theme);
    document.documentElement.dataset.theme = next;
    if (document.body) document.body.dataset.theme = next;
    updateStylesheet(next);
    updateMetaThemeColor(next);
    updateThemeButtons(next);
  }

  function setTheme(theme) {
    const next = normalizeTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (private mode / quota)
    }
    applyTheme(next);
    window.dispatchEvent(new CustomEvent("site-theme-changed", { detail: { theme: next } }));
  }

  function bind() {
    for (const btn of document.querySelectorAll(".lang-btn[data-theme-option]")) {
      btn.addEventListener("click", () => setTheme(btn.dataset.themeOption));
    }
  }

  window.osuSiteTheme = { getTheme, setTheme, applyTheme };

  bind();
  applyTheme(getTheme());
})();
