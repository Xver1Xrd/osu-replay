const state = {
  jobs: [],
  skins: [],
  beatmaps: [],
  draftSkinPreview: null,
  draftSkinPreviewToken: 0,
  preselectLibrarySkinId: new URLSearchParams(window.location.search).get("skin") || "",
  preselectLibraryBeatmapId: new URLSearchParams(window.location.search).get("beatmap") || "",
  replayPresets: [],
  filter: "all",
  pollTimer: null,
  isLoading: false,
  siteSettings: null,
  openQueueJobIds: new Set(),
  queueVideoPlayback: new Map(),
};

const i18n = window.osuSiteI18n || {
  t: (key) => key,
  getLang: () => "ru",
  locale: () => "ru-RU",
};

function t(key, vars) {
  return i18n.t(key, vars);
}

function localeCode() {
  return i18n.locale();
}

const els = {
  refreshBtn: document.getElementById("refreshBtn"),
  syncBadge: document.getElementById("syncBadge"),
  brandTitle: document.getElementById("brandTitle"),
  brandSubtitle: document.getElementById("brandSubtitle"),
  siteAnnouncement: document.getElementById("siteAnnouncement"),
  heroTitle: document.getElementById("heroTitle"),
  heroDescription: document.getElementById("heroDescription"),
  lastUpdated: document.getElementById("lastUpdated"),
  queueStatusText: document.getElementById("queueStatusText"),
  metricTotal: document.getElementById("metricTotal"),
  metricProcessing: document.getElementById("metricProcessing"),
  metricCompleted: document.getElementById("metricCompleted"),
  metricFailed: document.getElementById("metricFailed"),
  spotlightTitle: document.getElementById("spotlightTitle"),
  spotlightText: document.getElementById("spotlightText"),
  spotlightChips: document.getElementById("spotlightChips"),
  jobsList: document.getElementById("jobsList"),
  filterButtons: Array.from(document.querySelectorAll(".seg-btn")),

  uploadForm: document.getElementById("uploadForm"),
  titleInput: document.getElementById("titleInput"),
  replayInput: document.getElementById("replayInput"),
  skinInput: document.getElementById("skinInput"),
  beatmapInput: document.getElementById("beatmapInput"),
  videoQualitySelect: document.getElementById("videoQualitySelect"),
  musicVolumeInput: document.getElementById("musicVolumeInput"),
  hitsoundVolumeInput: document.getElementById("hitsoundVolumeInput"),
  cursorSizeInput: document.getElementById("cursorSizeInput"),
  musicVolumeValue: document.getElementById("musicVolumeValue"),
  hitsoundVolumeValue: document.getElementById("hitsoundVolumeValue"),
  cursorSizeValue: document.getElementById("cursorSizeValue"),
  replayFileState: document.getElementById("replayFileState"),
  skinFileState: document.getElementById("skinFileState"),
  beatmapFileState: document.getElementById("beatmapFileState"),
  draftReplayText: document.getElementById("draftReplayText"),
  draftSkinText: document.getElementById("draftSkinText"),
  draftBeatmapText: document.getElementById("draftBeatmapText"),
  draftQualityText: document.getElementById("draftQualityText"),
  draftAudioText: document.getElementById("draftAudioText"),
  draftSkinTag: document.getElementById("draftSkinTag"),
  draftSkinFrame: document.getElementById("draftSkinFrame"),
  librarySkinSelect: document.getElementById("librarySkinSelect"),
  librarySkinHint: document.getElementById("librarySkinHint"),
  libraryBeatmapSelect: document.getElementById("libraryBeatmapSelect"),
  libraryBeatmapHint: document.getElementById("libraryBeatmapHint"),
  replayPresetSelect: document.getElementById("replayPresetSelect"),
  replayPresetNameInput: document.getElementById("replayPresetNameInput"),
  replayPresetApplyBtn: document.getElementById("replayPresetApplyBtn"),
  replayPresetDeleteBtn: document.getElementById("replayPresetDeleteBtn"),
  replayPresetSaveBtn: document.getElementById("replayPresetSaveBtn"),
  replayPresetStatus: document.getElementById("replayPresetStatus"),
  formStatus: document.getElementById("formStatus"),
  submitBtn: document.getElementById("submitBtn"),
};

const STATUS_LABELS = {
  queued: "status.queued",
  processing: "status.processing",
  completed: "status.completed",
  failed: "status.failed",
};

const QUALITY_LABELS = {
  low: "720p / 30fps",
  medium: "1080p / 60fps",
  high: "1440p / 60fps",
  ultra: "4K / 60fps",
};

