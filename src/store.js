const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { nowIso } = require("./utils");

function safeParseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableStringify(value, fallback = {}) {
  return JSON.stringify(value == null ? fallback : value);
}

function stripUndefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function passwordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function defaultSiteSettings() {
  return {
    siteTitle: "osu! Replay Studio",
    siteSubtitle: "Загрузка реплеев и очередь рендера",
    heroTitle: "Рендер реплеев osu! в видео через danser",
    heroDescription:
      "Загрузи реплей, скин и карту, настрой параметры danser и получи готовое видео в очереди результатов.",
    announcementText: "",
    uploadsEnabled: true,
    defaultVideoQuality: "medium",
  };
}

function normalizeLegacySiteSettingsCopy(input) {
  const source = { ...(input || {}) };
  const defaults = defaultSiteSettings();

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const isOneOf = (value, variants) => variants.includes(normalizeText(value));

  if (
    isOneOf(source.siteTitle, ["replay studio", "osu! replay by xverlxrd", "osu! replay studio"]) ||
    !String(source.siteTitle || "").trim()
  ) {
    source.siteTitle = defaults.siteTitle;
  }

  if (
    isOneOf(source.siteSubtitle, ["render queue and upload console", "загрузка реплеев и очередь рендера"]) ||
    !String(source.siteSubtitle || "").trim()
  ) {
    source.siteSubtitle = defaults.siteSubtitle;
  }

  if (
    isOneOf(source.heroTitle, [
      "clean replay workflow with matte apple-like surfaces",
      "сайт для рендера реплеев из osu!",
      "рендер реплеев osu! в видео через danser",
    ]) ||
    !String(source.heroTitle || "").trim()
  ) {
    source.heroTitle = defaults.heroTitle;
  }

  if (
    isOneOf(source.heroDescription, [
      "загрузи реплей, скин и получи видео",
      "загрузи реплей, скин и карту, настрой параметры danser и получи готовое видео в очереди результатов.",
    ]) ||
    !String(source.heroDescription || "").trim()
  ) {
    source.heroDescription = defaults.heroDescription;
  }

  if (isOneOf(source.announcementText, ["также", "test", ""])) {
    source.announcementText = "";
  }

  return source;
}

function normalizeSiteSettings(input) {
  const defaults = defaultSiteSettings();
  const source = { ...defaults, ...normalizeLegacySiteSettingsCopy(input || {}) };
  const quality = String(source.defaultVideoQuality || "medium").toLowerCase();

  return {
    siteTitle: String(source.siteTitle || defaults.siteTitle).trim().slice(0, 80) || defaults.siteTitle,
    siteSubtitle:
      String(source.siteSubtitle || defaults.siteSubtitle).trim().slice(0, 180) || defaults.siteSubtitle,
    heroTitle: String(source.heroTitle || defaults.heroTitle).trim().slice(0, 140) || defaults.heroTitle,
    heroDescription:
      String(source.heroDescription || defaults.heroDescription).trim().slice(0, 600) || defaults.heroDescription,
    announcementText: String(source.announcementText || "").trim().slice(0, 500),
    uploadsEnabled: Boolean(source.uploadsEnabled),
    defaultVideoQuality: ["low", "medium", "high", "ultra"].includes(quality) ? quality : "medium",
  };
}

function normalizeSkinGallery(input) {
  const photosSource = Array.isArray(input?.photos) ? input.photos : [];
  const photos = [];

  for (const raw of photosSource) {
    if (!raw || !raw.id || !raw.filePath) continue;
    photos.push({
      id: String(raw.id),
      fileName: String(raw.fileName || "photo").slice(0, 200),
      filePath: String(raw.filePath),
      mimeType: String(raw.mimeType || "").slice(0, 100) || null,
      size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
      createdAt: raw.createdAt || nowIso(),
    });
    if (photos.length >= 3) break;
  }

  let primaryPhotoId = input?.primaryPhotoId ? String(input.primaryPhotoId) : null;
  if (!photos.some((photo) => photo.id === primaryPhotoId)) {
    primaryPhotoId = photos[0]?.id || null;
  }

  return {
    photos,
    primaryPhotoId,
  };
}

class JobStore {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.options = {
      defaultAdminUsername: options.defaultAdminUsername || "xverlxrd",
      defaultAdminPassword: options.defaultAdminPassword || "LenovoG55%",
      sessionTtlHours: Number(options.sessionTtlHours) || 24 * 30,
    };

