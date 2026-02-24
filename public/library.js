const ADMIN_TOKEN_KEY = "osuReplayAdminToken";

const state = {
  activeTab: (new URLSearchParams(window.location.search).get("tab") || "skins").toLowerCase() === "beatmaps" ? "beatmaps" : "skins",
  skins: [],
  beatmaps: [],
  loadingSkins: false,
  loadingBeatmaps: false,
  admin: { checked: false, isAdmin: false, token: null, info: null },
  skinModal: { open: false, loading: false, skinId: null, skin: null, selectedPhotoId: null },
};

const i18n = window.osuSiteI18n || { t: (k) => k, locale: () => "ru-RU", getLang: () => "ru" };
const t = (key, vars) => i18n.t(key, vars);
const localeCode = () => i18n.locale();
const isRu = () => (i18n.getLang?.() || "ru") !== "en";

function uiText() {
  return {
    openCard: isRu() ? "Открыть" : "Open",
    detailsLoading: isRu() ? "Загрузка карточки..." : "Loading skin card...",
    detailsError: isRu() ? "Не удалось загрузить карточку" : "Failed to load skin card",
    galleryTitle: isRu() ? "Галерея превью" : "Preview gallery",
    galleryEmpty: isRu() ? "Фото не добавлены. Используется авто-превью скина (если есть)." : "No custom photos yet. Auto skin preview is used (if available).",
    galleryLimit: isRu() ? "До 3 фото на скин" : "Up to 3 photos per skin",
    makePrimary: isRu() ? "Сделать главным" : "Set as main",
    primaryPhoto: isRu() ? "Главное фото" : "Main photo",
    deletePhoto: isRu() ? "Удалить фото" : "Delete photo",
    selectPhoto: isRu() ? "Выбрать фото" : "Select photo",
    uploadPhoto: isRu() ? "Добавить фото" : "Add photo",
    uploadingPhoto: isRu() ? "Загрузка фото..." : "Uploading photo...",
    photoFileRequired: isRu() ? "Выберите фото (.png/.jpg/.jpeg/.webp)" : "Select an image (.png/.jpg/.jpeg/.webp)",
    deleteSkin: isRu() ? "Удалить скин с сайта" : "Delete skin from site",
    deleteSkinConfirm: isRu() ? "Удалить этот скин с сайта? Действие необратимо." : "Delete this skin from the site? This action cannot be undone.",
    adminOnlyHint: isRu() ? "Редактирование доступно только администраторам." : "Editing is available to admins only.",
    autoPreviewLabel: isRu() ? "Авто-превью" : "Auto preview",
    skinsReady: isRu() ? "Библиотека готова" : "Library ready",
    loadingSkins: isRu() ? "Загрузка скинов..." : "Loading skins...",
    loadingBeatmaps: isRu() ? "Загрузка карт..." : "Loading beatmaps...",
    syncErrorPrefix: isRu() ? "Ошибка: " : "Error: ",
    emptyBeatmaps: isRu() ? "Библиотека карт пока пустая. Загрузите первый .osz/.osu." : "Beatmap library is empty. Upload your first .osz/.osu.",
    beatmapMetaAuto: isRu() ? "Метаданные распознаются автоматически" : "Metadata is parsed automatically",
    diffsLabel: isRu() ? "диффов" : "diffs",
    useInStudio: isRu() ? "Открыть в Studio" : "Use In Studio",
  };
}