function statusLabel(status) {
  const key = STATUS_LABELS[status];
  return key ? t(key) : String(status || "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(localeCode(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString(localeCode(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function setStatusLine(el, message, type) {
  el.textContent = message || "";
  el.classList.remove("is-error", "is-success");
  if (type === "error") el.classList.add("is-error");
  if (type === "success") el.classList.add("is-success");
}

const REPLAY_PRESET_STORAGE_KEY = "osuReplaySite.replayPresets.v1";
const REPLAY_PRESET_EXCLUDED_NAMES = new Set(["title", "replay", "skin", "beatmap", "librarySkinId", "libraryBeatmapId"]);

function replayPresetNoneLabel() {
  return i18n.getLang() === "en" ? "No preset" : "Без пресета";
}

function replayPresetMessage(key, vars = {}) {
  const en = i18n.getLang() === "en";
  const dict = {
    selectPreset: en ? "Select a preset first" : "Сначала выбери пресет",
    applied: en ? `Preset applied: ${vars.name || ""}` : `Пресет применён: ${vars.name || ""}`,
    saved: en ? `Preset saved: ${vars.name || ""}` : `Пресет сохранён: ${vars.name || ""}`,
    deleted: en ? `Preset deleted: ${vars.name || ""}` : `Пресет удалён: ${vars.name || ""}`,
    enterName: en ? "Enter preset name" : "Введи название пресета",
    invalidStorage: en ? "Preset storage reset due to invalid data" : "Хранилище пресетов сброшено из-за некорректных данных",
  };
  return dict[key] || key;
}

function setReplayPresetStatus(message, type) {
  if (!els.replayPresetStatus) return;
  setStatusLine(els.replayPresetStatus, message, type);
}

function replayPresetId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getReplayPresetStorage() {
  try {
    const raw = localStorage.getItem(REPLAY_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || replayPresetId()),
        name: String(item?.name || "").trim().slice(0, 80),
        values: item?.values && typeof item.values === "object" ? item.values : {},
        createdAt: item?.createdAt || new Date().toISOString(),
        updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

function saveReplayPresetStorage() {
  localStorage.setItem(REPLAY_PRESET_STORAGE_KEY, JSON.stringify(state.replayPresets));
}

function renderReplayPresetSelect() {
  if (!els.replayPresetSelect) return;
  const current = String(els.replayPresetSelect.value || "").trim();
  const options = [`<option value="">${escapeHtml(replayPresetNoneLabel())}</option>`];
  for (const preset of state.replayPresets) {
    options.push(`<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`);
  }
  els.replayPresetSelect.innerHTML = options.join("");
  if (current && state.replayPresets.some((preset) => preset.id === current)) {
    els.replayPresetSelect.value = current;
  }
}

function getReplayPresetById(id) {
  const presetId = String(id || "").trim();
  if (!presetId) return null;
  return state.replayPresets.find((preset) => preset.id === presetId) || null;
}

function getSelectedReplayPreset() {
  return getReplayPresetById(els.replayPresetSelect?.value);
}

function isReplayPresetControl(control) {
  if (!control) return false;
  const tag = String(control.tagName || "").toLowerCase();
  if (!["input", "select", "textarea"].includes(tag)) return false;
  if (control.disabled) return false;
  if (!control.name) return false;
  if (REPLAY_PRESET_EXCLUDED_NAMES.has(control.name)) return false;
  if (control.type === "file") return false;
  return true;
}

function collectReplayPresetValues() {
  const values = {};
  if (!els.uploadForm) return values;

  const controls = els.uploadForm.querySelectorAll("input, select, textarea");
  for (const control of controls) {
    if (!isReplayPresetControl(control)) continue;

    if (control.type === "checkbox") {
      values[control.name] = Boolean(control.checked);
      continue;
    }
    if (control.type === "radio") {
      if (control.checked) values[control.name] = control.value;
      continue;
    }
    values[control.name] = control.value;
  }
  return values;
}

function applyReplayPresetValues(values) {
  if (!els.uploadForm || !values || typeof values !== "object") return;
  const controls = els.uploadForm.querySelectorAll("input, select, textarea");
  for (const control of controls) {
    if (!isReplayPresetControl(control)) continue;
    if (!(control.name in values)) continue;

    const next = values[control.name];
    if (control.type === "checkbox") {
      control.checked = Boolean(next);
      continue;
    }
    if (control.type === "radio") {
      control.checked = String(next) === String(control.value);
      continue;
    }
    control.value = String(next ?? "");
  }
  syncAllRangeVisuals();
  updateDraftState();
}

function loadReplayPresets() {
  state.replayPresets = getReplayPresetStorage();
  renderReplayPresetSelect();
}

function syncRangeVisual(input) {
  if (!input || input.type !== "range") return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  input.style.setProperty("--range-pct", `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`);
}

function syncAllRangeVisuals() {
  if (!els.uploadForm) return;
  for (const input of els.uploadForm.querySelectorAll('input[type="range"]')) {
    syncRangeVisual(input);
  }
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasJson = options.json !== undefined;
  if (hasJson) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...options,
    headers,
    body: hasJson ? JSON.stringify(options.json) : options.body,
  });

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getFile(input) {
  return input?.files?.[0] || null;
}

function fileNameWithSize(file) {
  if (!file) return null;
  return `${file.name} (${formatBytes(file.size)})`;
}

function getSelectedLibrarySkinId() {
  return String(els.librarySkinSelect?.value || "").trim();
}

function getSelectedLibrarySkin() {
  const id = getSelectedLibrarySkinId();
  if (!id) return null;
  return state.skins.find((skin) => skin.id === id) || null;
}

function getSelectedLibraryBeatmapId() {
  return String(els.libraryBeatmapSelect?.value || "").trim();
}

function getSelectedLibraryBeatmap() {
  const id = getSelectedLibraryBeatmapId();
  if (!id) return null;
  return state.beatmaps.find((beatmap) => beatmap.id === id) || null;
}

function setLibrarySkinHint(text) {
  if (!els.librarySkinHint) return;
  els.librarySkinHint.textContent = text || t("hint.librarySkin.default");
}

function setLibraryBeatmapHint(text) {
  if (!els.libraryBeatmapHint) return;
  const fallback = i18n.getLang() === "en"
    ? "Choose a saved beatmap or upload .osz above."
    : "Выбери сохранённую карту или загрузи .osz выше.";
  els.libraryBeatmapHint.textContent = text || fallback;
}

function renderDraftSkinFrame() {
  if (!els.draftSkinFrame) return;

  const localSkin = getFile(els.skinInput);
  const librarySkin = getSelectedLibrarySkin();

  let preview = null;
  let sourceLabel = "";

  if (localSkin) {
    preview = state.draftSkinPreview;
    sourceLabel = t("draft.skinSource.localZip");
  } else if (librarySkin?.preview) {
    preview = librarySkin.preview;
    sourceLabel = t("draft.skinSource.library");
  }

  els.draftSkinFrame.classList.remove("is-loading", "is-ready");

  if (preview?.pending) {
    els.draftSkinFrame.classList.add("is-loading");
    els.draftSkinFrame.innerHTML = `<p>${escapeHtml(t("draft.skinPreview.extracting"))}</p>`;
    return;
  }

  const previewUrl = preview?.available && preview?.previewUrl ? preview.previewUrl : "";
  if (previewUrl) {
    els.draftSkinFrame.classList.add("is-ready");
    els.draftSkinFrame.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Skin preview" loading="lazy" />`;
    return;
  }

  let message = t("draft.skinPreview.default");
  if (localSkin && preview?.error) {
    message = t("draft.skinPreview.extractFailed", { error: preview.error });
  } else if (localSkin && preview && !preview.available) {
    message = t("draft.skinPreview.notFoundInArchive");
  } else if (!localSkin && librarySkin) {
    message = librarySkin.preview?.error
      ? t("draft.skinPreview.libraryError", { error: librarySkin.preview.error })
      : t("draft.skinPreview.libraryNoAsset", { name: librarySkin.name || "Skin" });
  } else if (sourceLabel) {
    message = t("draft.skinPreview.sourceUnavailable", { source: sourceLabel });
  }

  els.draftSkinFrame.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function populateLibrarySkinSelect() {
  if (!els.librarySkinSelect) return;
  const current = getSelectedLibrarySkinId();
  const targetId = current || state.preselectLibrarySkinId || "";

  const options = [`<option value="">${escapeHtml(t("library.none"))}</option>`];
  for (const skin of state.skins) {
    const previewBadge = skin.preview?.available ? ` • ${t("library.previewBadge")}` : "";
    options.push(
      `<option value="${escapeHtml(skin.id)}">${escapeHtml(skin.name || t("common.skin"))}${escapeHtml(previewBadge)}</option>`
    );
  }
  els.librarySkinSelect.innerHTML = options.join("");

  if (targetId && state.skins.some((skin) => skin.id === targetId)) {
    els.librarySkinSelect.value = targetId;
    state.preselectLibrarySkinId = "";
  }
}

function describeBeatmapOption(beatmap) {
  const meta = beatmap?.meta || {};
  const core = [meta.artist, meta.title].filter(Boolean).join(" - ") || beatmap?.name || t("common.beatmap");
  const diffCount = Number(meta.osuFileCount || 0);
  return diffCount > 1 ? `${core} (${diffCount} diffs)` : core;
}

function populateLibraryBeatmapSelect() {
  if (!els.libraryBeatmapSelect) return;
  const current = getSelectedLibraryBeatmapId();
  const targetId = current || state.preselectLibraryBeatmapId || "";

  const noneLabel = i18n.getLang() === "en" ? "No library beatmap" : "Без библиотечной карты";
  const options = [`<option value="">${escapeHtml(noneLabel)}</option>`];
  for (const beatmap of state.beatmaps) {
    options.push(
      `<option value="${escapeHtml(beatmap.id)}">${escapeHtml(describeBeatmapOption(beatmap))}</option>`
    );
  }
  els.libraryBeatmapSelect.innerHTML = options.join("");

  if (targetId && state.beatmaps.some((beatmap) => beatmap.id === targetId)) {
    els.libraryBeatmapSelect.value = targetId;
    state.preselectLibraryBeatmapId = "";
  }
}

async function loadSkins() {
  try {
    const data = await apiFetch("/api/skins?limit=300");
    state.skins = Array.isArray(data?.skins) ? data.skins : [];
  } catch {
    state.skins = [];
  }
  populateLibrarySkinSelect();
  updateDraftState();
}

async function loadBeatmaps() {
  try {
    const data = await apiFetch("/api/beatmaps?limit=300");
    state.beatmaps = Array.isArray(data?.beatmaps) ? data.beatmaps : [];
  } catch {
    state.beatmaps = [];
  }
  populateLibraryBeatmapSelect();
  updateDraftState();
}

async function requestDraftSkinPreview(file) {
  if (!file || !els.skinInput) return;

  const token = ++state.draftSkinPreviewToken;
  state.draftSkinPreview = { pending: true };
  updateDraftState();

  const formData = new FormData();
  formData.append("skin", file);

  try {
    const data = await apiFetch("/api/skins/draft-preview", {
      method: "POST",
      body: formData,
    });
    if (token !== state.draftSkinPreviewToken) return;
    state.draftSkinPreview = data?.skinPreview || { available: false };
  } catch (error) {
    if (token !== state.draftSkinPreviewToken) return;
    state.draftSkinPreview = { available: false, error: error.message || t("draft.skinPreview.requestFailed") };
  }

  updateDraftState();
}

function updateFileRow(input, stateEl) {
  const file = getFile(input);
  const row = input.closest(".file-row");
  if (!row || !stateEl) return;

  if (file) {
    row.classList.add("has-file");
    const text = fileNameWithSize(file);
    stateEl.textContent = text;
    stateEl.title = text;
  } else {
    row.classList.remove("has-file");
    const fallback = input === els.replayInput ? t("file.choose") : t("common.optional");
    stateEl.textContent = fallback;
    stateEl.title = "";
  }
}

function updateDraftState() {
  const replay = getFile(els.replayInput);
  const skin = getFile(els.skinInput);
  const librarySkin = getSelectedLibrarySkin();
  const libraryBeatmap = getSelectedLibraryBeatmap();
  const beatmap = getFile(els.beatmapInput);
  const quality = els.videoQualitySelect.value || "medium";
  const music = Number(els.musicVolumeInput.value || 100);
  const hits = Number(els.hitsoundVolumeInput.value || 100);
  const cursorSize = Number(els.cursorSizeInput?.value || 100);

  els.musicVolumeValue.textContent = `${music}%`;
  els.hitsoundVolumeValue.textContent = `${hits}%`;
  if (els.cursorSizeValue) els.cursorSizeValue.textContent = `${Math.round(cursorSize)}%`;
  els.draftReplayText.textContent = replay ? fileNameWithSize(replay) : t("draft.notSelected");
  els.draftSkinText.textContent = skin
    ? `${fileNameWithSize(skin)} (${t("draft.local")})`
    : librarySkin
      ? `${librarySkin.name || t("common.skin")} (${t("draft.library")})`
      : t("common.optional");
  els.draftBeatmapText.textContent = beatmap
    ? `${fileNameWithSize(beatmap)} (${t("draft.local")})`
    : libraryBeatmap
      ? `${describeBeatmapOption(libraryBeatmap)} (${t("draft.library")})`
      : t("common.optional");
  els.draftQualityText.textContent = QUALITY_LABELS[quality] || quality;
  els.draftAudioText.textContent = `${music}% / ${hits}%`;
  if (els.draftSkinTag) {
    els.draftSkinTag.textContent = skin ? t("draft.skinTag.local") : librarySkin ? t("draft.skinTag.library") : t("draft.skinTag.none");
  }

  if (els.librarySkinSelect) {
    els.librarySkinSelect.disabled = !state.siteSettings || state.siteSettings.uploadsEnabled === false;
  }
  if (els.libraryBeatmapSelect) {
    els.libraryBeatmapSelect.disabled = !state.siteSettings || state.siteSettings.uploadsEnabled === false;
  }

  if (skin) {
    setLibrarySkinHint(
      librarySkin
        ? t("hint.librarySkin.localOverrides")
        : t("hint.librarySkin.localOnly")
    );
  } else if (librarySkin) {
    setLibrarySkinHint(t("hint.librarySkin.selected", { name: librarySkin.name || librarySkin.id }));
  } else {
    setLibrarySkinHint(t("hint.librarySkin.default"));
  }

  if (beatmap) {
    setLibraryBeatmapHint(
      i18n.getLang() === "en"
        ? "Using uploaded beatmap file (local file takes priority over library beatmap)."
        : "Используется загруженная карта (локальный файл имеет приоритет над библиотечной картой)."
    );
  } else if (libraryBeatmap) {
    setLibraryBeatmapHint(
      i18n.getLang() === "en"
        ? `Selected library beatmap: ${describeBeatmapOption(libraryBeatmap)}`
        : `Выбрана библиотечная карта: ${describeBeatmapOption(libraryBeatmap)}`
    );
  } else {
    setLibraryBeatmapHint();
  }

  renderDraftSkinFrame();
  syncAllRangeVisuals();
}

function setSyncBadge(text, live = false) {
  els.syncBadge.textContent = text;
  els.syncBadge.classList.toggle("live", Boolean(live));
}

function localizeSiteTextIfDefault(value, ruText, enKey) {
  const current = String(value || "").trim();
  if (!current) return "";
  const enText = t(enKey);
  const ruNormalized = String(ruText || "").trim();
  if (!ruNormalized) return current;
  if (current === ruNormalized || current === enText) {
    return t(enKey);
  }
  return current;
}

function applySiteSettings() {
  const s = state.siteSettings;
  if (!s) return;

  const siteTitle = localizeSiteTextIfDefault(s.siteTitle, "osu! Replay Studio", "site.brandTitle");
  const siteSubtitle = localizeSiteTextIfDefault(
    s.siteSubtitle,
    "Загрузка реплеев и очередь рендера",
    "site.brandSubtitle",
  );
  const heroTitle = localizeSiteTextIfDefault(
    s.heroTitle,
    "Рендер реплеев osu! в видео через danser",
    "site.heroTitle",
  );
  const heroDescription = localizeSiteTextIfDefault(
    s.heroDescription,
    "Загрузи реплей, скин и карту, настрой параметры danser и получи готовое видео в очереди результатов.",
    "site.heroDescription",
  );

  if (els.brandTitle && siteTitle) els.brandTitle.textContent = siteTitle;
  if (els.brandSubtitle && siteSubtitle) els.brandSubtitle.textContent = siteSubtitle;
  if (els.heroTitle && heroTitle) els.heroTitle.textContent = heroTitle;
  if (els.heroDescription && heroDescription) els.heroDescription.textContent = heroDescription;

  if (els.siteAnnouncement) {
    const text = String(s.announcementText || "").trim();
    if (text) {
      els.siteAnnouncement.textContent = text;
      els.siteAnnouncement.classList.remove("hidden");
    } else {
      els.siteAnnouncement.textContent = "";
      els.siteAnnouncement.classList.add("hidden");
    }
  }

  const uploadsEnabled = s.uploadsEnabled !== false;
  const controls = [
    els.titleInput,
    els.replayInput,
    els.skinInput,
    els.librarySkinSelect,
    els.beatmapInput,
    els.libraryBeatmapSelect,
    els.videoQualitySelect,
    els.musicVolumeInput,
    els.hitsoundVolumeInput,
    els.replayPresetSelect,
    els.replayPresetNameInput,
    els.replayPresetApplyBtn,
    els.replayPresetDeleteBtn,
    els.replayPresetSaveBtn,
  ];
  for (const control of controls) {
    if (control) control.disabled = !uploadsEnabled;
  }
  if (els.submitBtn) {
    els.submitBtn.disabled = !uploadsEnabled;
  }

  if (s.defaultVideoQuality && QUALITY_LABELS[s.defaultVideoQuality] && els.videoQualitySelect) {
    const hasSelectedFiles = Boolean(getFile(els.replayInput) || getFile(els.skinInput) || getFile(els.beatmapInput));
    if (!hasSelectedFiles) {
      els.videoQualitySelect.value = s.defaultVideoQuality;
    }
  }

  if (!uploadsEnabled) {
    setStatusLine(els.formStatus, t("upload.disabledByAdmin"), "error");
  } else if (
    (els.formStatus.textContent || "").includes("отключены администратором") ||
    (els.formStatus.textContent || "").includes("temporarily disabled")
  ) {
    setStatusLine(els.formStatus, "", null);
  }

  updateDraftState();
}

function getJobTitle(job) {
  const custom = String(job.title || "").trim();
  if (custom) return custom;
  if (job.replayInfo?.playerName) return `${job.replayInfo.playerName} replay`;
  if (job.files?.replay?.originalName) return job.files.replay.originalName;
  return `Replay ${job.id.slice(0, 8)}`;
}

function getLastLog(job) {
  if (job?.lastLog) {
    const text = String(job.lastLog);
    const translated = {
      "Queued for rendering": t("queue.lastLog.queued"),
      "Rendering in progress": t("queue.lastLog.processing"),
      "Render completed": t("queue.lastLog.completed"),
      "Render failed": t("queue.lastLog.failed"),
    };
    return translated[text] || text;
  }
  const logs = Array.isArray(job.logs) ? job.logs : [];
  if (!logs.length) return t("queue.waitingRenderer");
  return logs[logs.length - 1]?.message || t("queue.waitingRenderer");
}

function filterJob(job) {
  if (state.filter === "all") return true;
  if (state.filter === "active") return job.status === "queued" || job.status === "processing";
  if (state.filter === "completed") return job.status === "completed";
  if (state.filter === "failed") return job.status === "failed";
  return true;
}

function statusChip(job) {
  const status = job.status || "queued";
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(statusLabel(status) || status)}</span>`;
}

function spotlightTags(job) {
  const tags = [];
  const replayPp = Number(job?.renderMetrics?.replayPp);
  tags.push(`<span class="tag blue">${escapeHtml(statusLabel(job.status) || job.status || t("common.unknown"))}</span>`);
  tags.push(`<span class="tag">${escapeHtml(QUALITY_LABELS[job.settings?.videoQuality] || job.settings?.videoQuality || "medium")}</span>`);
  if (Number.isFinite(replayPp) && replayPp > 0) {
    tags.push(`<span class="tag">${escapeHtml(`PP ${replayPp.toFixed(2)}`)}</span>`);
  }
  tags.push(`<span class="tag green">${escapeHtml(t("audio.musicShort"))} ${escapeHtml(job.settings?.musicVolume ?? 100)}%</span>`);
  tags.push(`<span class="tag amber">${escapeHtml(t("audio.hitsoundsShort"))} ${escapeHtml(job.settings?.hitsoundVolume ?? 100)}%</span>`);
  if (job.replayInfo?.mods?.length) {
    tags.push(`<span class="tag">${escapeHtml(job.replayInfo.mods.join(""))}</span>`);
  }
  return tags.join("");
}

function replaySummaryHtml(job) {
  const info = job.replayInfo;
  if (!info) {
    return `
      <section class="inline-panel">
        <h4>${escapeHtml(t("queue.replayInfo.title"))}</h4>
        <p class="muted">${escapeHtml(t("queue.replayInfo.unavailable"))}</p>
      </section>`;
  }

  const mods = Array.isArray(info.mods) && info.mods.length ? info.mods.join("") : "NM";
  const counts = info.counts || {};
  return `
    <section class="inline-panel">
      <h4>${escapeHtml(t("queue.replayInfo.title"))}</h4>
      <div class="summary-grid">
        <div class="summary-item"><span>Player</span><strong>${escapeHtml(info.playerName || "Unknown")}</strong></div>
        <div class="summary-item"><span>Mode</span><strong>${escapeHtml(info.modeName || "-")}</strong></div>
        <div class="summary-item"><span>Mods</span><strong>${escapeHtml(mods)}</strong></div>
        <div class="summary-item"><span>Accuracy</span><strong>${info.accuracy == null ? "-" : `${escapeHtml(info.accuracy)}%`}</strong></div>
        <div class="summary-item"><span>Score</span><strong>${Number(info.score || 0).toLocaleString(localeCode())}</strong></div>
        <div class="summary-item"><span>Max Combo</span><strong>${Number(info.maxCombo || 0).toLocaleString(localeCode())}x${info.perfect ? " (FC)" : ""}</strong></div>
        <div class="summary-item"><span>300/100/50</span><strong>${counts.count300 ?? 0} / ${counts.count100 ?? 0} / ${counts.count50 ?? 0}</strong></div>
        <div class="summary-item"><span>Misses</span><strong>${counts.countMiss ?? 0}</strong></div>
      </div>
      ${info.playedAt ? `<p class="muted">Played at: ${escapeHtml(formatDateTime(info.playedAt))}</p>` : ""}
    </section>`;
}

function skinPreviewHtml(job) {
  const videoUrl = job?.result?.previewUrl || job?.result?.downloadUrl || null;
  const isVideoReady = job?.result?.type === "video" && videoUrl;
  const hasStarted = job?.status === "processing" || job?.status === "completed" || job?.status === "failed";

  if (isVideoReady) {
    const src = `${videoUrl}${job.updatedAt ? `?t=${encodeURIComponent(job.updatedAt)}` : ""}`;
    return `
      <section class="inline-panel">
        <h4>${escapeHtml(i18n.getLang() === "en" ? "Replay video" : "Видео реплея")}</h4>
        <p class="muted">${escapeHtml(job.result.fileName || "render.mp4")}</p>
        <div class="skin-preview-frame">
          <video class="result-video" controls preload="metadata" src="${escapeHtml(src)}"></video>
        </div>
      </section>`;
  }

  if (hasStarted) {
    const statusText =
      job.status === "processing"
        ? (i18n.getLang() === "en" ? "Video will appear here when rendering progresses." : "Видео появится здесь по мере завершения рендера.")
        : job.status === "failed"
          ? (i18n.getLang() === "en" ? "Render failed before final video was attached." : "Рендер завершился ошибкой до прикрепления финального видео.")
          : (i18n.getLang() === "en" ? "Finalizing video..." : "Финализация видео...");
    return `
      <section class="inline-panel">
        <h4>${escapeHtml(i18n.getLang() === "en" ? "Replay video" : "Видео реплея")}</h4>
        <p class="muted">${escapeHtml(statusText)}</p>
        <div class="skin-preview-frame">
          <div class="placeholder">${escapeHtml(statusText)}</div>
        </div>
      </section>`;
  }

  if (!job.files?.skin) return "";
  const preview = job.skinPreview;
  const src = preview?.available && preview.previewUrl
    ? `${preview.previewUrl}${job.updatedAt ? `?t=${encodeURIComponent(job.updatedAt)}` : ""}`
    : null;

  return `
    <section class="inline-panel">
      <h4>Skin preview</h4>
      <p class="muted">${preview?.error ? escapeHtml(preview.error) : escapeHtml(preview?.assetName || t("queue.skinPreview.afterExtraction"))}</p>
      <div class="skin-preview-frame">
        ${src
          ? `<img src="${escapeHtml(src)}" alt="Skin preview" loading="lazy" />`
          : `<div class="placeholder">${escapeHtml(t("draft.skinPreview.notFoundInArchive"))}</div>`}
      </div>
    </section>`;
}

function renderResultHtml(job) {
  if (!job.result && !job.error) return "";

  let html = "";

  if (job.error) {
    html += `
      <section class="inline-panel">
        <h4>${escapeHtml(t("queue.rendererError"))}</h4>
        <p class="muted">${escapeHtml(job.error)}</p>
      </section>`;
  }

  if (job.result) {
    const isVideo = job.result.type === "video" && job.result.previewUrl;
    html += `
      <section class="inline-panel">
        <h4>${escapeHtml(t("queue.renderOutput"))}</h4>
        <p class="muted">${escapeHtml(job.result.fileName || "result")}</p>
        <div class="link-row">
          <a class="link-btn" href="${escapeHtml(job.result.downloadUrl)}">${escapeHtml(t("common.download"))}</a>
          ${isVideo ? `<a class="link-btn secondary" href="${escapeHtml(job.result.previewUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("common.openPreview"))}</a>` : ""}
        </div>
      </section>`;
  }

  return html;
}

function logsHtml(job) {
  const logs = Array.isArray(job.logs) ? job.logs : [];
  if (!logs.length) return "";
  const body = logs.map((line) => `[${formatTime(line.at)}] ${line.message || ""}`).join("\n");

  return `
    <section class="inline-panel logs">
      <details>
        <summary>${escapeHtml(t("common.logs"))} (${logs.length})</summary>
        <pre>${escapeHtml(body)}</pre>
      </details>
    </section>`;
}

function buildQueueRow(job) {
  const progress = Math.max(0, Math.min(100, Math.round((Number(job.progress || 0)) * 100)));
  const barClass = job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : job.status === "queued" ? "queued" : "";
  const replay = job.files?.replay;
  const skin = job.files?.skin;
  const beatmap = job.files?.beatmap;

  return `
    <details class="queue-row" data-job-id="${escapeHtml(job.id)}">
      <summary>
        <div class="queue-row-head">
          <div class="queue-row-title">
            <strong>${escapeHtml(getJobTitle(job))}</strong>
            <span>${escapeHtml(job.id.slice(0, 8))} • ${escapeHtml(formatDateTime(job.createdAt))}</span>
          </div>
          ${statusChip(job)}
          <div class="progress-mini">${progress}%</div>
        </div>
      </summary>

      <div class="queue-row-body">
        <div class="progress-wrap">
          <div class="hint">
            <span>${escapeHtml(getLastLog(job))}</span>
            <span>${progress}%</span>
          </div>
          <div class="progress-track"><div class="progress-bar ${barClass}" style="width:${progress}%"></div></div>
        </div>

        <div class="compact-grid">
          <div class="cell"><span>${escapeHtml(t("common.replay"))}</span><strong>${replay ? `${escapeHtml(replay.originalName)} (${escapeHtml(formatBytes(replay.size))})` : "-"}</strong></div>
          <div class="cell"><span>${escapeHtml(t("common.skin"))}</span><strong>${skin ? `${escapeHtml(skin.originalName)} (${escapeHtml(formatBytes(skin.size))})` : escapeHtml(t("common.none"))}</strong></div>
          <div class="cell"><span>${escapeHtml(t("common.beatmap"))}</span><strong>${beatmap ? `${escapeHtml(beatmap.originalName)} (${escapeHtml(formatBytes(beatmap.size))})` : escapeHtml(t("common.none"))}</strong></div>
        </div>

        <div class="compact-grid">
          <div class="cell"><span>${escapeHtml(t("common.quality"))}</span><strong>${escapeHtml(QUALITY_LABELS[job.settings?.videoQuality] || job.settings?.videoQuality || "medium")}</strong></div>
          <div class="cell"><span>${escapeHtml(t("audio.musicVolume"))}</span><strong>${escapeHtml(job.settings?.musicVolume ?? 100)}%</strong></div>
          <div class="cell"><span>${escapeHtml(t("audio.hitsoundVolume"))}</span><strong>${escapeHtml(job.settings?.hitsoundVolume ?? 100)}%</strong></div>
        </div>

        ${replaySummaryHtml(job)}
        ${skinPreviewHtml(job)}
        ${renderResultHtml(job)}
        ${logsHtml(job)}
      </div>
    </details>`;
}

function captureOpenQueueRows() {
  if (!els.jobsList) return;
  state.openQueueJobIds = new Set(
    Array.from(els.jobsList.querySelectorAll("details.queue-row[open][data-job-id]"))
      .map((el) => String(el.dataset.jobId || "").trim())
      .filter(Boolean),
  );
}

function captureQueueVideoPlayback() {
  if (!els.jobsList) return;
  const snapshot = new Map();
  for (const video of els.jobsList.querySelectorAll("details.queue-row[data-job-id] video.result-video")) {
    const details = video.closest("details.queue-row[data-job-id]");
    const jobId = String(details?.dataset?.jobId || "").trim();
    if (!jobId) continue;
    snapshot.set(jobId, {
      currentTime: Number(video.currentTime || 0),
      wasPlaying: !video.paused && !video.ended,
      muted: Boolean(video.muted),
      volume: Number.isFinite(video.volume) ? video.volume : 1,
      playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
    });
  }
  state.queueVideoPlayback = snapshot;
}

function restoreOpenQueueRows() {
  if (!els.jobsList || !(state.openQueueJobIds instanceof Set) || state.openQueueJobIds.size === 0) return;
  for (const details of els.jobsList.querySelectorAll("details.queue-row[data-job-id]")) {
    const jobId = String(details.dataset.jobId || "").trim();
    if (jobId && state.openQueueJobIds.has(jobId)) details.open = true;
  }
}

function restoreQueueVideoPlayback() {
  if (!els.jobsList || !(state.queueVideoPlayback instanceof Map) || state.queueVideoPlayback.size === 0) return;

  for (const video of els.jobsList.querySelectorAll("details.queue-row[data-job-id] video.result-video")) {
    const details = video.closest("details.queue-row[data-job-id]");
    const jobId = String(details?.dataset?.jobId || "").trim();
    if (!jobId) continue;
    const saved = state.queueVideoPlayback.get(jobId);
    if (!saved) continue;

    const applyState = () => {
      if (Number.isFinite(saved.currentTime) && saved.currentTime > 0) {
        try {
          const maxTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.2) : saved.currentTime;
          video.currentTime = Math.max(0, Math.min(saved.currentTime, maxTime));
        } catch {
          // Ignore seek restore failures.
        }
      }
      video.muted = Boolean(saved.muted);
      if (Number.isFinite(saved.volume)) video.volume = Math.max(0, Math.min(1, saved.volume));
      if (Number.isFinite(saved.playbackRate) && saved.playbackRate > 0) video.playbackRate = saved.playbackRate;
      if (saved.wasPlaying) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => undefined);
      }
    };

    if (video.readyState >= 1) {
      applyState();
    } else {
      video.addEventListener("loadedmetadata", applyState, { once: true });
    }
  }
}

function renderJobs() {
  captureOpenQueueRows();
  captureQueueVideoPlayback();
  const filtered = state.jobs.filter(filterJob);
  if (!filtered.length) {
    els.jobsList.innerHTML = `<div class="empty-state">${escapeHtml(t("queue.emptyFiltered"))}</div>`;
    return;
  }
  els.jobsList.innerHTML = filtered.map(buildQueueRow).join("");
  restoreOpenQueueRows();
  restoreQueueVideoPlayback();
}

function renderTopSummary() {
  const total = state.jobs.length;
  const active = state.jobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const queued = state.jobs.filter((job) => job.status === "queued").length;
  const completed = state.jobs.filter((job) => job.status === "completed").length;
  const failed = state.jobs.filter((job) => job.status === "failed").length;

  els.metricTotal.textContent = String(total);
  els.metricProcessing.textContent = String(active);
  els.metricCompleted.textContent = String(completed);
  els.metricFailed.textContent = String(failed);
  els.queueStatusText.textContent = t("queue.status.waitingCount", { count: queued });

  const latest = state.jobs[0];
  if (!latest) {
    els.spotlightTitle.textContent = t("spotlight.noneTitle");
    els.spotlightText.textContent = t("spotlight.noneText");
    els.spotlightChips.innerHTML = "";
    return;
  }

  const info = latest.replayInfo;
  const replayPp = Number(latest?.renderMetrics?.replayPp);
  const hasReplayPp = Number.isFinite(replayPp) && replayPp > 0;
  els.spotlightTitle.textContent = getJobTitle(latest);
  els.spotlightText.textContent = info
    ? `${info.playerName || t("common.unknown")} | ${hasReplayPp ? `PP ${replayPp.toFixed(2)}` : (info.modeName || "mode")} | ${t("common.score")} ${Number(info.score || 0).toLocaleString(localeCode())} | ${t("common.accuracy")} ${info.accuracy == null ? "-" : `${info.accuracy}%`}`
    : `${latest.files?.replay?.originalName || t("common.replay")} • ${statusLabel(latest.status) || latest.status}`;
  els.spotlightChips.innerHTML = spotlightTags(latest);
}

function markLastUpdated() {
  els.lastUpdated.textContent = new Date().toLocaleTimeString(localeCode(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function loadJobs({ silent = false } = {}) {
  if (state.isLoading) return;
  state.isLoading = true;
  if (!silent) setSyncBadge(t("sync.refreshing"));

  try {
    const data = await apiFetch("/api/jobs?limit=80");
    state.jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    renderTopSummary();
    renderJobs();
    markLastUpdated();
    setSyncBadge(t("sync.autoRefresh"), true);
  } catch (error) {
    setSyncBadge(t("sync.error", { error: error.message }));
  } finally {
    state.isLoading = false;
  }
}

async function loadMeta() {
  try {
    const data = await apiFetch("/api/meta");
    const options = Array.isArray(data?.videoQualityOptions) ? data.videoQualityOptions : [];
    if (options.length) {
      const current = els.videoQualitySelect.value || "medium";
      els.videoQualitySelect.innerHTML = options
        .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
        .join("");
      if (options.some((opt) => opt.value === current)) {
        els.videoQualitySelect.value = current;
      } else if (data?.defaults?.defaultVideoQuality && options.some((opt) => opt.value === data.defaults.defaultVideoQuality)) {
        els.videoQualitySelect.value = data.defaults.defaultVideoQuality;
      }
    }
  } catch {
    // Optional metadata endpoint.
  }
  updateDraftState();
}

async function loadSiteSettings() {
  try {
    const data = await apiFetch("/api/site-settings");
    state.siteSettings = data?.settings || null;
    applySiteSettings();
  } catch {
    // Site settings are optional for UI boot.
  }
}

async function submitUpload(event) {
  event.preventDefault();
  setStatusLine(els.formStatus, "", null);

  if (state.siteSettings && state.siteSettings.uploadsEnabled === false) {
    setStatusLine(els.formStatus, t("upload.disabledByAdmin"), "error");
    return;
  }

  if (!getFile(els.replayInput)) {
    setStatusLine(els.formStatus, t("upload.selectReplay"), "error");
    return;
  }

  const formData = new FormData(els.uploadForm);
  if (getFile(els.skinInput)) {
    formData.delete("librarySkinId");
  } else {
    const librarySkinId = getSelectedLibrarySkinId();
    if (librarySkinId) formData.set("librarySkinId", librarySkinId);
  }
  if (getFile(els.beatmapInput)) {
    formData.delete("libraryBeatmapId");
  } else {
    const libraryBeatmapId = getSelectedLibraryBeatmapId();
    if (libraryBeatmapId) formData.set("libraryBeatmapId", libraryBeatmapId);
  }
  els.submitBtn.disabled = true;
  setStatusLine(els.formStatus, t("upload.creatingJob"), null);

  try {
    const data = await apiFetch("/api/jobs", {
      method: "POST",
      body: formData,
    });

    setStatusLine(els.formStatus, t("upload.jobQueued", { id: data?.job?.id?.slice(0, 8) || t("common.created") }), "success");
    const selectedLibrarySkinId = getSelectedLibrarySkinId();
    const selectedLibraryBeatmapId = getSelectedLibraryBeatmapId();
    els.uploadForm.reset();
    if (els.librarySkinSelect && selectedLibrarySkinId) {
      els.librarySkinSelect.value = selectedLibrarySkinId;
    }
    if (els.libraryBeatmapSelect && selectedLibraryBeatmapId) {
      els.libraryBeatmapSelect.value = selectedLibraryBeatmapId;
    }
    els.videoQualitySelect.value = "medium";
    els.musicVolumeInput.value = "100";
    els.hitsoundVolumeInput.value = "100";
    if (els.cursorSizeInput) els.cursorSizeInput.value = "100";
    state.draftSkinPreview = null;

    updateFileRow(els.replayInput, els.replayFileState);
    updateFileRow(els.skinInput, els.skinFileState);
    updateFileRow(els.beatmapInput, els.beatmapFileState);
    updateDraftState();

    await loadJobs({ silent: false });
  } catch (error) {
    setStatusLine(els.formStatus, error.message, "error");
  } finally {
    els.submitBtn.disabled = false;
  }
}

function saveCurrentReplayPreset() {
  const name = String(els.replayPresetNameInput?.value || "").trim().slice(0, 80);
  if (!name) {
    setReplayPresetStatus(replayPresetMessage("enterName"), "error");
    return;
  }

  const values = collectReplayPresetValues();
  const existing = state.replayPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase()) || null;
  const now = new Date().toISOString();

  if (existing) {
    existing.values = values;
    existing.updatedAt = now;
    els.replayPresetSelect.value = existing.id;
  } else {
    const preset = {
      id: replayPresetId(),
      name,
      values,
      createdAt: now,
      updatedAt: now,
    };
    state.replayPresets.unshift(preset);
    if (state.replayPresets.length > 50) {
      state.replayPresets = state.replayPresets.slice(0, 50);
    }
    renderReplayPresetSelect();
    els.replayPresetSelect.value = preset.id;
  }

  saveReplayPresetStorage();
  renderReplayPresetSelect();
  setReplayPresetStatus(replayPresetMessage("saved", { name }), "success");
}

function applySelectedReplayPreset() {
  const preset = getSelectedReplayPreset();
  if (!preset) {
    setReplayPresetStatus(replayPresetMessage("selectPreset"), "error");
    return;
  }
  applyReplayPresetValues(preset.values || {});
  if (els.replayPresetNameInput && !els.replayPresetNameInput.value.trim()) {
    els.replayPresetNameInput.value = preset.name;
  }
  setReplayPresetStatus(replayPresetMessage("applied", { name: preset.name }), "success");
}

function deleteSelectedReplayPreset() {
  const preset = getSelectedReplayPreset();
  if (!preset) {
    setReplayPresetStatus(replayPresetMessage("selectPreset"), "error");
    return;
  }
  state.replayPresets = state.replayPresets.filter((item) => item.id !== preset.id);
  saveReplayPresetStorage();
  renderReplayPresetSelect();
  if (els.replayPresetNameInput) els.replayPresetNameInput.value = "";
  setReplayPresetStatus(replayPresetMessage("deleted", { name: preset.name }), "success");
}

function bindReplayPresets() {
  loadReplayPresets();

  els.replayPresetSaveBtn?.addEventListener("click", saveCurrentReplayPreset);
  els.replayPresetApplyBtn?.addEventListener("click", applySelectedReplayPreset);
  els.replayPresetDeleteBtn?.addEventListener("click", deleteSelectedReplayPreset);
  els.replayPresetSelect?.addEventListener("change", () => {
    const preset = getSelectedReplayPreset();
    if (preset && els.replayPresetNameInput) {
      els.replayPresetNameInput.value = preset.name;
    }
    setReplayPresetStatus("", null);
  });
  els.replayPresetNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCurrentReplayPreset();
    }
  });
}

function bindUploadForm() {
  els.uploadForm.addEventListener("submit", submitUpload);

  const fileBindings = [
    [els.replayInput, els.replayFileState],
    [els.skinInput, els.skinFileState],
    [els.beatmapInput, els.beatmapFileState],
  ];

  for (const [input, stateEl] of fileBindings) {
    input.addEventListener("change", () => {
      if (input === els.skinInput && getFile(els.skinInput) && els.librarySkinSelect?.value) {
        // Make skin source explicit: local upload clears selected library skin.
        els.librarySkinSelect.value = "";
      }
      updateFileRow(input, stateEl);
      if (input === els.skinInput) {
        const selected = getFile(els.skinInput);
        state.draftSkinPreviewToken += 1;
        state.draftSkinPreview = null;
        if (selected) {
          void requestDraftSkinPreview(selected);
        }
      }
      updateDraftState();
    });
    updateFileRow(input, stateEl);
  }

  els.librarySkinSelect?.addEventListener("change", () => {
    if (String(els.librarySkinSelect.value || "").trim() && getFile(els.skinInput)) {
      // Make skin source explicit: selecting a library skin clears stale local file input.
      els.skinInput.value = "";
      state.draftSkinPreviewToken += 1;
      state.draftSkinPreview = null;
      updateFileRow(els.skinInput, els.skinFileState);
    }
    updateDraftState();
  });

  els.libraryBeatmapSelect?.addEventListener("change", () => {
    updateDraftState();
  });

  for (const input of els.uploadForm.querySelectorAll('input[type="range"]')) {
    input.addEventListener("input", () => syncRangeVisual(input));
    input.addEventListener("change", () => syncRangeVisual(input));
    syncRangeVisual(input);
  }

  [els.videoQualitySelect, els.musicVolumeInput, els.hitsoundVolumeInput, els.cursorSizeInput].filter(Boolean).forEach((el) => {
    el.addEventListener("input", updateDraftState);
    el.addEventListener("change", updateDraftState);
  });

  updateDraftState();
}

function bindFilters() {
  for (const btn of els.filterButtons) {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter || "all";
      for (const other of els.filterButtons) {
        other.classList.toggle("is-active", other === btn);
      }
      renderJobs();
    });
  }
}

function bindTopbar() {
  els.refreshBtn.addEventListener("click", () => {
    void loadJobs({ silent: false });
  });
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    void loadJobs({ silent: true });
  }, 4500);
}

async function init() {
  bindTopbar();
  bindFilters();
  bindUploadForm();
  bindReplayPresets();
  await Promise.all([loadMeta(), loadSiteSettings(), loadSkins(), loadBeatmaps()]);
  await loadJobs({ silent: false });
  startPolling();
}

window.addEventListener("beforeunload", () => {
  if (state.pollTimer) clearInterval(state.pollTimer);
});

window.addEventListener("site-language-changed", () => {
  applySiteSettings();
  renderReplayPresetSelect();
  populateLibrarySkinSelect();
  populateLibraryBeatmapSelect();
  updateFileRow(els.replayInput, els.replayFileState);
  updateFileRow(els.skinInput, els.skinFileState);
  updateFileRow(els.beatmapInput, els.beatmapFileState);
  updateDraftState();
  renderTopSummary();
  renderJobs();
});

void init();
