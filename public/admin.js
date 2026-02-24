const state = {
  token: localStorage.getItem("osuReplayAdminToken") || null,
  admin: null,
  sessionExpiresAt: null,
  jobs: [],
  admins: [],
  jobsFilter: "all",
  pollTimer: null,
  loadingJobs: false,
  siteSettings: null,
};

const els = {
  syncBadge: document.getElementById("adminSyncBadge"),
  adminRoleBadge: document.getElementById("adminRoleBadge"),
  adminSessionShort: document.getElementById("adminSessionShort"),

  adminJobsTotal: document.getElementById("adminJobsTotal"),
  adminJobsVisible: document.getElementById("adminJobsVisible"),
  adminJobsStatusText: document.getElementById("adminJobsStatusText"),

  adminIdentity: document.getElementById("adminIdentity"),
  adminSessionText: document.getElementById("adminSessionText"),

  adminAuthView: document.getElementById("adminAuthView"),
  adminDashboardView: document.getElementById("adminDashboardView"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  adminUsernameInput: document.getElementById("adminUsernameInput"),
  adminPasswordInput: document.getElementById("adminPasswordInput"),
  adminLoginStatus: document.getElementById("adminLoginStatus"),
  adminLogoutBtn: document.getElementById("adminLogoutBtn"),

  superAdminSection: document.getElementById("superAdminSection"),
  createAdminForm: document.getElementById("createAdminForm"),
  newAdminUsernameInput: document.getElementById("newAdminUsernameInput"),
  newAdminPasswordInput: document.getElementById("newAdminPasswordInput"),
  newAdminRoleSelect: document.getElementById("newAdminRoleSelect"),
  createAdminStatus: document.getElementById("createAdminStatus"),
  refreshAdminsBtn: document.getElementById("refreshAdminsBtn"),
  adminsList: document.getElementById("adminsList"),

  siteSettingsLockedView: document.getElementById("siteSettingsLockedView"),
  siteSettingsEditor: document.getElementById("siteSettingsEditor"),
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
  reloadSiteSettingsBtn: document.getElementById("reloadSiteSettingsBtn"),

  adminRefreshJobsBtn: document.getElementById("adminRefreshJobsBtn"),
  jobsFilterButtons: Array.from(document.querySelectorAll("#section-replays .seg-btn")),
  adminJobsList: document.getElementById("adminJobsList"),
};

const STATUS_LABELS = {
  queued: "Queued",
  processing: "Rendering",
  completed: "Completed",
  failed: "Failed",
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  els.syncBadge.textContent = text;
  els.syncBadge.classList.toggle("live", Boolean(live));
}

function saveToken(token) {
  state.token = token || null;
  if (state.token) localStorage.setItem("osuReplayAdminToken", state.token);
  else localStorage.removeItem("osuReplayAdminToken");
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
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getJobTitle(job) {
  const custom = String(job.title || "").trim();
  if (custom) return custom;
  if (job.replayInfo?.playerName) return `${job.replayInfo.playerName} replay`;
  if (job.files?.replay?.originalName) return job.files.replay.originalName;
  return `Replay ${job.id.slice(0, 8)}`;
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
  else if (status === "queued") cls += " amber";
  return `<span class="${cls}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function renderJobsList() {
  const visible = state.jobs.filter(jobMatchesFilter);
  els.adminJobsTotal.textContent = String(state.jobs.length);
  els.adminJobsVisible.textContent = String(visible.length);

  if (!visible.length) {
    els.adminJobsList.innerHTML = '<div class="empty-state">Нет задач для выбранного фильтра.</div>';
    return;
  }

  els.adminJobsList.innerHTML = visible
    .map((job) => {
      const replay = job.files?.replay;
      const canDelete = Boolean(state.admin);
      const quality = QUALITY_LABELS[job.settings?.videoQuality] || job.settings?.videoQuality || "medium";
      const mods = job.replayInfo?.mods?.length ? job.replayInfo.mods.join("") : "NM";

      return `
        <div class="row-item" data-job-id="${escapeHtml(job.id)}">
          <div class="row-head">
            <div class="row-title">
              <strong>${escapeHtml(getJobTitle(job))}</strong>
              <span>${escapeHtml(job.id.slice(0, 8))} • ${escapeHtml(formatDateTime(job.createdAt))}</span>
            </div>
            <div class="row-actions">
              ${statusTag(job)}
              <button type="button" class="btn ${canDelete ? "btn-danger" : "btn-subtle"} small" data-action="delete-job" data-job-id="${escapeHtml(job.id)}" ${canDelete ? "" : "disabled title='Sign in as admin'"}>Delete</button>
            </div>
          </div>

          <div class="row-tags">
            <span class="tag">${escapeHtml(quality)}</span>
            <span class="tag">Music ${escapeHtml(job.settings?.musicVolume ?? 100)}%</span>
            <span class="tag">Hitsounds ${escapeHtml(job.settings?.hitsoundVolume ?? 100)}%</span>
            ${job.replayInfo ? `<span class="tag">${escapeHtml(job.replayInfo.modeName || "mode")}</span>` : ""}
            ${job.replayInfo ? `<span class="tag">${escapeHtml(mods)}</span>` : ""}
          </div>

          <div class="row-grid">
            <div class="row-cell"><span>Replay</span><strong>${replay ? `${escapeHtml(replay.originalName)} (${escapeHtml(formatBytes(replay.size))})` : "-"}</strong></div>
            <div class="row-cell"><span>Progress</span><strong>${Math.round((Number(job.progress || 0)) * 100)}% • ${escapeHtml(STATUS_LABELS[job.status] || job.status || "-")}</strong></div>
            <div class="row-cell"><span>Result</span><strong>${job.result ? escapeHtml(job.result.fileName || job.result.type || "ready") : (job.error ? escapeHtml(job.error) : "Pending")}</strong></div>
          </div>
        </div>`;
    })
    .join("");
}

function renderAdminsList() {
  if (!state.admin || state.admin.role !== "super_admin") {
    els.adminsList.innerHTML = "";
    return;
  }

  if (!state.admins.length) {
    els.adminsList.innerHTML = '<div class="empty-state">Список админов пуст.</div>';
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
              ${current
                ? '<button type="button" class="btn btn-subtle small" disabled>Current</button>'
                : `<button type="button" class="btn btn-danger small" data-action="delete-admin" data-admin-id="${escapeHtml(admin.id)}">Delete</button>`}
            </div>
          </div>
        </div>`;
    })
    .join("");
}