const els = {
  syncBadge: document.getElementById("librarySyncBadge"),
  refreshBtn: document.getElementById("libraryRefreshBtn"),
  activeTabBadge: document.getElementById("libraryActiveTabBadge"),
  tabHelp: document.getElementById("libraryTabHelp"),
  tabButtons: Array.from(document.querySelectorAll("[data-library-tab]")),
  skinsView: document.getElementById("librarySkinsView"),
  beatmapsView: document.getElementById("libraryBeatmapsView"),
  skinsCountBadge: document.getElementById("skinsCountBadge"),
  skinGrid: document.getElementById("skinLibraryGrid"),
  skinForm: document.getElementById("skinLibraryForm"),
  skinFileInput: document.getElementById("skinLibraryFileInput"),
  skinFileState: document.getElementById("skinLibraryFileState"),
  skinStatus: document.getElementById("skinLibraryStatus"),
  skinSubmitBtn: document.getElementById("skinLibrarySubmitBtn"),
  beatmapsCountBadge: document.getElementById("beatmapsCountBadge"),
  beatmapGrid: document.getElementById("beatmapLibraryGrid"),
  beatmapForm: document.getElementById("beatmapLibraryForm"),
  beatmapFileInput: document.getElementById("beatmapLibraryFileInput"),
  beatmapFileState: document.getElementById("beatmapLibraryFileState"),
  beatmapStatus: document.getElementById("beatmapLibraryStatus"),
  beatmapSubmitBtn: document.getElementById("beatmapLibrarySubmitBtn"),
  skinModal: document.getElementById("skinDetailModal"),
  skinModalBackdrop: document.getElementById("skinDetailModalBackdrop"),
  skinModalCloseBtn: document.getElementById("skinDetailCloseBtn"),
  skinModalTitle: document.getElementById("skinDetailTitle"),
  skinModalSub: document.getElementById("skinDetailSub"),
  skinModalMainPreview: document.getElementById("skinDetailMainPreview"),
  skinModalGalleryGrid: document.getElementById("skinDetailGalleryGrid"),
  skinModalStatus: document.getElementById("skinDetailStatus"),
  skinModalAdminHint: document.getElementById("skinDetailAdminHint"),
  skinModalAdminPanel: document.getElementById("skinDetailAdminPanel"),
  skinModalPhotoForm: document.getElementById("skinDetailPhotoForm"),
  skinModalPhotoInput: document.getElementById("skinDetailPhotoInput"),
  skinModalPhotoFileState: document.getElementById("skinDetailPhotoFileState"),
  skinModalPhotoSubmitBtn: document.getElementById("skinDetailPhotoSubmitBtn"),
  skinModalPhotoStatus: document.getElementById("skinDetailPhotoStatus"),
  skinModalDeleteSkinBtn: document.getElementById("skinDetailDeleteSkinBtn"),
};

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function formatBytes(bytes) { let n = Number(bytes || 0); if (!Number.isFinite(n) || n <= 0) return "0 B"; const u = ["B","KB","MB","GB"]; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; } return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`; }
function formatDate(value) { if (!value) return "-"; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return d.toLocaleString(localeCode(), { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }); }
function setSyncBadge(text, live = false) { if (!els.syncBadge) return; els.syncBadge.textContent = text; els.syncBadge.classList.toggle("live", Boolean(live)); }
function setStatusLine(el, message, type) { if (!el) return; el.textContent = message || ""; el.classList.remove("is-error", "is-success"); if (type === "error") el.classList.add("is-error"); if (type === "success") el.classList.add("is-success"); }

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...options, headers, body: options.json !== undefined ? JSON.stringify(options.json) : options.body });
  const raw = await res.text(); let payload = null;
  if (raw) { try { payload = JSON.parse(raw); } catch { payload = { raw }; } }
  if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
  return payload;
}

function getAdminToken() { try { const raw = window.localStorage.getItem(ADMIN_TOKEN_KEY) || ""; return raw.trim() || null; } catch { return null; } }
async function adminApiFetch(url, options = {}) { const token = state.admin.token || getAdminToken(); if (!token) throw new Error(isRu() ? "Нужен вход администратора" : "Admin login required"); const headers = new Headers(options.headers || {}); headers.set("Authorization", `Bearer ${token}`); return apiFetch(url, { ...options, headers }); }

async function detectAdminSession() {
  state.admin.token = getAdminToken(); state.admin.isAdmin = false; state.admin.info = null;
  if (!state.admin.token) { state.admin.checked = true; document.body.classList.remove("is-library-admin"); return; }
  try { const data = await adminApiFetch("/api/admin/me"); state.admin.isAdmin = Boolean(data?.admin?.id); state.admin.info = data?.admin || null; }
  catch { state.admin.isAdmin = false; state.admin.info = null; }
  finally { state.admin.checked = true; document.body.classList.toggle("is-library-admin", state.admin.isAdmin); }
}

function updateFileRowState(input, stateEl) {
  const file = input?.files?.[0]; const row = input?.closest(".file-row"); if (!stateEl) return;
  if (!file) { stateEl.textContent = t("file.choose"); stateEl.title = ""; row?.classList.remove("has-file"); return; }
  row?.classList.add("has-file"); const text = `${file.name} (${formatBytes(file.size)})`; stateEl.textContent = text; stateEl.title = text;
}

function libraryTabHelpText(tab) { return tab === "beatmaps" ? (isRu() ? "Сохраняй beatmap-файлы в кэш, чтобы не загружать их повторно." : "Cache beatmap files so users don't need to upload them again.") : (isRu() ? "Сохраняй скины с превью и быстро выбирай их в Studio." : "Save skins with previews and quickly select them in Studio."); }
function setActiveTab(tab) {
  state.activeTab = tab === "beatmaps" ? "beatmaps" : "skins";
  const isSkins = state.activeTab === "skins";
  els.skinsView?.classList.toggle("hidden", !isSkins); els.beatmapsView?.classList.toggle("hidden", isSkins);
  if (els.activeTabBadge) els.activeTabBadge.textContent = isSkins ? "Skins" : "Beatmaps";
  if (els.tabHelp) els.tabHelp.textContent = libraryTabHelpText(state.activeTab);
  for (const btn of els.tabButtons) { const active = btn.dataset.libraryTab === state.activeTab; btn.classList.toggle("is-active", active); btn.setAttribute("aria-selected", active ? "true" : "false"); }
  const url = new URL(window.location.href); url.searchParams.set("tab", state.activeTab); window.history.replaceState({}, "", url);
}

function replaceSkinInState(nextSkin) { if (!nextSkin?.id) return; const idx = state.skins.findIndex((s) => s.id === nextSkin.id); if (idx >= 0) state.skins[idx] = nextSkin; else state.skins.unshift(nextSkin); }
function removeSkinFromState(id) { state.skins = state.skins.filter((s) => s.id !== id); }
function skinGalleryPhotos(skin) { return Array.isArray(skin?.gallery?.photos) ? skin.gallery.photos : []; }
function getSkinCardPreviewUrl(skin) { const base = skin?.cardPreviewUrl || (skin?.preview?.available ? skin?.preview?.previewUrl : null); return base ? `${base}${skin?.updatedAt ? `?t=${encodeURIComponent(skin.updatedAt)}` : ""}` : ""; }

function renderSkins() {
  if (!els.skinGrid) return;
  if (els.skinsCountBadge) els.skinsCountBadge.textContent = `${state.skins.length} skins`;
  if (!state.skins.length) { els.skinGrid.innerHTML = `<div class="empty-state">${escapeHtml(t("skins.empty"))}</div>`; return; }
  const text = uiText();
  els.skinGrid.innerHTML = state.skins.map((skin) => {
    const previewUrl = getSkinCardPreviewUrl(skin); const galleryCount = skinGalleryPhotos(skin).length;
    return `<article class="skin-card" data-skin-id="${escapeHtml(skin.id)}"><div class="skin-card-preview skin-card-open-surface" role="button" tabindex="0" data-open-skin="${escapeHtml(skin.id)}" aria-label="${escapeHtml(text.openCard)}">${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(skin.name || "Skin")}" loading="lazy" />` : `<div class="skin-card-placeholder">${escapeHtml(skin.preview?.error ? t("skins.previewError") : t("skins.noPreview"))}</div>`}${galleryCount > 0 ? `<span class="skin-card-gallery-count">${galleryCount}/3</span>` : ""}</div><div class="skin-card-body"><button class="skin-card-title-button" type="button" data-open-skin="${escapeHtml(skin.id)}">${escapeHtml(skin.name || "Skin")}</button><div class="skin-card-meta"><span>${escapeHtml(skin.file?.originalName || "skin.zip")}</span><span>${escapeHtml(formatBytes(skin.file?.size || 0))}</span><span>${escapeHtml(formatDate(skin.createdAt))}</span></div><div class="skin-card-actions"><button class="link-btn secondary" type="button" data-open-skin="${escapeHtml(skin.id)}">${escapeHtml(text.openCard)}</button><a class="link-btn" href="/?skin=${encodeURIComponent(skin.id)}">${escapeHtml(t("skins.useInStudio"))}</a><a class="link-btn secondary" href="${escapeHtml(skin.downloadUrl)}">${escapeHtml(t("common.download"))}</a></div></div></article>`;
  }).join("");
}

