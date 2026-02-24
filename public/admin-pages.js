const ADMIN_TOKEN_KEY = "osuReplayAdminToken";
const adminI18n = window.osuAdminI18n || {
  t: (key, vars) => {
    let out = key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  },
  locale: () => "ru-RU",
  apply: () => {},
};

function at(key, vars) {
  return adminI18n.t(key, vars);
}

function adminLocale() {
  return adminI18n.locale?.() || "ru-RU";
}

function statusLabel(status) {
  return at(`dyn.status.${String(status || "queued")}`);
}

const state = {
  page: document.body?.dataset?.adminPage || "unknown",
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || null,
  admin: null,
  sessionExpiresAt: null,
  jobs: [],
  admins: [],
  siteSettings: null,
  jobsFilter: "all",
  pollTimer: null,
  loadingJobs: false,
  openReplayLogJobIds: new Set(),
  replayLogScrollTopByJobId: new Map(),
  replaysPageScrollY: 0,
};

const els = {
  syncBadge: document.getElementById("adminSyncBadge"),
  adminIdentity: document.getElementById("adminIdentity"),
  adminRoleBadge: document.getElementById("adminRoleBadge"),
  adminSessionCompact: document.getElementById("adminSessionCompact"),
  adminLogoutBtn: document.getElementById("adminLogoutBtn"),
  adminLangButtons: Array.from(document.querySelectorAll(".lang-btn[data-admin-lang-option]")),
  topNavLinks: Array.from(document.querySelectorAll("[data-admin-nav]")),

  adminLoginForm: document.getElementById("adminLoginForm"),
  adminUsernameInput: document.getElementById("adminUsernameInput"),
  adminPasswordInput: document.getElementById("adminPasswordInput"),
  adminLoginStatus: document.getElementById("adminLoginStatus"),

  panelAdminLabel: document.getElementById("panelAdminLabel"),
  panelLastSync: document.getElementById("panelLastSync"),
  panelJobsTotal: document.getElementById("panelJobsTotal"),
  panelJobsActive: document.getElementById("panelJobsActive"),
  panelJobsDone: document.getElementById("panelJobsDone"),
  panelJobsFailed: document.getElementById("panelJobsFailed"),

  replaysRefreshBtn: document.getElementById("replaysRefreshBtn"),
  replayFilterButtons: Array.from(document.querySelectorAll("[data-replay-filter]")),
  replaysStatusText: document.getElementById("replaysStatusText"),
  replaysTotalCount: document.getElementById("replaysTotalCount"),
  replaysVisibleCount: document.getElementById("replaysVisibleCount"),
  replaysList: document.getElementById("replaysList"),

  refreshAdminsBtn: document.getElementById("refreshAdminsBtn"),
  adminsLockedPanel: document.getElementById("adminsLockedPanel"),
  adminsContent: document.getElementById("adminsContent"),
  adminsCount: document.getElementById("adminsCount"),
  createAdminForm: document.getElementById("createAdminForm"),
  newAdminUsernameInput: document.getElementById("newAdminUsernameInput"),
  newAdminPasswordInput: document.getElementById("newAdminPasswordInput"),
  newAdminRoleSelect: document.getElementById("newAdminRoleSelect"),
  createAdminStatus: document.getElementById("createAdminStatus"),
  adminsList: document.getElementById("adminsList"),

  reloadSiteSettingsBtn: document.getElementById("reloadSiteSettingsBtn"),
  siteSettingsLockedPanel: document.getElementById("siteSettingsLockedPanel"),
  siteSettingsContent: document.getElementById("siteSettingsContent"),
  siteSettingsForm: document.getElementById("siteSettingsForm"),
  siteTitleInput: document.getElementById("siteTitleInput"),
  siteSubtitleInput: document.getElementById("siteSubtitleInput"),
  heroTitleInput: document.getElementById("heroTitleInput"),
  heroDescriptionInput: document.getElementById("heroDescriptionInput"),
  announcementTextInput: document.getElementById("announcementTextInput"),
  siteDefaultQualitySelect: document.getElementById("siteDefaultQualitySelect"),
  uploadsEnabledInput: document.getElementById("uploadsEnabledInput"),
  siteSettingsStatus: document.getElementById("siteSettingsStatus"),
  siteSettingsUpdatedMeta: document.getElementById("siteSettingsUpdatedMeta"),
};

