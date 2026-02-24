const state = {
  skins: [],
  loading: false,
};

const i18n = window.osuSiteI18n || {
  t: (key) => key,
  locale: () => "ru-RU",
};

function t(key, vars) {
  return i18n.t(key, vars);
}

function localeCode() {
  return i18n.locale();
}

const els = {
  syncBadge: document.getElementById("skinsSyncBadge"),
  refreshBtn: document.getElementById("skinsRefreshBtn"),
  countBadge: document.getElementById("skinsCountBadge"),
  grid: document.getElementById("skinLibraryGrid"),
  form: document.getElementById("skinLibraryForm"),
  nameInput: document.getElementById("skinLibraryNameInput"),
  fileInput: document.getElementById("skinLibraryFileInput"),
  fileState: document.getElementById("skinLibraryFileState"),
  status: document.getElementById("skinLibraryStatus"),
  submitBtn: document.getElementById("skinLibrarySubmitBtn"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(localeCode(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setSyncBadge(text, live = false) {
  if (!els.syncBadge) return;
  els.syncBadge.textContent = text;
  els.syncBadge.classList.toggle("live", Boolean(live));
}

function setStatusLine(message, type) {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.classList.remove("is-error", "is-success");
  if (type === "error") els.status.classList.add("is-error");
  if (type === "success") els.status.classList.add("is-success");
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasJson = options.json !== undefined;
  if (hasJson) headers.set("Content-Type", "application/json");

  const res = await fetch(url, {
    ...options,
    headers,
    body: hasJson ? JSON.stringify(options.json) : options.body,
  });

  const raw = await res.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }

  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload;
}

function updateFileState() {
  const file = els.fileInput?.files?.[0];
  const row = els.fileInput?.closest(".file-row");
  if (!els.fileState || !row) return;

  if (!file) {
    els.fileState.textContent = t("file.choose");
    row.classList.remove("has-file");
    return;
  }

  row.classList.add("has-file");
  const text = `${file.name} (${formatBytes(file.size)})`;
  els.fileState.textContent = text;
  els.fileState.title = text;
}

function renderSkins() {
  if (!els.grid) return;
  if (els.countBadge) els.countBadge.textContent = t("skins.count", { count: state.skins.length });

  if (!state.skins.length) {
    els.grid.innerHTML = `<div class="empty-state">${escapeHtml(t("skins.empty"))}</div>`;
    return;
  }

  els.grid.innerHTML = state.skins
    .map((skin) => {
      const previewUrl = skin.preview?.available && skin.preview?.previewUrl
        ? `${skin.preview.previewUrl}${skin.updatedAt ? `?t=${encodeURIComponent(skin.updatedAt)}` : ""}`
        : "";
      return `
        <article class="skin-card">
          <div class="skin-card-preview">
            ${
              previewUrl
                ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(skin.name || `${t("common.skin")} preview`)}" loading="lazy" />`
                : `<div class="skin-card-placeholder">${escapeHtml(skin.preview?.error ? t("skins.previewError") : t("skins.noPreview"))}</div>`
            }
          </div>
          <div class="skin-card-body">
            <div class="skin-card-title">${escapeHtml(skin.name || t("common.skin"))}</div>
            <div class="skin-card-meta">
              <span>${escapeHtml(skin.file?.originalName || "skin.zip")}</span>
              <span>${escapeHtml(formatBytes(skin.file?.size || 0))}</span>
              <span>${escapeHtml(formatDate(skin.createdAt))}</span>
            </div>
            <div class="skin-card-actions">
              <a class="link-btn" href="/?skin=${encodeURIComponent(skin.id)}">${escapeHtml(t("skins.useInStudio"))}</a>
              <a class="link-btn secondary" href="${escapeHtml(skin.downloadUrl)}">${escapeHtml(t("common.download"))}</a>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSkins({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!silent) setSyncBadge(t("sync.loadingSkins"));

  try {
    const data = await apiFetch("/api/skins?limit=500");
    state.skins = Array.isArray(data?.skins) ? data.skins : [];
    renderSkins();
    setSyncBadge(t("sync.libraryReady"), true);
  } catch (error) {
    setSyncBadge(t("sync.error", { error: error.message }));
    if (!state.skins.length) renderSkins();
  } finally {
    state.loading = false;
  }
}

async function submitSkin(event) {
  event.preventDefault();
  const file = els.fileInput?.files?.[0];
  if (!file) {
    setStatusLine(t("skins.selectZip"), "error");
    return;
  }

  const formData = new FormData(els.form);
  els.submitBtn.disabled = true;
  setStatusLine(t("skins.uploading"), null);

  try {
    const data = await apiFetch("/api/skins", {
      method: "POST",
      body: formData,
    });
    const name = data?.skin?.name || t("common.skin");
    setStatusLine(t("skins.saved", { name }), "success");
    els.form.reset();
    updateFileState();
    await loadSkins({ silent: false });
  } catch (error) {
    setStatusLine(error.message, "error");
  } finally {
    els.submitBtn.disabled = false;
  }
}

function bind() {
  els.refreshBtn?.addEventListener("click", () => {
    void loadSkins({ silent: false });
  });
  els.fileInput?.addEventListener("change", updateFileState);
  els.form?.addEventListener("submit", submitSkin);
  updateFileState();
}

async function init() {
  bind();
  renderSkins();
  await loadSkins({ silent: false });
}

window.addEventListener("site-language-changed", () => {
  updateFileState();
  renderSkins();
});

void init();