function beatmapTitle(beatmap) { const meta = beatmap.meta || {}; const core = [meta.artist, meta.title].filter(Boolean).join(" - "); return beatmap.name || core || beatmap.file?.originalName || "Beatmap"; }
function beatmapMetaLine(beatmap) { const meta = beatmap.meta || {}; const parts = []; if (meta.creator) parts.push(`mapper: ${meta.creator}`); if (Number(meta.osuFileCount || 0) > 0) parts.push(`${meta.osuFileCount} ${uiText().diffsLabel}`); if (meta.beatmapSetId) parts.push(`set #${meta.beatmapSetId}`); return parts.join(" • "); }
function renderBeatmaps() {
  if (!els.beatmapGrid) return;
  if (els.beatmapsCountBadge) els.beatmapsCountBadge.textContent = `${state.beatmaps.length} beatmaps`;
  if (!state.beatmaps.length) { els.beatmapGrid.innerHTML = `<div class="empty-state">${escapeHtml(uiText().emptyBeatmaps)}</div>`; return; }
  els.beatmapGrid.innerHTML = state.beatmaps.map((beatmap) => {
    const diffs = Array.isArray(beatmap.meta?.difficulties) ? beatmap.meta.difficulties.slice(0, 4) : []; const extra = Math.max(0, (beatmap.meta?.difficulties?.length || 0) - diffs.length);
    return `<article class="skin-card beatmap-card"><div class="skin-card-preview beatmap-card-preview"><div class="beatmap-card-badge">${escapeHtml((beatmap.meta?.sourceExt || ".osz").toUpperCase().replace(".", ""))}</div><div class="beatmap-card-title">${escapeHtml(beatmapTitle(beatmap))}</div><div class="beatmap-card-sub">${escapeHtml(beatmapMetaLine(beatmap) || uiText().beatmapMetaAuto)}</div></div><div class="skin-card-body"><div class="skin-card-meta"><span>${escapeHtml(beatmap.file?.originalName || "beatmap.osz")}</span><span>${escapeHtml(formatBytes(beatmap.file?.size || 0))}</span><span>${escapeHtml(formatDate(beatmap.createdAt))}</span></div><div class="beatmap-diff-chips">${diffs.map((d) => `<span class="tag">${escapeHtml(d)}</span>`).join("")}${extra > 0 ? `<span class="tag">+${extra}</span>` : ""}</div><div class="skin-card-actions"><a class="link-btn" href="/?beatmap=${encodeURIComponent(beatmap.id)}">${escapeHtml(uiText().useInStudio)}</a><a class="link-btn secondary" href="${escapeHtml(beatmap.downloadUrl)}">${escapeHtml(t("common.download"))}</a></div></div></article>`;
  }).join("");
}
function setSkinModalOpen(open) {
  state.skinModal.open = Boolean(open);
  els.skinModal?.classList.toggle("hidden", !open);
  document.body.classList.toggle("modal-open", Boolean(open));
  if (els.skinModal) els.skinModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function skinModalSelectedAsset() {
  const skin = state.skinModal.skin;
  if (!skin) return null;
  const photos = skinGalleryPhotos(skin);
  const primaryPhotoId = skin.gallery?.primaryPhotoId || photos[0]?.id || null;
  const selectedId = state.skinModal.selectedPhotoId || primaryPhotoId;
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) || null;
  if (selectedPhoto) {
    return {
      label: selectedPhoto.id === primaryPhotoId ? uiText().primaryPhoto : uiText().galleryTitle,
      src: `${selectedPhoto.photoUrl}${skin.updatedAt ? `?t=${encodeURIComponent(skin.updatedAt)}` : ""}`,
    };
  }
  if (skin.preview?.available && skin.preview?.previewUrl) {
    return {
      label: uiText().autoPreviewLabel,
      src: `${skin.preview.previewUrl}${skin.updatedAt ? `?t=${encodeURIComponent(skin.updatedAt)}` : ""}`,
    };
  }
  return null;
}