const QUALITY_LABELS = {
  low: "720p / 30fps",
  medium: "1080p / 60fps",
  high: "1440p / 60fps",
  ultra: "4K / 60fps",
};

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
  return d.toLocaleString(adminLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(value) {
  if (!value) return "--:--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString(adminLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("is-error", "is-success");
  if (type === "error") el.classList.add("is-error");
  if (type === "success") el.classList.add("is-success");
}

function setSyncBadge(text, live = false) {
  if (!els.syncBadge) return;
  els.syncBadge.textContent = text;
  els.syncBadge.classList.toggle("live", Boolean(live));
}

function saveToken(token) {
  state.token = token || null;
  if (state.token) localStorage.setItem(ADMIN_TOKEN_KEY, state.token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasJson = options.json !== undefined;
  if (hasJson) headers.set("Content-Type", "application/json");
  if (options.auth !== false && state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

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
    throw error;
  }

  return payload;
}

function isProtectedPage() {
  return state.page !== "login";
}

function isSuperOnlyPage() {
  return state.page === "admins" || state.page === "settings";
}

function redirectTo(url) {
  window.location.replace(url);
}

function setNavActive() {
  for (const link of els.topNavLinks) {
    link.classList.toggle("is-active", link.dataset.adminNav === state.page);
  }
}

function applyAuthChrome() {
  const loggedIn = Boolean(state.admin);
  if (els.adminIdentity) els.adminIdentity.textContent = loggedIn ? state.admin.username : at("common.guest");
  if (els.adminRoleBadge) els.adminRoleBadge.textContent = loggedIn ? state.admin.role : at("common.guestLower");
  if (els.adminSessionCompact) {
    els.adminSessionCompact.textContent = loggedIn
      ? (state.sessionExpiresAt
          ? at("dyn.auth.until", { time: formatDateTime(state.sessionExpiresAt) })
          : at("dyn.auth.active"))
      : at("common.noSession");
  }
  if (els.adminLogoutBtn) {
    els.adminLogoutBtn.classList.toggle("hidden", !loggedIn);
  }
  if (els.panelAdminLabel) {
    els.panelAdminLabel.textContent = loggedIn
      ? `${state.admin.username} (${state.admin.role})`
      : at("dyn.auth.panelGuest");
  }
}

async function restoreSession() {
  if (!state.token) {
    state.admin = null;
    state.sessionExpiresAt = null;
    applyAuthChrome();
    return false;
  }

  try {
    const data = await apiFetch("/api/admin/me");
    state.admin = data?.admin || null;
    state.sessionExpiresAt = data?.session?.expiresAt || null;
    applyAuthChrome();
    return Boolean(state.admin);
  } catch {
    saveToken(null);
    state.admin = null;
    state.sessionExpiresAt = null;
    applyAuthChrome();
    return false;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setStatusLine(els.adminLoginStatus, "", null);

  const username = String(els.adminUsernameInput?.value || "").trim();
  const password = String(els.adminPasswordInput?.value || "");
  if (!username || !password) {
    setStatusLine(els.adminLoginStatus, at("dyn.login.enterCreds"), "error");
    return;
  }

  setSyncBadge(at("dyn.sync.signingIn"));
  try {
    const data = await apiFetch("/api/admin/login", {
      method: "POST",
      auth: false,
      json: { username, password },
    });

    saveToken(data?.token || null);
    state.admin = data?.admin || null;
    state.sessionExpiresAt = data?.expiresAt || null;
    applyAuthChrome();
    setSyncBadge(at("dyn.sync.sessionActive"), true);
    setStatusLine(els.adminLoginStatus, at("dyn.login.success"), "success");
    setTimeout(() => redirectTo("/admin/panel"), 200);
  } catch (error) {
    setSyncBadge(at("dyn.sync.loginFailed"));
    setStatusLine(els.adminLoginStatus, error.message, "error");
  }
}

async function logoutAdmin() {
  try {
    await apiFetch("/api/admin/logout", { method: "POST" });
  } catch {
    // Session can already be invalid.
  }
  saveToken(null);
  state.admin = null;
  state.sessionExpiresAt = null;
  applyAuthChrome();
  redirectTo("/admin/login");
}

function getJobTitle(job) {
  const custom = String(job.title || "").trim();
  if (custom) return custom;
  if (job.replayInfo?.playerName) return `${job.replayInfo.playerName} replay`;
  if (job.files?.replay?.originalName) return job.files.replay.originalName;
  return `Replay ${String(job.id || "").slice(0, 8)}`;
}

function jobMatchesFilter(job) {
  if (state.jobsFilter === "all") return true;
  if (state.jobsFilter === "active") return job.status === "queued" || job.status === "processing";
  if (state.jobsFilter === "completed") return job.status === "completed";
  if (state.jobsFilter === "failed") return job.status === "failed";
  return true;
}

function statusTag(job) {
  const status = String(job.status || "queued");
  let cls = "tag";
  if (status === "processing") cls += " blue";
  else if (status === "completed") cls += " green";
  else if (status === "failed") cls += " red";
  else cls += " amber";
  return `<span class="${cls}">${escapeHtml(statusLabel(status) || status)}</span>`;
}

function updatePanelMetrics() {
  if (!els.panelJobsTotal && !els.panelJobsActive && !els.panelJobsDone && !els.panelJobsFailed) return;
  const total = state.jobs.length;
  const active = state.jobs.filter((j) => j.status === "queued" || j.status === "processing").length;
  const done = state.jobs.filter((j) => j.status === "completed").length;
  const failed = state.jobs.filter((j) => j.status === "failed").length;
  if (els.panelJobsTotal) els.panelJobsTotal.textContent = String(total);
  if (els.panelJobsActive) els.panelJobsActive.textContent = String(active);
  if (els.panelJobsDone) els.panelJobsDone.textContent = String(done);
  if (els.panelJobsFailed) els.panelJobsFailed.textContent = String(failed);
  if (els.panelLastSync) {
    els.panelLastSync.textContent = new Date().toLocaleTimeString(adminLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}

function captureOpenReplayLogPanels() {
  if (!els.replaysList) return;
  state.openReplayLogJobIds = new Set(
    Array.from(els.replaysList.querySelectorAll(".row-item[data-job-id] .row-logs[open]"))
      .map((details) => String(details.closest(".row-item[data-job-id]")?.dataset.jobId || "").trim())
      .filter(Boolean),
  );
}

function captureReplayLogScrollState() {
  if (!els.replaysList) return;
  state.replaysPageScrollY = window.scrollY || window.pageYOffset || 0;
  const map = new Map();
  for (const row of els.replaysList.querySelectorAll(".row-item[data-job-id]")) {
    const jobId = String(row.dataset.jobId || "").trim();
    if (!jobId) continue;
    const pre = row.querySelector(".row-logs pre");
    if (!pre) continue;
    map.set(jobId, pre.scrollTop || 0);
  }
  state.replayLogScrollTopByJobId = map;
}

function restoreOpenReplayLogPanels() {
  if (!els.replaysList || !(state.openReplayLogJobIds instanceof Set) || state.openReplayLogJobIds.size === 0) return;
  for (const row of els.replaysList.querySelectorAll(".row-item[data-job-id]")) {
    const jobId = String(row.dataset.jobId || "").trim();
    if (!jobId || !state.openReplayLogJobIds.has(jobId)) continue;
    const details = row.querySelector(".row-logs");
    if (details) details.open = true;
  }
}

function restoreReplayLogScrollState() {
  if (!els.replaysList) return;
  if (state.replayLogScrollTopByJobId instanceof Map) {
    for (const row of els.replaysList.querySelectorAll(".row-item[data-job-id]")) {
      const jobId = String(row.dataset.jobId || "").trim();
      if (!jobId) continue;
      const pre = row.querySelector(".row-logs pre");
      if (!pre) continue;
      if (state.replayLogScrollTopByJobId.has(jobId)) {
        pre.scrollTop = Number(state.replayLogScrollTopByJobId.get(jobId) || 0);
      }
    }
  }
  if (Number.isFinite(state.replaysPageScrollY)) {
    window.scrollTo({ top: state.replaysPageScrollY, behavior: "auto" });
  }
}

function shouldPauseReplayAutoRefresh() {
  if (!els.replaysList || state.page !== "replays") return false;
  if (els.replaysList.querySelector(".row-logs[open]")) return true;
  const selection = window.getSelection?.();
  if (selection && String(selection).trim()) {
    const anchorNode = selection.anchorNode;
    if (anchorNode && els.replaysList.contains(anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentNode)) {
      return true;
    }
  }
  return false;
}

function renderReplays() {
  if (!els.replaysList) return;
  captureOpenReplayLogPanels();
  captureReplayLogScrollState();

  const visible = state.jobs.filter(jobMatchesFilter);
  if (els.replaysTotalCount) els.replaysTotalCount.textContent = String(state.jobs.length);
  if (els.replaysVisibleCount) els.replaysVisibleCount.textContent = String(visible.length);

  if (els.replaysStatusText) {
    els.replaysStatusText.textContent = state.admin
      ? at("dyn.replays.signedAs", { name: state.admin.username, role: state.admin.role })
      : at("dyn.replays.needAuth");
  }

  if (!visible.length) {
    els.replaysList.innerHTML = `<div class="empty-state">${escapeHtml(at("dyn.replays.emptyFiltered"))}</div>`;
    return;
  }

  els.replaysList.innerHTML = visible
    .map((job) => {
      const progress = Math.max(0, Math.min(100, Math.round((Number(job.progress || 0)) * 100)));
      const replay = job.files?.replay;
      const mods = Array.isArray(job.replayInfo?.mods) && job.replayInfo.mods.length ? job.replayInfo.mods.join("") : "NM";
      const resultText = job.result ? (job.result.fileName || job.result.type || "ready") : (job.error || at("dyn.replays.pending"));
      const logs = Array.isArray(job.logs) ? job.logs : [];
      const logsBlock = logs.length
        ? `
          <details class="row-logs">
            <summary>${escapeHtml(at("dyn.replays.logs", { count: logs.length }))}</summary>
            <pre>${escapeHtml(
              logs
                .map((line) => `[${formatTime(line?.at)}] ${String(line?.message || "")}`)
                .join("\n"),
            )}</pre>
          </details>
        `
        : "";
      return `
        <div class="row-item" data-job-id="${escapeHtml(job.id)}">
          <div class="row-head">
            <div class="row-title">
              <strong>${escapeHtml(getJobTitle(job))}</strong>
              <span>${escapeHtml(String(job.id).slice(0, 8))} • ${escapeHtml(formatDateTime(job.createdAt))}</span>
            </div>
            <div class="row-actions">
              ${statusTag(job)}
              <button type="button" class="btn btn-danger small" data-action="delete-job" data-job-id="${escapeHtml(job.id)}">${escapeHtml(at("dyn.replays.delete"))}</button>
            </div>
          </div>

          <div class="row-tags">
            <span class="tag">${escapeHtml(QUALITY_LABELS[job.settings?.videoQuality] || job.settings?.videoQuality || "medium")}</span>
            <span class="tag">Music ${escapeHtml(job.settings?.musicVolume ?? 100)}%</span>
            <span class="tag">Hitsounds ${escapeHtml(job.settings?.hitsoundVolume ?? 100)}%</span>
            ${job.replayInfo?.modeName ? `<span class="tag">${escapeHtml(job.replayInfo.modeName)}</span>` : ""}
            ${job.replayInfo ? `<span class="tag">${escapeHtml(mods)}</span>` : ""}
          </div>

          <div class="row-grid">
            <div class="row-cell"><span>${escapeHtml(at("dyn.replays.replay"))}</span><strong>${replay ? `${escapeHtml(replay.originalName)} (${escapeHtml(formatBytes(replay.size))})` : "-"}</strong></div>
            <div class="row-cell"><span>${escapeHtml(at("dyn.replays.progress"))}</span><strong>${progress}% • ${escapeHtml(statusLabel(job.status) || job.status || "-")}</strong></div>
            <div class="row-cell"><span>${escapeHtml(at("dyn.replays.result"))}</span><strong>${escapeHtml(resultText)}</strong></div>
          </div>
          ${logsBlock}
        </div>
      `;
    })
    .join("");
  restoreOpenReplayLogPanels();
  restoreReplayLogScrollState();
}

async function loadJobs({ silent = false } = {}) {
  if (state.loadingJobs) return;
  if (silent && shouldPauseReplayAutoRefresh()) {
    setSyncBadge(at("dyn.sync.autoPaused"));
    return;
  }
  state.loadingJobs = true;
  if (!silent) setSyncBadge(at("dyn.sync.loadingQueue"));
  try {
    const data = await apiFetch("/api/admin/jobs?limit=120");
    state.jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    updatePanelMetrics();
    renderReplays();
    setSyncBadge(at("dyn.sync.autoRefresh"), true);
  } catch (error) {
    setSyncBadge(at("dyn.sync.error", { error: error.message }));
  } finally {
    state.loadingJobs = false;
  }
}

async function deleteJob(jobId) {
  if (!state.admin) {
    window.alert(at("dyn.replays.signInDelete"));
    redirectTo("/admin/login");
    return;
  }

  const job = state.jobs.find((item) => item.id === jobId);
  const label = job ? getJobTitle(job) : jobId;
  if (!window.confirm(at("dyn.replays.confirmDelete", { label }))) return;

  try {
    await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    await loadJobs({ silent: false });
  } catch (error) {
    if (error.status === 409) {
      const force = window.confirm(at("dyn.replays.forceDelete", { error: error.message }));
      if (!force) return;
      try {
        await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}?force=true`, { method: "DELETE" });
        await loadJobs({ silent: false });
        return;
      } catch (forceError) {
        window.alert(at("dyn.replays.deleteFailed", { error: forceError.message }));
        return;
      }
    }
    window.alert(at("dyn.replays.deleteFailed", { error: error.message }));
  }
}

function renderAdmins() {
  const isSuper = Boolean(state.admin && state.admin.role === "super_admin");
  if (els.adminsLockedPanel) els.adminsLockedPanel.classList.toggle("hidden", isSuper);
  if (els.adminsContent) els.adminsContent.classList.toggle("hidden", !isSuper);
  if (!els.adminsList || !isSuper) return;

  if (els.adminsCount) els.adminsCount.textContent = String(state.admins.length);
  if (!state.admins.length) {
    els.adminsList.innerHTML = `<div class="empty-state">${escapeHtml(at("dyn.admins.empty"))}</div>`;
    return;
  }

  els.adminsList.innerHTML = state.admins
    .map((admin) => {
      const current = state.admin && admin.id === state.admin.id;
      return `
        <div class="row-item" data-admin-id="${escapeHtml(admin.id)}">
          <div class="row-head">
            <div class="row-title">
              <strong>${escapeHtml(admin.username)}</strong>
              <span>${escapeHtml(admin.role)} • ${escapeHtml(formatDateTime(admin.createdAt))}</span>
            </div>
            <div class="row-actions">
              <span class="tag ${admin.role === "super_admin" ? "blue" : ""}">${escapeHtml(admin.role)}</span>
              ${
                current
                  ? `<button type="button" class="btn btn-subtle small" disabled>${escapeHtml(at("dyn.replays.current"))}</button>`
                  : `<button type="button" class="btn btn-danger small" data-action="delete-admin" data-admin-id="${escapeHtml(admin.id)}">${escapeHtml(at("dyn.replays.delete"))}</button>`
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadAdmins() {
  if (!(state.admin && state.admin.role === "super_admin")) {
    renderAdmins();
    return;
  }
  setSyncBadge(at("dyn.sync.loadingAdmins"));
  try {
    const data = await apiFetch("/api/admin/admins");
    state.admins = Array.isArray(data?.admins) ? data.admins : [];
    renderAdmins();
    setSyncBadge(at("dyn.sync.autoRefresh"), true);
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
    setSyncBadge(at("dyn.sync.error", { error: error.message }));
  }
}

async function createAdmin(event) {
  event.preventDefault();
  if (!(state.admin && state.admin.role === "super_admin")) {
    setStatusLine(els.createAdminStatus, at("dyn.admins.superRequired"), "error");
    return;
  }

  const username = String(els.newAdminUsernameInput?.value || "").trim();
  const password = String(els.newAdminPasswordInput?.value || "");
  const role = String(els.newAdminRoleSelect?.value || "admin");
  if (!username || !password) {
    setStatusLine(els.createAdminStatus, at("dyn.login.enterCreds"), "error");
    return;
  }

  setStatusLine(els.createAdminStatus, at("dyn.admins.creating"), null);
  try {
    await apiFetch("/api/admin/admins", {
      method: "POST",
      json: { username, password, role },
    });
    if (els.newAdminUsernameInput) els.newAdminUsernameInput.value = "";
    if (els.newAdminPasswordInput) els.newAdminPasswordInput.value = "";
    if (els.newAdminRoleSelect) els.newAdminRoleSelect.value = "admin";
    setStatusLine(els.createAdminStatus, at("dyn.admins.created"), "success");
    await loadAdmins();
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
  }
}

async function deleteAdmin(adminId) {
  if (!window.confirm(at("dyn.admins.confirmDelete"))) return;
  try {
    await apiFetch(`/api/admin/admins/${encodeURIComponent(adminId)}`, { method: "DELETE" });
    await loadAdmins();
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
  }
}

function renderSiteSettings() {
  const isSuper = Boolean(state.admin && state.admin.role === "super_admin");
  if (els.siteSettingsLockedPanel) els.siteSettingsLockedPanel.classList.toggle("hidden", isSuper);
  if (els.siteSettingsContent) els.siteSettingsContent.classList.toggle("hidden", !isSuper);
  if (!isSuper) return;

  const payload = state.siteSettings;
  if (!payload?.settings) return;
  const s = payload.settings;
  if (els.siteTitleInput) els.siteTitleInput.value = s.siteTitle || "";
  if (els.siteSubtitleInput) els.siteSubtitleInput.value = s.siteSubtitle || "";
  if (els.heroTitleInput) els.heroTitleInput.value = s.heroTitle || "";
  if (els.heroDescriptionInput) els.heroDescriptionInput.value = s.heroDescription || "";
  if (els.announcementTextInput) els.announcementTextInput.value = s.announcementText || "";
  if (els.siteDefaultQualitySelect) els.siteDefaultQualitySelect.value = s.defaultVideoQuality || "medium";
  if (els.uploadsEnabledInput) els.uploadsEnabledInput.checked = Boolean(s.uploadsEnabled);
  if (els.siteSettingsUpdatedMeta) {
    els.siteSettingsUpdatedMeta.textContent = payload.updatedAt
      ? at("dyn.settings.updatedAt", { time: formatDateTime(payload.updatedAt) })
      : at("dyn.settings.updatedUnknown");
  }
}

async function loadSiteSettings() {
  if (!(state.admin && state.admin.role === "super_admin")) {
    renderSiteSettings();
    return;
  }

  setSyncBadge(at("dyn.sync.loadingSettings"));
  setStatusLine(els.siteSettingsStatus, at("dyn.settings.loading"), null);
  try {
    const data = await apiFetch("/api/admin/site-settings");
    state.siteSettings = data || null;
    renderSiteSettings();
    setStatusLine(els.siteSettingsStatus, at("dyn.settings.loaded"), "success");
    setSyncBadge(at("dyn.sync.autoRefresh"), true);
  } catch (error) {
    state.siteSettings = null;
    renderSiteSettings();
    setStatusLine(els.siteSettingsStatus, error.message, "error");
    setSyncBadge(at("dyn.sync.error", { error: error.message }));
  }
}

async function saveSiteSettings(event) {
  event.preventDefault();
  if (!(state.admin && state.admin.role === "super_admin")) {
    setStatusLine(els.siteSettingsStatus, at("dyn.admins.superRequired"), "error");
    return;
  }

  const payload = {
    siteTitle: els.siteTitleInput?.value || "",
    siteSubtitle: els.siteSubtitleInput?.value || "",
    heroTitle: els.heroTitleInput?.value || "",
    heroDescription: els.heroDescriptionInput?.value || "",
    announcementText: els.announcementTextInput?.value || "",
    defaultVideoQuality: els.siteDefaultQualitySelect?.value || "medium",
    uploadsEnabled: Boolean(els.uploadsEnabledInput?.checked),
  };

  setStatusLine(els.siteSettingsStatus, at("dyn.settings.saving"), null);
  try {
    const data = await apiFetch("/api/admin/site-settings", {
      method: "PUT",
      json: payload,
    });
    state.siteSettings = data || null;
    renderSiteSettings();
    setStatusLine(els.siteSettingsStatus, at("dyn.settings.saved"), "success");
  } catch (error) {
    setStatusLine(els.siteSettingsStatus, error.message, "error");
  }
}

function bindTopbar() {
  els.adminLogoutBtn?.addEventListener("click", () => {
    void logoutAdmin();
  });
}

function bindLoginPage() {
  els.adminLoginForm?.addEventListener("submit", handleLoginSubmit);
}

function bindReplaysPage() {
  els.replaysRefreshBtn?.addEventListener("click", () => {
    void loadJobs({ silent: false });
  });

  for (const btn of els.replayFilterButtons) {
    btn.addEventListener("click", () => {
      state.jobsFilter = btn.dataset.replayFilter || "all";
      for (const other of els.replayFilterButtons) {
        other.classList.toggle("is-active", other === btn);
      }
      renderReplays();
    });
  }

  els.replaysList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='delete-job']");
    if (!btn) return;
    const jobId = btn.dataset.jobId;
    if (!jobId) return;
    void deleteJob(jobId);
  });
}

function bindAdminsPage() {
  els.refreshAdminsBtn?.addEventListener("click", () => {
    void loadAdmins();
  });
  els.createAdminForm?.addEventListener("submit", createAdmin);
  els.adminsList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='delete-admin']");
    if (!btn) return;
    const adminId = btn.dataset.adminId;
    if (!adminId) return;
    void deleteAdmin(adminId);
  });
}

function bindSettingsPage() {
  els.reloadSiteSettingsBtn?.addEventListener("click", () => {
    void loadSiteSettings();
  });
  els.siteSettingsForm?.addEventListener("submit", saveSiteSettings);
}

function startPollingIfNeeded() {
  if (!(state.page === "panel" || state.page === "replays")) return;
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    void loadJobs({ silent: true });
  }, 5000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function initLoginPage() {
  bindLoginPage();
  const restored = await restoreSession();
  if (restored) {
    setSyncBadge(at("dyn.sync.sessionActive"), true);
    redirectTo("/admin/panel");
    return;
  }
  setSyncBadge(at("dyn.sync.signInRequired"));
}

async function initProtectedPage() {
  const restored = await restoreSession();
  if (!restored) {
    redirectTo("/admin/login");
    return;
  }

  if (isSuperOnlyPage() && state.admin?.role !== "super_admin") {
    redirectTo("/admin/panel");
    return;
  }

  bindTopbar();

  if (state.page === "panel") {
    await loadJobs({ silent: false });
  }
  if (state.page === "replays") {
    bindReplaysPage();
    await loadJobs({ silent: false });
  }
  if (state.page === "admins") {
    bindAdminsPage();
    await loadAdmins();
  }
  if (state.page === "settings") {
    bindSettingsPage();
    await loadSiteSettings();
  }

  startPollingIfNeeded();
}

async function init() {
  setNavActive();
  adminI18n.apply?.();
  applyAuthChrome();

  if (state.page === "login") {
    await initLoginPage();
    return;
  }

  if (!isProtectedPage()) return;
  await initProtectedPage();
}

window.addEventListener("admin-language-changed", () => {
  applyAuthChrome();
  if (state.page === "panel") updatePanelMetrics();
  if (state.page === "replays") renderReplays();
  if (state.page === "admins") renderAdmins();
  if (state.page === "settings") renderSiteSettings();
});

window.addEventListener("beforeunload", stopPolling);

void init();