    this._ensureDir();
    this.db = new DatabaseSync(this.dbPath);
    this._init();
    this._importLegacyJsonIfNeeded();
    this._markInterruptedJobs();
    this._seedDefaultAdmin();
    this._seedDefaultSiteSettings();
  }

  _ensureDir() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _init() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        files_json TEXT NOT NULL,
        logs_json TEXT NOT NULL DEFAULT '[]',
        result_json TEXT,
        settings_json TEXT NOT NULL DEFAULT '{}',
        replay_info_json TEXT,
        skin_preview_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_admin_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        user_agent TEXT,
        FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_admin_id TEXT,
        FOREIGN KEY(updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS skins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        file_json TEXT NOT NULL,
        preview_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_skins_created_at ON skins(created_at DESC);

      CREATE TABLE IF NOT EXISTS beatmaps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        file_json TEXT NOT NULL,
        file_hash TEXT,
        checksums_json TEXT NOT NULL DEFAULT '[]',
        meta_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_beatmaps_created_at ON beatmaps(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_beatmaps_file_hash ON beatmaps(file_hash);
    `);

    this._ensureColumn("skins", "gallery_json", "TEXT");
  }

  _columnExists(table, column) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((row) => String(row.name || "").toLowerCase() === String(column || "").toLowerCase());
  }

  _ensureColumn(table, column, definitionSql) {
    if (this._columnExists(table, column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
  }

  _importLegacyJsonIfNeeded() {
    const jobCount = this.db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count;
    if (jobCount > 0) return;

    const legacyPath = path.join(path.dirname(this.dbPath), "jobs.json");
    if (!fs.existsSync(legacyPath)) return;

    try {
      const raw = fs.readFileSync(legacyPath, "utf8");
      const parsed = raw.trim() ? JSON.parse(raw) : { jobs: {} };
      const jobs = Object.values(parsed.jobs || {});
      for (const job of jobs) {
        this.createJob(job);
      }
    } catch {
      // Ignore legacy import errors to avoid blocking startup.
    }
  }

  _markInterruptedJobs() {
    const timestamp = nowIso();
    this.db
      .prepare(
        `UPDATE jobs
         SET status = 'failed',
             error = COALESCE(error, 'Server restarted before job finished'),
             updated_at = ?,
             completed_at = COALESCE(completed_at, ?)
         WHERE status IN ('processing', 'queued')`
      )
      .run(timestamp, timestamp);

    const now = nowIso();
    this.db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
  }

  _seedDefaultAdmin() {
    const existing = this.db.prepare("SELECT id FROM admins WHERE username = ?").get(this.options.defaultAdminUsername);
    if (existing) return;

    const adminCount = this.db.prepare("SELECT COUNT(*) AS count FROM admins").get().count;
    const salt = passwordSalt();
    const hash = hashPassword(this.options.defaultAdminPassword, salt);
    const timestamp = nowIso();
    const role = adminCount === 0 ? "super_admin" : "admin";

    this.db
      .prepare(
        `INSERT INTO admins (
          id, username, password_hash, password_salt, role,
          created_at, updated_at, created_by_admin_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)`
      )
      .run(crypto.randomUUID(), this.options.defaultAdminUsername, hash, salt, role, timestamp, timestamp);
  }

  _seedDefaultSiteSettings() {
    const existing = this.db.prepare("SELECT id FROM site_settings WHERE id = 1").get();
    if (existing) return;
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO site_settings (id, settings_json, updated_at, updated_by_admin_id)
         VALUES (1, ?, ?, NULL)`
      )
      .run(stableStringify(defaultSiteSettings(), {}), timestamp);
  }

  _rowToJob(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title || "",
      status: row.status,
      progress: Number(row.progress || 0),
      error: row.error || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
      files: safeParseJson(row.files_json, {}),
      logs: safeParseJson(row.logs_json, []),
      result: safeParseJson(row.result_json, null),
      settings: safeParseJson(row.settings_json, {}),
      replayInfo: safeParseJson(row.replay_info_json, null),
      skinPreview: safeParseJson(row.skin_preview_json, null),
    };
  }

  _writeJob(job) {
    const normalized = {
      id: String(job.id),
      title: String(job.title || ""),
      status: String(job.status || "queued"),
      progress: Math.max(0, Math.min(1, Number(job.progress ?? 0) || 0)),
      error: job.error == null ? null : String(job.error),
      createdAt: job.createdAt || nowIso(),
      updatedAt: job.updatedAt || nowIso(),
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      files: job.files || {},
      logs: Array.isArray(job.logs) ? job.logs : [],
      result: job.result || null,
      settings: job.settings || {},
      replayInfo: job.replayInfo || null,
      skinPreview: job.skinPreview || null,
    };

    this.db
      .prepare(
        `INSERT OR REPLACE INTO jobs (
          id, title, status, progress, error,
          created_at, updated_at, started_at, completed_at,
          files_json, logs_json, result_json, settings_json,
          replay_info_json, skin_preview_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalized.id,
        normalized.title,
        normalized.status,
        normalized.progress,
        normalized.error,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.startedAt,
        normalized.completedAt,
        stableStringify(normalized.files, {}),
        stableStringify(normalized.logs, []),
        normalized.result ? stableStringify(normalized.result, null) : null,
        stableStringify(normalized.settings, {}),
        normalized.replayInfo ? stableStringify(normalized.replayInfo, null) : null,
        normalized.skinPreview ? stableStringify(normalized.skinPreview, null) : null
      );

    return normalized;
  }

  createJob(job) {
    const timestamp = nowIso();
    const normalized = {
      ...job,
      createdAt: job.createdAt || timestamp,
      updatedAt: job.updatedAt || timestamp,
      logs: Array.isArray(job.logs) ? job.logs : [],
      files: job.files || {},
      settings: job.settings || {},
      replayInfo: job.replayInfo || null,
      skinPreview: job.skinPreview || null,
    };
    return this._writeJob(normalized);
  }

  getJob(id) {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(String(id));
    return this._rowToJob(row);
  }

  listJobs(limit = 20) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 20));
    const rows = this.db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(safeLimit);
    return rows.map((row) => this._rowToJob(row));
  }

  patchJob(id, patch) {
    const current = this.getJob(id);
    if (!current) return null;

    const next = {
      ...current,
      ...stripUndefined(patch),
      updatedAt: nowIso(),
    };

    return this._writeJob(next);
  }

  appendLog(id, message) {
    const current = this.getJob(id);
    if (!current) return null;
    const logs = Array.isArray(current.logs) ? current.logs.slice() : [];
    logs.push({ at: nowIso(), message: String(message) });
    const trimmed = logs.length > 200 ? logs.slice(-200) : logs;

    return this.patchJob(id, { logs: trimmed });
  }

  deleteJob(id) {
    const job = this.getJob(id);
    if (!job) return null;
    this.db.prepare("DELETE FROM jobs WHERE id = ?").run(String(id));
    return job;
  }

  _rowToSkin(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      file: safeParseJson(row.file_json, null),
      preview: safeParseJson(row.preview_json, null),
      gallery: normalizeSkinGallery(safeParseJson(row.gallery_json, null)),
    };
  }

  _writeSkin(skin) {
    const timestamp = nowIso();
    const normalized = {
      id: String(skin.id),
      name: String(skin.name || "").trim().slice(0, 120) || "Skin",
      createdAt: skin.createdAt || timestamp,
      updatedAt: skin.updatedAt || timestamp,
      file: skin.file || null,
      preview: skin.preview || null,
      gallery: normalizeSkinGallery(skin.gallery || null),
    };

    if (!normalized.file || !normalized.file.path || !normalized.file.originalName) {
      throw new Error("Skin file metadata is required");
    }

    this.db
      .prepare(
        `INSERT INTO skins (id, name, created_at, updated_at, file_json, preview_json, gallery_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at,
           file_json = excluded.file_json,
           preview_json = excluded.preview_json,
           gallery_json = excluded.gallery_json`
      )
      .run(
        normalized.id,
        normalized.name,
        normalized.createdAt,
        normalized.updatedAt,
        stableStringify(normalized.file, {}),
        normalized.preview ? stableStringify(normalized.preview, null) : null,
        stableStringify(normalized.gallery, { photos: [], primaryPhotoId: null })
      );

    return normalized;
  }

  createSkin(skin) {
    return this._writeSkin(skin);
  }

  getSkin(id) {
    const row = this.db.prepare("SELECT * FROM skins WHERE id = ?").get(String(id));
    return this._rowToSkin(row);
  }

  listSkins(limit = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const rows = this.db.prepare("SELECT * FROM skins ORDER BY created_at DESC LIMIT ?").all(safeLimit);
    return rows.map((row) => this._rowToSkin(row));
  }

  deleteSkin(id) {
    const skin = this.getSkin(id);
    if (!skin) return null;
    this.db.prepare("DELETE FROM skins WHERE id = ?").run(String(id));
    return skin;
  }

  _rowToBeatmap(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      file: safeParseJson(row.file_json, null),
      fileHash: row.file_hash || null,
      checksums: safeParseJson(row.checksums_json, []),
      meta: safeParseJson(row.meta_json, null),
    };
  }

  _writeBeatmap(beatmap) {
    const timestamp = nowIso();
    const normalizedChecksums = Array.from(
      new Set(
        (Array.isArray(beatmap.checksums) ? beatmap.checksums : [])
          .map((value) => String(value || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const normalized = {
      id: String(beatmap.id),
      name: String(beatmap.name || "").trim().slice(0, 180) || "Beatmap",
      createdAt: beatmap.createdAt || timestamp,
      updatedAt: beatmap.updatedAt || timestamp,
      file: beatmap.file || null,
      fileHash: beatmap.fileHash ? String(beatmap.fileHash).trim().toLowerCase() : null,
      checksums: normalizedChecksums,
      meta: beatmap.meta || null,
    };

    if (!normalized.file || !normalized.file.path || !normalized.file.originalName) {
      throw new Error("Beatmap file metadata is required");
    }

    this.db
      .prepare(
        `INSERT INTO beatmaps (id, name, created_at, updated_at, file_json, file_hash, checksums_json, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at,
           file_json = excluded.file_json,
           file_hash = excluded.file_hash,
           checksums_json = excluded.checksums_json,
           meta_json = excluded.meta_json`
      )
      .run(
        normalized.id,
        normalized.name,
        normalized.createdAt,
        normalized.updatedAt,
        stableStringify(normalized.file, {}),
        normalized.fileHash,
        stableStringify(normalized.checksums, []),
        normalized.meta ? stableStringify(normalized.meta, null) : null
      );

    return normalized;
  }

  createBeatmap(beatmap) {
    return this._writeBeatmap(beatmap);
  }

  getBeatmap(id) {
    const row = this.db.prepare("SELECT * FROM beatmaps WHERE id = ?").get(String(id));
    return this._rowToBeatmap(row);
  }

  listBeatmaps(limit = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const rows = this.db.prepare("SELECT * FROM beatmaps ORDER BY created_at DESC LIMIT ?").all(safeLimit);
    return rows.map((row) => this._rowToBeatmap(row));
  }

  deleteBeatmap(id) {
    const beatmap = this.getBeatmap(id);
    if (!beatmap) return null;
    this.db.prepare("DELETE FROM beatmaps WHERE id = ?").run(String(id));
    return beatmap;
  }

  findBeatmapByFileHash(fileHash) {
    const normalized = String(fileHash || "").trim().toLowerCase();
    if (!normalized) return null;
    const row = this.db.prepare("SELECT * FROM beatmaps WHERE file_hash = ? LIMIT 1").get(normalized);
    return this._rowToBeatmap(row);
  }

  findBeatmapByChecksum(checksum) {
    const normalized = String(checksum || "").trim().toLowerCase();
    if (!normalized) return null;
    const rows = this.db.prepare("SELECT * FROM beatmaps ORDER BY created_at DESC").all();
    for (const row of rows) {
      const checksums = safeParseJson(row.checksums_json, []);
      if (Array.isArray(checksums) && checksums.some((item) => String(item || "").toLowerCase() === normalized)) {
        return this._rowToBeatmap(row);
      }
    }
    return null;
  }

  listAdmins() {
    const rows = this.db
      .prepare(
        `SELECT id, username, role, created_at, updated_at, created_by_admin_id, is_active
         FROM admins
         ORDER BY role = 'super_admin' DESC, username COLLATE NOCASE ASC`
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdByAdminId: row.created_by_admin_id || null,
      isActive: Boolean(row.is_active),
    }));
  }

  getAdminById(id) {
    const row = this.db
      .prepare(
        `SELECT id, username, role, created_at, updated_at, created_by_admin_id, is_active
         FROM admins WHERE id = ?`
      )
      .get(String(id));
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdByAdminId: row.created_by_admin_id || null,
      isActive: Boolean(row.is_active),
    };
  }

  verifyAdminCredentials(username, password) {
    const row = this.db
      .prepare(
        `SELECT id, username, role, password_hash, password_salt, created_at, updated_at, is_active
         FROM admins WHERE lower(username) = lower(?) LIMIT 1`
      )
      .get(String(username || ""));

    if (!row || !row.is_active) return null;
    if (!verifyPassword(password, row.password_salt, row.password_hash)) return null;

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: Boolean(row.is_active),
    };
  }

  createAdmin({ username, password, role = "admin", createdByAdminId = null }) {
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) {
      throw new Error("Username is required");
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
      throw new Error("Username must be 3-32 chars and contain only letters, numbers, . _ -");
    }
    const cleanPassword = String(password || "");
    if (cleanPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const normalizedRole = role === "super_admin" ? "super_admin" : "admin";

    const exists = this.db.prepare("SELECT id FROM admins WHERE lower(username) = lower(?)").get(cleanUsername);
    if (exists) {
      throw new Error("Admin with this username already exists");
    }

    const id = crypto.randomUUID();
    const salt = passwordSalt();
    const hash = hashPassword(cleanPassword, salt);
    const timestamp = nowIso();

    this.db
      .prepare(
        `INSERT INTO admins (
          id, username, password_hash, password_salt, role,
          created_at, updated_at, created_by_admin_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(id, cleanUsername, hash, salt, normalizedRole, timestamp, timestamp, createdByAdminId);

    return this.getAdminById(id);
  }

  deleteAdmin(adminId, actorAdminId) {
    const target = this.getAdminById(adminId);
    if (!target) return null;
    if (target.id === actorAdminId) {
      throw new Error("You cannot delete your own account");
    }

    if (target.role === "super_admin") {
      const count = this.db
        .prepare("SELECT COUNT(*) AS count FROM admins WHERE role = 'super_admin' AND is_active = 1")
        .get().count;
      if (Number(count) <= 1) {
        throw new Error("Cannot delete the last super admin");
      }
    }

    this.db.prepare("DELETE FROM admins WHERE id = ?").run(String(adminId));
    return target;
  }

  createAdminSession(adminId, { userAgent = null, ttlHours } = {}) {
    const ttl = Math.max(1, Number(ttlHours) || this.options.sessionTtlHours);
    const token = randomToken(32);
    const id = crypto.randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttl * 60 * 60 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO admin_sessions (
          id, admin_id, token_hash, created_at, updated_at, expires_at, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, String(adminId), hashToken(token), createdAt, createdAt, expiresAt, userAgent ? String(userAgent).slice(0, 500) : null);

    return { token, createdAt, expiresAt };
  }

  getAdminSessionByToken(token) {
    const tokenHash = hashToken(token || "");
    const row = this.db
      .prepare(
        `SELECT
            s.id AS session_id,
            s.admin_id,
            s.created_at AS session_created_at,
            s.updated_at AS session_updated_at,
            s.expires_at,
            a.id AS id,
            a.username,
            a.role,
            a.created_at,
            a.updated_at,
            a.is_active
         FROM admin_sessions s
         JOIN admins a ON a.id = s.admin_id
         WHERE s.token_hash = ?
         LIMIT 1`
      )
      .get(tokenHash);

    if (!row) return null;
    if (!row.is_active) return null;

    if (row.expires_at <= nowIso()) {
      this.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }

    this.db.prepare("UPDATE admin_sessions SET updated_at = ? WHERE token_hash = ?").run(nowIso(), tokenHash);

    return {
      sessionId: row.session_id,
      adminId: row.admin_id,
      expiresAt: row.expires_at,
      admin: {
        id: row.id,
        username: row.username,
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: Boolean(row.is_active),
      },
    };
  }

  revokeAdminSession(token) {
    const tokenHash = hashToken(token || "");
    const result = this.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
    return Number(result.changes || 0) > 0;
  }

  getSiteSettings() {
    const row = this.db
      .prepare(
        `SELECT settings_json, updated_at, updated_by_admin_id
         FROM site_settings
         WHERE id = 1`
      )
      .get();

    if (!row) {
      const settings = normalizeSiteSettings(defaultSiteSettings());
      return {
        settings,
        updatedAt: null,
        updatedByAdminId: null,
      };
    }

    return {
      settings: normalizeSiteSettings(safeParseJson(row.settings_json, defaultSiteSettings())),
      updatedAt: row.updated_at || null,
      updatedByAdminId: row.updated_by_admin_id || null,
    };
  }

  updateSiteSettings(patch, updatedByAdminId = null) {
    const current = this.getSiteSettings();
    const nextSettings = normalizeSiteSettings({ ...current.settings, ...(patch || {}) });
    const timestamp = nowIso();

    this.db
      .prepare(
        `INSERT INTO site_settings (id, settings_json, updated_at, updated_by_admin_id)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at,
           updated_by_admin_id = excluded.updated_by_admin_id`
      )
      .run(stableStringify(nextSettings, {}), timestamp, updatedByAdminId ? String(updatedByAdminId) : null);

    return {
      settings: nextSettings,
      updatedAt: timestamp,
      updatedByAdminId: updatedByAdminId ? String(updatedByAdminId) : null,
    };
  }
}

module.exports = { JobStore };