function renderSkinModal() {
  if (!els.skinModal) return;
  const text = uiText();
  const skin = state.skinModal.skin;
  if (!state.skinModal.open) return;

  if (state.skinModal.loading) {
    els.skinModalTitle && (els.skinModalTitle.textContent = text.detailsLoading);
    els.skinModalSub && (els.skinModalSub.textContent = "");
    els.skinModalMainPreview && (els.skinModalMainPreview.innerHTML = `<div class="skin-detail-empty">${escapeHtml(text.detailsLoading)}</div>`);
    els.skinModalGalleryGrid && (els.skinModalGalleryGrid.innerHTML = "");
    return;
  }

  if (!skin) {
    els.skinModalTitle && (els.skinModalTitle.textContent = text.detailsError);
    els.skinModalSub && (els.skinModalSub.textContent = "");
    els.skinModalMainPreview && (els.skinModalMainPreview.innerHTML = `<div class="skin-detail-empty">${escapeHtml(text.detailsError)}</div>`);
    els.skinModalGalleryGrid && (els.skinModalGalleryGrid.innerHTML = "");
    return;
  }

  const photos = skinGalleryPhotos(skin);
  const primaryPhotoId = skin.gallery?.primaryPhotoId || photos[0]?.id || null;
  if (!photos.some((photo) => photo.id === state.skinModal.selectedPhotoId)) state.skinModal.selectedPhotoId = primaryPhotoId || null;

  els.skinModalTitle && (els.skinModalTitle.textContent = skin.name || "Skin");
  els.skinModalSub && (els.skinModalSub.textContent = [skin.file?.originalName || "skin.zip", formatBytes(skin.file?.size || 0), formatDate(skin.updatedAt || skin.createdAt)].join(" • "));

  const selected = skinModalSelectedAsset();
  if (els.skinModalMainPreview) {
    els.skinModalMainPreview.innerHTML = selected?.src
      ? `<div class="skin-detail-main-media"><img src="${escapeHtml(selected.src)}" alt="${escapeHtml(skin.name || "Skin")}" /><div class="skin-detail-main-badges"><span class="badge">${escapeHtml(selected.label)}</span><span class="badge">${photos.length}/3</span></div></div>`
      : `<div class="skin-detail-empty">${escapeHtml(t("skins.noPreview"))}</div>`;
  }

  if (els.skinModalGalleryGrid) {
    if (!photos.length) {
      els.skinModalGalleryGrid.innerHTML = `<div class="skin-detail-gallery-empty">${escapeHtml(text.galleryEmpty)}</div>`;
    } else {
      els.skinModalGalleryGrid.innerHTML = photos.map((photo) => {
        const isPrimary = photo.id === primaryPhotoId;
        const isSelected = photo.id === state.skinModal.selectedPhotoId;
        const photoUrl = `${photo.photoUrl}${skin.updatedAt ? `?t=${encodeURIComponent(skin.updatedAt)}` : ""}`;
        return `<div class="skin-detail-thumb ${isPrimary ? "is-primary" : ""} ${isSelected ? "is-selected" : ""}"><button type="button" class="skin-detail-thumb-image" data-skin-photo-select="${escapeHtml(photo.id)}" title="${escapeHtml(text.selectPhoto)}"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(photo.fileName || "photo")}" loading="lazy" /></button><div class="skin-detail-thumb-meta"><span class="skin-detail-thumb-name">${escapeHtml(photo.fileName || "photo")}</span><span class="skin-detail-thumb-size">${escapeHtml(formatBytes(photo.size || 0))}</span></div><div class="skin-detail-thumb-actions ${state.admin.isAdmin ? "" : "hidden"}"><button type="button" class="btn btn-subtle" data-skin-photo-primary="${escapeHtml(photo.id)}" ${isPrimary ? "disabled" : ""}>${escapeHtml(isPrimary ? text.primaryPhoto : text.makePrimary)}</button><button type="button" class="btn btn-subtle btn-danger" data-skin-photo-delete="${escapeHtml(photo.id)}">${escapeHtml(text.deletePhoto)}</button></div></div>`;
      }).join("");
    }
  }

  els.skinModalAdminHint && (els.skinModalAdminHint.textContent = state.admin.isAdmin ? text.galleryLimit : text.adminOnlyHint);
  els.skinModalAdminPanel?.classList.toggle("hidden", !state.admin.isAdmin);
  if (els.skinModalCloseBtn) els.skinModalCloseBtn.textContent = isRu() ? "Закрыть" : "Close";
  if (els.skinModalDeleteSkinBtn) els.skinModalDeleteSkinBtn.textContent = text.deleteSkin;
  if (els.skinModalPhotoSubmitBtn) { els.skinModalPhotoSubmitBtn.textContent = text.uploadPhoto; els.skinModalPhotoSubmitBtn.disabled = !state.admin.isAdmin; }
}