function renderSiteSettings() {
  const isSuperAdmin = Boolean(state.admin && state.admin.role === "super_admin");
  els.siteSettingsLockedView.classList.toggle("hidden", isSuperAdmin);
  els.siteSettingsEditor.classList.toggle("hidden", !isSuperAdmin);

  if (!isSuperAdmin) {
    setStatusLine(els.siteSettingsStatus, "", null);
    return;
  }

  const payload = state.siteSettings;
  if (!payload?.settings) {
    els.siteSettingsUpdatedMeta.textContent = "Not loaded";
    return;
  }

  const s = payload.settings;
  els.siteTitleInput.value = s.siteTitle || "";
  els.siteSubtitleInput.value = s.siteSubtitle || "";
  els.heroTitleInput.value = s.heroTitle || "";
  els.heroDescriptionInput.value = s.heroDescription || "";
  els.announcementTextInput.value = s.announcementText || "";
  els.siteDefaultQualitySelect.value = s.defaultVideoQuality || "medium";
  els.uploadsEnabledInput.checked = Boolean(s.uploadsEnabled);
  els.siteSettingsUpdatedMeta.textContent = `Updated: ${payload.updatedAt ? formatDateTime(payload.updatedAt) : "unknown"}`;
}

function renderAuthState() {
  const loggedIn = Boolean(state.admin);
  els.adminAuthView.classList.toggle("hidden", loggedIn);
  els.adminDashboardView.classList.toggle("hidden", !loggedIn);

  els.adminRoleBadge.textContent = loggedIn ? state.admin.role : "Guest";
  els.adminSessionShort.textContent = loggedIn
    ? (state.sessionExpiresAt ? formatDateTime(state.sessionExpiresAt) : "Active")
    : "Not signed in";

  els.adminIdentity.textContent = loggedIn ? state.admin.username : "Guest";
  els.adminSessionText.textContent = loggedIn
    ? `Session expires: ${state.sessionExpiresAt ? formatDateTime(state.sessionExpiresAt) : "unknown"}`
    : "Войдите в аккаунт администратора для управления реплеями.";

  const isSuperAdmin = Boolean(loggedIn && state.admin.role === "super_admin");
  els.superAdminSection.classList.toggle("hidden", !isSuperAdmin);

  if (!loggedIn) {
    state.admins = [];
    state.siteSettings = null;
    els.adminJobsStatusText.textContent = "Sign in to delete jobs";
  } else {
    els.adminJobsStatusText.textContent = `Signed in as ${state.admin.username} (${state.admin.role})`;
    if (isSuperAdmin) {
      void loadAdmins();
      void loadSiteSettings();
    } else {
      state.admins = [];
      state.siteSettings = null;
    }
  }

  renderAdminsList();
  renderSiteSettings();
  renderJobsList();
}