async function openSkinModal(skinId) {
  if (!skinId) return;
  state.skinModal.skinId = String(skinId);
  state.skinModal.skin = null;
  state.skinModal.selectedPhotoId = null;
  state.skinModal.loading = true;
  setStatusLine(els.skinModalStatus, "", null);
  setStatusLine(els.skinModalPhotoStatus, "", null);
  setSkinModalOpen(true);
  renderSkinModal();
  try {
    const data = await apiFetch(`/api/skins/${encodeURIComponent(skinId)}`);
    state.skinModal.skin = data?.skin || null;
    state.skinModal.loading = false;
    state.skinModal.selectedPhotoId = state.skinModal.skin?.gallery?.primaryPhotoId || skinGalleryPhotos(state.skinModal.skin)[0]?.id || null;
    renderSkinModal();
  } catch (error) {
    state.skinModal.loading = false;
    state.skinModal.skin = null;
    renderSkinModal();
    setStatusLine(els.skinModalStatus, error.message || uiText().detailsError, "error");
  }
}

function closeSkinModal() {
  state.skinModal.loading = false;
  state.skinModal.skinId = null;
  state.skinModal.skin = null;
  state.skinModal.selectedPhotoId = null;
  setStatusLine(els.skinModalStatus, "", null);
  setStatusLine(els.skinModalPhotoStatus, "", null);
  if (els.skinModalPhotoForm) { els.skinModalPhotoForm.reset(); updateFileRowState(els.skinModalPhotoInput, els.skinModalPhotoFileState); }
  setSkinModalOpen(false);
}