async function restoreSession() {
  if (!state.token) {
    renderAuthState();
    return;
  }

  try {
    const data = await apiFetch("/api/admin/me");
    state.admin = data?.admin || null;
    state.sessionExpiresAt = data?.session?.expiresAt || null;
  } catch {
    saveToken(null);
    state.admin = null;
    state.sessionExpiresAt = null;
  }
  renderAuthState();
}

async function loginAdmin(event) {
  event.preventDefault();
  setStatusLine(els.adminLoginStatus, "", null);

  const username = els.adminUsernameInput.value.trim();
  const password = els.adminPasswordInput.value;
  if (!username || !password) {
    setStatusLine(els.adminLoginStatus, "Введите логин и пароль", "error");
    return;
  }

  try {
    const data = await apiFetch("/api/admin/login", {
      method: "POST",
      auth: false,
      json: { username, password },
    });
    saveToken(data.token);
    state.admin = data.admin || null;
    state.sessionExpiresAt = data.expiresAt || null;
    setStatusLine(els.adminLoginStatus, "Вход выполнен", "success");
    renderAuthState();
  } catch (error) {
    setStatusLine(els.adminLoginStatus, error.message, "error");
  }
}

async function logoutAdmin() {
  try {
    await apiFetch("/api/admin/logout", { method: "POST" });
  } catch {
    // Session may already be invalid.
  }

  saveToken(null);
  state.admin = null;
  state.sessionExpiresAt = null;
  state.admins = [];
  state.siteSettings = null;
  renderAuthState();
}

async function loadJobs({ silent = false } = {}) {
  if (state.loadingJobs) return;
  state.loadingJobs = true;
  if (!silent) setSyncBadge("Refreshing jobs...");

  try {
    const data = await apiFetch("/api/jobs?limit=120", { auth: false });
    state.jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    renderJobsList();
    setSyncBadge("Auto refresh on", true);
  } catch (error) {
    setSyncBadge(`Error: ${error.message}`);
  } finally {
    state.loadingJobs = false;
  }
}

async function deleteJob(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  const label = job ? getJobTitle(job) : jobId;
  if (!state.admin) {
    window.alert("Сначала войдите в админ-аккаунт.");
    return;
  }

  if (!window.confirm(`Удалить реплей и артефакты с сервера?\n\n${label}`)) return;

  try {
    await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    await loadJobs({ silent: false });
  } catch (error) {
    if (error.status === 409) {
      const force = window.confirm(`${error.message}\n\nСделать force delete?`);
      if (!force) return;
      try {
        await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}?force=true`, { method: "DELETE" });
        await loadJobs({ silent: false });
        return;
      } catch (forceError) {
        window.alert(`Delete failed: ${forceError.message}`);
        return;
      }
    }
    window.alert(`Delete failed: ${error.message}`);
  }
}

async function loadAdmins() {
  if (!state.admin || state.admin.role !== "super_admin") return;
  try {
    const data = await apiFetch("/api/admin/admins");
    state.admins = Array.isArray(data?.admins) ? data.admins : [];
    renderAdminsList();
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
  }
}

async function createAdmin(event) {
  event.preventDefault();
  setStatusLine(els.createAdminStatus, "", null);

  const username = els.newAdminUsernameInput.value.trim();
  const password = els.newAdminPasswordInput.value;
  const role = els.newAdminRoleSelect.value;
  if (!username || !password) {
    setStatusLine(els.createAdminStatus, "Введите логин и пароль", "error");
    return;
  }

  try {
    await apiFetch("/api/admin/admins", {
      method: "POST",
      json: { username, password, role },
    });
    els.newAdminUsernameInput.value = "";
    els.newAdminPasswordInput.value = "";
    els.newAdminRoleSelect.value = "admin";
    setStatusLine(els.createAdminStatus, "Админ добавлен", "success");
    await loadAdmins();
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
  }
}

async function deleteAdmin(adminId) {
  if (!window.confirm("Удалить администратора?")) return;
  try {
    await apiFetch(`/api/admin/admins/${encodeURIComponent(adminId)}`, { method: "DELETE" });
    await loadAdmins();
  } catch (error) {
    setStatusLine(els.createAdminStatus, error.message, "error");
  }
}

async function loadSiteSettings() {
  if (!state.admin || state.admin.role !== "super_admin") return;
  try {
    const data = await apiFetch("/api/admin/site-settings");
    state.siteSettings = data || null;
    setStatusLine(els.siteSettingsStatus, "Loaded site settings", "success");
    renderSiteSettings();
  } catch (error) {
    state.siteSettings = null;
    setStatusLine(els.siteSettingsStatus, error.message, "error");
    renderSiteSettings();
  }
}

async function saveSiteSettings(event) {
  event.preventDefault();
  if (!state.admin || state.admin.role !== "super_admin") {
    setStatusLine(els.siteSettingsStatus, "Super admin access required", "error");
    return;
  }

  setStatusLine(els.siteSettingsStatus, "Saving...", null);

  try {
    const payload = {
      siteTitle: els.siteTitleInput.value,
      siteSubtitle: els.siteSubtitleInput.value,
      heroTitle: els.heroTitleInput.value,
      heroDescription: els.heroDescriptionInput.value,
      announcementText: els.announcementTextInput.value,
      defaultVideoQuality: els.siteDefaultQualitySelect.value,
      uploadsEnabled: Boolean(els.uploadsEnabledInput.checked),
    };

    const data = await apiFetch("/api/admin/site-settings", {
      method: "PUT",
      json: payload,
    });

    state.siteSettings = data || null;
    setStatusLine(els.siteSettingsStatus, "Settings saved", "success");
    renderSiteSettings();
  } catch (error) {
    setStatusLine(els.siteSettingsStatus, error.message, "error");
  }
}

function bindEvents() {
  els.adminLoginForm.addEventListener("submit", loginAdmin);
  els.adminLogoutBtn.addEventListener("click", () => { void logoutAdmin(); });
  els.createAdminForm.addEventListener("submit", createAdmin);
  els.refreshAdminsBtn.addEventListener("click", () => { void loadAdmins(); });

  els.siteSettingsForm.addEventListener("submit", saveSiteSettings);
  els.reloadSiteSettingsBtn.addEventListener("click", () => { void loadSiteSettings(); });

  els.adminRefreshJobsBtn.addEventListener("click", () => { void loadJobs({ silent: false }); });

  for (const btn of els.jobsFilterButtons) {
    btn.addEventListener("click", () => {
      state.jobsFilter = btn.dataset.filter || "all";
      for (const other of els.jobsFilterButtons) {
        other.classList.toggle("is-active", other === btn);
      }
      renderJobsList();
    });
  }

  els.adminJobsList.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='delete-job']");
    if (!btn || btn.disabled) return;
    const jobId = btn.dataset.jobId;
    if (!jobId) return;
    void deleteJob(jobId);
  });

  els.adminsList.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='delete-admin']");
    if (!btn || btn.disabled) return;
    const adminId = btn.dataset.adminId;
    if (!adminId) return;
    void deleteAdmin(adminId);
  });
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    void loadJobs({ silent: true });
  }, 5000);
}

async function init() {
  bindEvents();
  renderAuthState();
  await restoreSession();
  await loadJobs({ silent: false });
  startPolling();
}

window.addEventListener("beforeunload", () => {
  if (state.pollTimer) clearInterval(state.pollTimer);
});

void init();