async function refreshSkinModalAndList(updatedSkin) {
  if (updatedSkin) {
    replaceSkinInState(updatedSkin);
    state.skinModal.skin = updatedSkin;
    state.skinModal.skinId = updatedSkin.id;
  } else if (state.skinModal.skinId) {
    const data = await apiFetch(`/api/skins/${encodeURIComponent(state.skinModal.skinId)}`);
    state.skinModal.skin = data?.skin || null;
  }
  renderSkins();
  renderSkinModal();
}

async function submitSkinPhoto(event) {
  event.preventDefault();
  if (!state.admin.isAdmin || !state.skinModal.skinId) return;
  const file = els.skinModalPhotoInput?.files?.[0];
  if (!file) { setStatusLine(els.skinModalPhotoStatus, uiText().photoFileRequired, "error"); return; }
  els.skinModalPhotoSubmitBtn.disabled = true;
  setStatusLine(els.skinModalPhotoStatus, uiText().uploadingPhoto, null);
  try {
    const form = new FormData(); form.set("photo", file);
    const data = await adminApiFetch(`/api/skins/${encodeURIComponent(state.skinModal.skinId)}/photos`, { method: "POST", body: form });
    setStatusLine(els.skinModalPhotoStatus, isRu() ? "Фото добавлено" : "Photo uploaded", "success");
    els.skinModalPhotoForm.reset(); updateFileRowState(els.skinModalPhotoInput, els.skinModalPhotoFileState);
    await refreshSkinModalAndList(data?.skin || null);
  } catch (error) {
    setStatusLine(els.skinModalPhotoStatus, error.message, "error");
  } finally {
    els.skinModalPhotoSubmitBtn.disabled = !state.admin.isAdmin;
  }
}

async function setPrimarySkinPhoto(photoId) {
  if (!state.admin.isAdmin || !state.skinModal.skinId || !photoId) return;
  try {
    const data = await adminApiFetch(`/api/skins/${encodeURIComponent(state.skinModal.skinId)}/photos/${encodeURIComponent(photoId)}/primary`, { method: "POST" });
    state.skinModal.selectedPhotoId = String(photoId);
    await refreshSkinModalAndList(data?.skin || null);
  } catch (error) { setStatusLine(els.skinModalPhotoStatus, error.message, "error"); }
}

async function deleteSkinPhoto(photoId) {
  if (!state.admin.isAdmin || !state.skinModal.skinId || !photoId) return;
  try {
    const data = await adminApiFetch(`/api/skins/${encodeURIComponent(state.skinModal.skinId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
    if (state.skinModal.selectedPhotoId === String(photoId)) state.skinModal.selectedPhotoId = null;
    await refreshSkinModalAndList(data?.skin || null);
  } catch (error) { setStatusLine(els.skinModalPhotoStatus, error.message, "error"); }
}

async function deleteSkinFromLibrary() {
  if (!state.admin.isAdmin || !state.skinModal.skinId) return;
  if (!window.confirm(uiText().deleteSkinConfirm)) return;
  const skinId = state.skinModal.skinId;
  try {
    await adminApiFetch(`/api/skins/${encodeURIComponent(skinId)}`, { method: "DELETE" });
    removeSkinFromState(skinId);
    renderSkins();
    closeSkinModal();
    setSyncBadge(uiText().skinsReady, true);
  } catch (error) { setStatusLine(els.skinModalPhotoStatus, error.message, "error"); }
}
async function loadSkins({ silent = false } = {}) {
  if (state.loadingSkins) return;
  state.loadingSkins = true;
  if (!silent && state.activeTab === "skins") setSyncBadge(uiText().loadingSkins);
  try {
    const data = await apiFetch("/api/skins?limit=500");
    state.skins = Array.isArray(data?.skins) ? data.skins : [];
    renderSkins();
    if (state.skinModal.open && state.skinModal.skinId) {
      const refreshed = state.skins.find((skin) => skin.id === state.skinModal.skinId);
      if (refreshed) { state.skinModal.skin = refreshed; renderSkinModal(); }
    }
  } catch (error) {
    if (state.activeTab === "skins") setSyncBadge(uiText().syncErrorPrefix + error.message);
  } finally {
    state.loadingSkins = false;
  }
}

async function loadBeatmaps({ silent = false } = {}) {
  if (state.loadingBeatmaps) return;
  state.loadingBeatmaps = true;
  if (!silent && state.activeTab === "beatmaps") setSyncBadge(uiText().loadingBeatmaps);
  try {
    const data = await apiFetch("/api/beatmaps?limit=500");
    state.beatmaps = Array.isArray(data?.beatmaps) ? data.beatmaps : [];
    renderBeatmaps();
  } catch (error) {
    if (state.activeTab === "beatmaps") setSyncBadge(uiText().syncErrorPrefix + error.message);
  } finally {
    state.loadingBeatmaps = false;
  }
}

async function refreshActive({ silent = false } = {}) {
  if (state.activeTab === "skins") await loadSkins({ silent }); else await loadBeatmaps({ silent });
  setSyncBadge(uiText().skinsReady, true);
}

async function submitSkin(event) {
  event.preventDefault();
  const file = els.skinFileInput?.files?.[0];
  if (!file) { setStatusLine(els.skinStatus, t("skins.selectZip"), "error"); return; }
  els.skinSubmitBtn.disabled = true;
  setStatusLine(els.skinStatus, t("skins.uploading"), null);
  try {
    const data = await apiFetch("/api/skins", { method: "POST", body: new FormData(els.skinForm) });
    setStatusLine(els.skinStatus, t("skins.saved", { name: data?.skin?.name || "Skin" }), "success");
    els.skinForm.reset();
    updateFileRowState(els.skinFileInput, els.skinFileState);
    await loadSkins({ silent: false });
    setSyncBadge(uiText().skinsReady, true);
  } catch (error) {
    setStatusLine(els.skinStatus, error.message, "error");
  } finally {
    els.skinSubmitBtn.disabled = false;
  }
}

async function submitBeatmap(event) {
  event.preventDefault();
  const file = els.beatmapFileInput?.files?.[0];
  if (!file) { setStatusLine(els.beatmapStatus, isRu() ? "Выберите файл beatmap (.osz/.osu/.zip)" : "Select a beatmap file (.osz/.osu/.zip)", "error"); return; }
  els.beatmapSubmitBtn.disabled = true;
  setStatusLine(els.beatmapStatus, isRu() ? "Загрузка карты..." : "Uploading beatmap...", null);
  try {
    const data = await apiFetch("/api/beatmaps", { method: "POST", body: new FormData(els.beatmapForm) });
    const name = data?.beatmap?.name || "Beatmap";
    setStatusLine(els.beatmapStatus, data?.deduped ? (isRu() ? `Карта уже есть в библиотеке: ${name}` : `Beatmap already exists in library: ${name}`) : (isRu() ? `Карта сохранена: ${name}` : `Beatmap saved: ${name}`), "success");
    els.beatmapForm.reset();
    updateFileRowState(els.beatmapFileInput, els.beatmapFileState);
    await loadBeatmaps({ silent: false });
    setSyncBadge(uiText().skinsReady, true);
  } catch (error) {
    setStatusLine(els.beatmapStatus, error.message, "error");
  } finally {
    els.beatmapSubmitBtn.disabled = false;
  }
}

function onSkinGridClick(event) {
  const trigger = event.target.closest("[data-open-skin]");
  if (!trigger) return;
  event.preventDefault();
  void openSkinModal(trigger.getAttribute("data-open-skin"));
}

function onSkinGridKeydown(event) {
  const trigger = event.target.closest("[data-open-skin]");
  if (!trigger) return;
  if (String(trigger.tagName || "").toUpperCase() === "BUTTON") return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void openSkinModal(trigger.getAttribute("data-open-skin"));
  }
}

function onSkinModalGalleryClick(event) {
  const selectBtn = event.target.closest("[data-skin-photo-select]");
  if (selectBtn) { state.skinModal.selectedPhotoId = selectBtn.getAttribute("data-skin-photo-select"); renderSkinModal(); return; }
  const primaryBtn = event.target.closest("[data-skin-photo-primary]");
  if (primaryBtn) { void setPrimarySkinPhoto(primaryBtn.getAttribute("data-skin-photo-primary")); return; }
  const deleteBtn = event.target.closest("[data-skin-photo-delete]");
  if (deleteBtn) void deleteSkinPhoto(deleteBtn.getAttribute("data-skin-photo-delete"));
}

function bind() {
  els.refreshBtn?.addEventListener("click", () => { void refreshActive({ silent: false }); });
  for (const btn of els.tabButtons) btn.addEventListener("click", () => { setActiveTab(btn.dataset.libraryTab); void refreshActive({ silent: false }); });
  els.skinFileInput?.addEventListener("change", () => updateFileRowState(els.skinFileInput, els.skinFileState));
  els.beatmapFileInput?.addEventListener("change", () => updateFileRowState(els.beatmapFileInput, els.beatmapFileState));
  els.skinForm?.addEventListener("submit", submitSkin);
  els.beatmapForm?.addEventListener("submit", submitBeatmap);
  els.skinGrid?.addEventListener("click", onSkinGridClick);
  els.skinGrid?.addEventListener("keydown", onSkinGridKeydown);
  els.skinModalBackdrop?.addEventListener("click", closeSkinModal);
  els.skinModalCloseBtn?.addEventListener("click", closeSkinModal);
  els.skinModalGalleryGrid?.addEventListener("click", onSkinModalGalleryClick);
  els.skinModalPhotoForm?.addEventListener("submit", submitSkinPhoto);
  els.skinModalPhotoInput?.addEventListener("change", () => updateFileRowState(els.skinModalPhotoInput, els.skinModalPhotoFileState));
  els.skinModalDeleteSkinBtn?.addEventListener("click", () => { void deleteSkinFromLibrary(); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.skinModal.open) closeSkinModal(); });
  updateFileRowState(els.skinFileInput, els.skinFileState);
  updateFileRowState(els.beatmapFileInput, els.beatmapFileState);
  updateFileRowState(els.skinModalPhotoInput, els.skinModalPhotoFileState);
  setActiveTab(state.activeTab);
}

async function init() {
  bind();
  renderSkins();
  renderBeatmaps();
  await detectAdminSession();
  renderSkinModal();
  await Promise.all([loadSkins({ silent: true }), loadBeatmaps({ silent: true })]);
  setSyncBadge(uiText().skinsReady, true);
}

window.addEventListener("site-language-changed", () => {
  setActiveTab(state.activeTab);
  updateFileRowState(els.skinFileInput, els.skinFileState);
  updateFileRowState(els.beatmapFileInput, els.beatmapFileState);
  updateFileRowState(els.skinModalPhotoInput, els.skinModalPhotoFileState);
  renderSkins();
  renderBeatmaps();
  renderSkinModal();
});

void init();
