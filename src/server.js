const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");

const config = require("./config");
const { JobStore } = require("./store");
const { RenderQueue } = require("./worker");
const { renderJob } = require("./renderer");
const { parseOsrSummary } = require("./osr-parser");
const { extractSkinPreview, cleanupSkinPreview } = require("./skin-preview");
const { inspectBeatmapFile } = require("./beatmap-library");
const { createId, safeBaseName, moveFile, extLower, nowIso } = require("./utils");

const VIDEO_QUALITY_OPTIONS = ["low", "medium", "high", "ultra"];

config.ensureBaseDirs();

const app = express();
const store = new JobStore(path.join(config.dirs.data, "app.db"), {
  defaultAdminUsername: "xverlxrd",
  defaultAdminPassword: "LenovoG55%",
});
const queue = new RenderQueue({ store, renderer: renderJob, config });
const draftSkinPreviewCache = new Map();

app.disable("x-powered-by");
app.use(express.json());

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.dirs.incoming),
    filename: (req, file, cb) => {
      const random = crypto.randomBytes(8).toString("hex");
      cb(null, `${Date.now()}-${random}`);
    },
  }),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: 3,
  },
});

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

function boolFromEnv(name, fallback = false) {
  const parsed = parseBoolean(process.env[name]);
  return parsed == null ? fallback : parsed;
}

function numberFromEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function boolFromBody(body, key, fallback) {
  const parsed = parseBoolean(body?.[key]);
  return parsed == null ? fallback : parsed;
}

function defaultAdvancedRenderSettings() {
  return {
    gameplay: {
      showHitbar: true,
      showUnstableRate: true,
      showScore: true,
      showHpBar: true,
      showComboCounter: true,
      showPpCounter: true,
      showKeyOverlay: true,
      showLeaderboard: true,
      showLeaderboardAvatars: false,
      showBoundaries: true,
      showMods: true,
      showResultsScreen: true,
      showHitCounter: true,
      showSliderBreaks: false,
      showAimErrorMeter: false,
      showStrainGraph: true,
    },
    skin: {
      useSkinCursor: false,
      useSkinHitsounds: false,
      useSkinComboColors: false,
      useBeatmapComboColors: false,
    },
    cursor: {
      ripples: false,
      trail: true,
      sizePercent: 100,
      rainbow: true,
      trailGlow: true,
    },
    other: {
      seizureWarning: true,
      loadStoryboards: true,
      loadVideos: false,
      skipIntro: false,
      bgDimIntro: 0,
      bgDimNormal: 0.95,
      bgDimBreaks: 0.5,
      bgParallax: true,
      showDanserLogo: true,
      playNightcoreHitsounds: true,
      ignoreReplayFail: false,
    },
  };
}

function parseAdvancedRenderSettings(body) {
  const defaults = defaultAdvancedRenderSettings();
  return {
    gameplay: {
      showHitbar: boolFromBody(body, "gameplay_showHitbar", defaults.gameplay.showHitbar),
      showUnstableRate: boolFromBody(body, "gameplay_showUnstableRate", defaults.gameplay.showUnstableRate),
      showScore: boolFromBody(body, "gameplay_showScore", defaults.gameplay.showScore),
      showHpBar: boolFromBody(body, "gameplay_showHpBar", defaults.gameplay.showHpBar),
      showComboCounter: boolFromBody(body, "gameplay_showComboCounter", defaults.gameplay.showComboCounter),
      showPpCounter: boolFromBody(body, "gameplay_showPpCounter", defaults.gameplay.showPpCounter),
      showKeyOverlay: boolFromBody(body, "gameplay_showKeyOverlay", defaults.gameplay.showKeyOverlay),
      showLeaderboard: boolFromBody(body, "gameplay_showLeaderboard", defaults.gameplay.showLeaderboard),
      showLeaderboardAvatars: boolFromBody(
        body,
        "gameplay_showLeaderboardAvatars",
        defaults.gameplay.showLeaderboardAvatars
      ),
      showBoundaries: boolFromBody(body, "gameplay_showBoundaries", defaults.gameplay.showBoundaries),
      showMods: boolFromBody(body, "gameplay_showMods", defaults.gameplay.showMods),
      showResultsScreen: boolFromBody(body, "gameplay_showResultsScreen", defaults.gameplay.showResultsScreen),
      showHitCounter: boolFromBody(body, "gameplay_showHitCounter", defaults.gameplay.showHitCounter),
      showSliderBreaks: boolFromBody(body, "gameplay_showSliderBreaks", defaults.gameplay.showSliderBreaks),
      showAimErrorMeter: boolFromBody(body, "gameplay_showAimErrorMeter", defaults.gameplay.showAimErrorMeter),
      showStrainGraph: boolFromBody(body, "gameplay_showStrainGraph", defaults.gameplay.showStrainGraph),
    },
    skin: {
      useSkinCursor: boolFromBody(body, "skin_useSkinCursor", defaults.skin.useSkinCursor),
      useSkinHitsounds: boolFromBody(body, "skin_useSkinHitsounds", defaults.skin.useSkinHitsounds),
      useSkinComboColors: boolFromBody(body, "skin_useSkinComboColors", defaults.skin.useSkinComboColors),
      useBeatmapComboColors: boolFromBody(body, "skin_useBeatmapComboColors", defaults.skin.useBeatmapComboColors),
    },
    cursor: {
      ripples: boolFromBody(body, "cursor_ripples", defaults.cursor.ripples),
      trail: boolFromBody(body, "cursor_trail", defaults.cursor.trail),
      sizePercent: Math.round(clampNumber(body?.cursor_size, 25, 300, defaults.cursor.sizePercent)),
      rainbow: boolFromBody(body, "cursor_rainbow", defaults.cursor.rainbow),
      trailGlow: boolFromBody(body, "cursor_trailGlow", defaults.cursor.trailGlow),
    },
    other: {
      seizureWarning: boolFromBody(body, "other_seizureWarning", defaults.other.seizureWarning),
      loadStoryboards: boolFromBody(body, "other_loadStoryboards", defaults.other.loadStoryboards),
      loadVideos: boolFromBody(body, "other_loadVideos", defaults.other.loadVideos),
      skipIntro: boolFromBody(body, "other_skipIntro", defaults.other.skipIntro),
      bgDimIntro: Number(clampNumber(body?.other_bgDimIntro, 0, 1, defaults.other.bgDimIntro).toFixed(2)),
      bgDimNormal: Number(clampNumber(body?.other_bgDimNormal, 0, 1, defaults.other.bgDimNormal).toFixed(2)),
      bgDimBreaks: Number(clampNumber(body?.other_bgDimBreaks, 0, 1, defaults.other.bgDimBreaks).toFixed(2)),
      bgParallax: boolFromBody(body, "other_bgParallax", defaults.other.bgParallax),
      showDanserLogo: boolFromBody(body, "other_showDanserLogo", defaults.other.showDanserLogo),
      playNightcoreHitsounds: boolFromBody(
        body,
        "other_playNightcoreHitsounds",
        defaults.other.playNightcoreHitsounds
      ),
      ignoreReplayFail: boolFromBody(body, "other_ignoreReplayFail", defaults.other.ignoreReplayFail),
    },
  };
}

function parseUploadSettings(body) {
  const siteDefaults = store.getSiteSettings().settings;
  const fallbackQuality = siteDefaults?.defaultVideoQuality || "medium";
  const videoQualityRaw = String(body?.videoQuality || fallbackQuality).trim().toLowerCase();
  const videoQuality = VIDEO_QUALITY_OPTIONS.includes(videoQualityRaw) ? videoQualityRaw : "medium";

  const musicVolume = Math.max(0, Math.min(200, Number(body?.musicVolume ?? 100) || 100));
  const hitsoundVolume = Math.max(0, Math.min(200, Number(body?.hitsoundVolume ?? 100) || 100));

  return {
    videoQuality,
    musicVolume: Math.round(musicVolume),
    hitsoundVolume: Math.round(hitsoundVolume),
    advancedRender: parseAdvancedRenderSettings(body),
  };
}

function fileSummary(file) {
  if (!file) return null;
  return {
    originalName: file.originalName,
    size: file.size,
  };
}

function extractJobRenderMetrics(job) {
  const logs = Array.isArray(job?.logs) ? job.logs : [];
  let replayPp = null;

  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const message = String(logs[i]?.message || "");
    if (!message.includes("|")) continue;
    if (/PLAYER|GRADE|MAX COMBO|^\s*\+---\+/i.test(message)) continue;
    const rowMatch = message.match(/\|\s*\d+\s*\|.*\|\s*([0-9]+(?:\.[0-9]+)?)\s*\|$/);
    if (!rowMatch) continue;
    const parsed = Number(rowMatch[1]);
    if (Number.isFinite(parsed)) {
      replayPp = Number(parsed.toFixed(2));
      break;
    }
  }

  return {
    replayPp,
  };
}

function serializeJob(job, options = {}) {
  if (!job) return null;
  const includeLogs = options.includeLogs === true;
  const hasSkinPreview = Boolean(job.skinPreview?.available && job.skinPreview?.filePath);
  const allLogs = Array.isArray(job.logs) ? job.logs : [];
  let publicLogs = [];
  if (includeLogs) {
    const tail = allLogs.slice(-240);
    const diagnosticMatches = allLogs.filter((line) =>
      /panic:|fatal:|failed to parse the patch|exception|segmentation fault/i.test(String(line?.message || ""))
    );
    if (diagnosticMatches.length) {
      const seen = new Set();
      publicLogs = [...diagnosticMatches.slice(-20), ...tail].filter((line) => {
        const key = `${line?.at || ""}|${String(line?.message || "")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else {
      publicLogs = tail;
    }
  }
  const status = String(job.status || "queued");
  const renderMetrics = extractJobRenderMetrics(job);
  const publicStatusText =
    status === "processing"
      ? "Rendering in progress"
      : status === "completed"
        ? "Render completed"
        : status === "failed"
          ? "Render failed"
          : "Queued for rendering";
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    progress: job.progress ?? 0,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    files: {
      replay: fileSummary(job.files?.replay),
      skin: fileSummary(job.files?.skin),
      beatmap: fileSummary(job.files?.beatmap),
    },
    settings: {
      videoQuality: job.settings?.videoQuality || "medium",
      musicVolume: Number(job.settings?.musicVolume ?? 100),
      hitsoundVolume: Number(job.settings?.hitsoundVolume ?? 100),
      advancedRender: job.settings?.advancedRender || defaultAdvancedRenderSettings(),
    },
    replayInfo: job.replayInfo || null,
    renderMetrics,
    skinPreview: job.skinPreview
      ? {
          available: Boolean(job.skinPreview.available),
          assetName: job.skinPreview.assetName || null,
          extractedAt: job.skinPreview.extractedAt || null,
          fileCount: job.skinPreview.fileCount ?? null,
          error: job.skinPreview.error || null,
          previewUrl: hasSkinPreview ? `/api/jobs/${job.id}/skin-preview` : null,
        }
      : null,
    lastLog: includeLogs
      ? (allLogs.length ? allLogs[allLogs.length - 1]?.message || null : null)
      : publicStatusText,
    logs: publicLogs,
    result: job.result
      ? {
          type: job.result.type,
          fileName: job.result.fileName,
          contentType: job.result.contentType,
          downloadUrl: `/api/jobs/${job.id}/download`,
          previewUrl: job.result.type === "video" ? `/api/jobs/${job.id}/preview` : null,
        }
      : null,
  };
}

function serializeSkin(skin) {
  if (!skin) return null;
  const hasPreview = Boolean(skin.preview?.available && skin.preview?.filePath);
  const fallbackPreviewUrl = hasPreview ? `/api/skins/${skin.id}/preview` : null;
  const rawGalleryPhotos = Array.isArray(skin.gallery?.photos) ? skin.gallery.photos : [];
  const galleryPhotos = rawGalleryPhotos
    .filter((photo) => photo && photo.id && photo.filePath)
    .slice(0, 3)
    .map((photo) => ({
      id: String(photo.id),
      fileName: photo.fileName || "photo",
      mimeType: photo.mimeType || null,
      size: Number(photo.size || 0),
      createdAt: photo.createdAt || null,
      photoUrl: `/api/skins/${skin.id}/photos/${photo.id}`,
    }));
  const primaryPhotoId = galleryPhotos.some((photo) => photo.id === skin.gallery?.primaryPhotoId)
    ? String(skin.gallery.primaryPhotoId)
    : (galleryPhotos[0]?.id || null);
  const primaryGalleryPhoto = galleryPhotos.find((photo) => photo.id === primaryPhotoId) || null;

  return {
    id: skin.id,
    name: skin.name || "Skin",
    createdAt: skin.createdAt,
    updatedAt: skin.updatedAt,
    file: fileSummary(skin.file),
    preview: skin.preview
      ? {
          available: Boolean(skin.preview.available),
          assetName: skin.preview.assetName || null,
          extractedAt: skin.preview.extractedAt || null,
          fileCount: skin.preview.fileCount ?? null,
          error: skin.preview.error || null,
          previewUrl: fallbackPreviewUrl,
        }
      : null,
    gallery: {
      photos: galleryPhotos,
      primaryPhotoId,
      maxPhotos: 3,
    },
    cardPreviewUrl: primaryGalleryPhoto?.photoUrl || fallbackPreviewUrl,
    downloadUrl: `/api/skins/${skin.id}/download`,
  };
}

function serializeBeatmap(beatmap) {
  if (!beatmap) return null;
  const meta = beatmap.meta || {};
  return {
    id: beatmap.id,
    name: beatmap.name || "Beatmap",
    createdAt: beatmap.createdAt,
    updatedAt: beatmap.updatedAt,
    file: fileSummary(beatmap.file),
    fileHash: beatmap.fileHash || null,
    checksumsCount: Array.isArray(beatmap.checksums) ? beatmap.checksums.length : 0,
    meta: {
      sourceExt: meta.sourceExt || null,
      osuFileCount: Number(meta.osuFileCount || 0),
      beatmapSetId: meta.beatmapSetId ?? null,
      title: meta.title || null,
      artist: meta.artist || null,
      creator: meta.creator || null,
      difficulties: Array.isArray(meta.difficulties) ? meta.difficulties.slice(0, 20) : [],
    },
    downloadUrl: `/api/beatmaps/${beatmap.id}/download`,
  };
}

function validateExt(file, allowed) {
  if (!file) return false;
  return allowed.includes(extLower(file.originalname));
}

async function promoteUploadedFile(jobId, kind, multerFile) {
  if (!multerFile) return null;
  const jobUploadDir = path.join(config.dirs.uploads, jobId);
  const safeName = safeBaseName(multerFile.originalname);
  const destPath = path.join(jobUploadDir, `${kind}-${safeName}`);
  await moveFile(multerFile.path, destPath);
  return {
    path: destPath,
    originalName: multerFile.originalname,
    size: multerFile.size,
  };
}

async function copyLibrarySkinToJob(jobId, librarySkin) {
  if (!librarySkin?.file?.path) return null;
  const jobUploadDir = path.join(config.dirs.uploads, jobId);
  await fs.mkdir(jobUploadDir, { recursive: true });
  const safeName = safeBaseName(librarySkin.file.originalName || `${librarySkin.name || "skin"}.zip`);
  const destPath = path.join(jobUploadDir, `skin-${safeName}`);
  await fs.copyFile(librarySkin.file.path, destPath);
  return {
    path: destPath,
    originalName: librarySkin.file.originalName,
    size: librarySkin.file.size,
    librarySkinId: librarySkin.id,
    librarySkinName: librarySkin.name || null,
  };
}

function cloneSkinPreview(preview) {
  if (!preview) return null;
  return JSON.parse(JSON.stringify(preview));
}

function extMimeFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function normalizeSkinGalleryState(gallery) {
  const photos = Array.isArray(gallery?.photos) ? gallery.photos : [];
  const normalizedPhotos = photos
    .filter((photo) => photo && photo.id && photo.filePath)
    .slice(0, 3)
    .map((photo) => ({
      id: String(photo.id),
      fileName: String(photo.fileName || "photo").slice(0, 200),
      filePath: String(photo.filePath),
      mimeType: String(photo.mimeType || extMimeFromPath(photo.filePath) || "").slice(0, 100) || null,
      size: Number(photo.size || 0),
      createdAt: photo.createdAt || nowIso(),
    }));

  let primaryPhotoId = gallery?.primaryPhotoId ? String(gallery.primaryPhotoId) : null;
  if (!normalizedPhotos.some((photo) => photo.id === primaryPhotoId)) {
    primaryPhotoId = normalizedPhotos[0]?.id || null;
  }
  return { photos: normalizedPhotos, primaryPhotoId };
}

async function storeSkinGalleryPhotoFile(skinId, photoId, multerFile) {
  const libraryDir = path.join(config.dirs.data, "skins-library", String(skinId), "gallery");
  const safeName = safeBaseName(multerFile.originalname || "photo.png");
  const destPath = path.join(libraryDir, `${photoId}-${safeName}`);
  await moveFile(multerFile.path, destPath);
  return {
    id: String(photoId),
    fileName: multerFile.originalname || safeName,
    filePath: destPath,
    mimeType: extMimeFromPath(destPath),
    size: Number(multerFile.size || 0),
    createdAt: nowIso(),
  };
}

async function storeSkinLibraryFile(skinId, multerFile) {
  const libraryDir = path.join(config.dirs.data, "skins-library", String(skinId));
  const safeName = safeBaseName(multerFile.originalname || "skin.zip");
  const destPath = path.join(libraryDir, `skin-${safeName}`);
  await moveFile(multerFile.path, destPath);
  return {
    path: destPath,
    originalName: multerFile.originalname,
    size: multerFile.size,
  };
}

async function storeBeatmapLibraryFile(beatmapId, sourceFile) {
  const libraryDir = path.join(config.dirs.data, "beatmaps-library", String(beatmapId));
  const originalName = sourceFile.originalName || sourceFile.originalname || "beatmap.osz";
  const safeName = safeBaseName(originalName);
  const destPath = path.join(libraryDir, `beatmap-${safeName}`);
  await fs.mkdir(libraryDir, { recursive: true });

  if (sourceFile.path && sourceFile.path !== destPath) {
    await fs.copyFile(sourceFile.path, destPath);
  } else if (sourceFile.buffer) {
    await fs.writeFile(destPath, sourceFile.buffer);
  } else {
    throw new Error("Beatmap source file path is required");
  }

  return {
    path: destPath,
    originalName,
    size: Number(sourceFile.size || 0),
  };
}

async function copyLibraryBeatmapToJob(jobId, libraryBeatmap) {
  if (!libraryBeatmap?.file?.path) return null;
  const jobUploadDir = path.join(config.dirs.uploads, jobId);
  await fs.mkdir(jobUploadDir, { recursive: true });
  const safeName = safeBaseName(libraryBeatmap.file.originalName || `${libraryBeatmap.name || "beatmap"}.osz`);
  const destPath = path.join(jobUploadDir, `beatmap-${safeName}`);
  await fs.copyFile(libraryBeatmap.file.path, destPath);
  return {
    path: destPath,
    originalName: libraryBeatmap.file.originalName,
    size: libraryBeatmap.file.size,
    libraryBeatmapId: libraryBeatmap.id,
    libraryBeatmapName: libraryBeatmap.name || null,
  };
}

async function cacheBeatmapToLibrary(sourceFile, explicitName = "") {
  if (!sourceFile?.path) return { beatmap: null, deduped: false };

  const inspected = await inspectBeatmapFile({
    filePath: sourceFile.path,
    originalName: sourceFile.originalName || sourceFile.originalname || path.basename(sourceFile.path),
    tempRoot: config.dirs.temp,
  });

  if (inspected?.fileHash) {
    const existing = store.findBeatmapByFileHash(inspected.fileHash);
    if (existing) {
      return { beatmap: existing, deduped: true, inspected };
    }
  }

  const beatmapId = createId();
  const storedFile = await storeBeatmapLibraryFile(beatmapId, {
    path: sourceFile.path,
    originalName: sourceFile.originalName || sourceFile.originalname || "beatmap.osz",
    size: sourceFile.size,
  });
  const name = String(explicitName || "").trim().slice(0, 180) || inspected.suggestedName || path.parse(storedFile.originalName).name || "Beatmap";
  const beatmap = store.createBeatmap({
    id: beatmapId,
    name,
    file: storedFile,
    fileHash: inspected.fileHash || null,
    checksums: inspected.checksums || [],
    meta: inspected.meta || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  return { beatmap, deduped: false, inspected };
}

function sendImageFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") res.type("image/png");
  else if (ext === ".jpg" || ext === ".jpeg") res.type("image/jpeg");
  else if (ext === ".webp") res.type("image/webp");
  res.sendFile(filePath);
}

async function cleanupIncoming(files = []) {
  await Promise.all(files.filter(Boolean).map((file) => fs.unlink(file.path).catch(() => undefined)));
}

function detectDownloadFilenameFromHeaders(headers, fallback = "beatmap.osz") {
  const contentDisposition = headers.get("content-disposition") || "";
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // ignore decode errors
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];
  return fallback;
}

function buildAutoBeatmapDownloadUrls(replayInfo) {
  const raw = String(process.env.BEATMAP_AUTODOWNLOAD_URL_TEMPLATES || "").trim();
  if (!raw) return [];

  const tokens = raw
    .split(/\r?\n|;/)
    .map((v) => v.trim())
    .filter(Boolean);

  const vars = {
    beatmapHash: String(replayInfo?.beatmapHash || ""),
    beatmapHashLower: String(replayInfo?.beatmapHash || "").toLowerCase(),
    beatmapHashUpper: String(replayInfo?.beatmapHash || "").toUpperCase(),
    playerName: encodeURIComponent(String(replayInfo?.playerName || "")),
  };

  return tokens.map((tpl) => tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? ""));
}

async function tryAutoDownloadBeatmapForReplay({ jobId, replayInfo, onLog }) {
  if (!boolFromEnv("BEATMAP_AUTODOWNLOAD_ENABLED", false)) {
    return null;
  }
  if (typeof fetch !== "function") {
    onLog?.("Beatmap auto-download skipped: fetch API is unavailable in this Node runtime.");
    return null;
  }
  const beatmapHash = String(replayInfo?.beatmapHash || "").trim();
  if (!beatmapHash) {
    onLog?.("Beatmap auto-download skipped: replay beatmap hash is unavailable.");
    return null;
  }

  const urls = buildAutoBeatmapDownloadUrls(replayInfo).filter((url) => /^https?:\/\//i.test(url));
  if (!urls.length) {
    onLog?.("Beatmap auto-download enabled but BEATMAP_AUTODOWNLOAD_URL_TEMPLATES is empty.");
    return null;
  }

  const timeoutMs = numberFromEnv("BEATMAP_AUTODOWNLOAD_TIMEOUT_MS", 25000, { min: 1000, max: 300000 });
  const maxBytes = numberFromEnv("BEATMAP_AUTODOWNLOAD_MAX_MB", 300, { min: 1, max: 2048 }) * 1024 * 1024;
  const userAgent =
    String(process.env.BEATMAP_AUTODOWNLOAD_USER_AGENT || "").trim() ||
    "ReplayStudioBeatmapFetcher/1.0 (+self-hosted)";

  const tempDir = path.join(config.dirs.temp, String(jobId), "_autodownload");
  await fs.mkdir(tempDir, { recursive: true });

  for (const url of urls) {
    onLog?.(`Beatmap auto-download: trying ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": userAgent },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      onLog?.(`Beatmap auto-download request failed: ${error.message || error}`);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      onLog?.(`Beatmap auto-download HTTP ${res.status} for ${url}`);
      continue;
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      onLog?.(`Beatmap auto-download skipped: file too large (${contentLength} bytes).`);
      continue;
    }

    let arrayBuffer;
    try {
      arrayBuffer = await res.arrayBuffer();
    } catch (error) {
      onLog?.(`Beatmap auto-download read failed: ${error.message || error}`);
      continue;
    }

    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      onLog?.("Beatmap auto-download returned empty response.");
      continue;
    }
    if (buffer.length > maxBytes) {
      onLog?.(`Beatmap auto-download exceeded size limit (${buffer.length} bytes).`);
      continue;
    }

    const filename = detectDownloadFilenameFromHeaders(res.headers, `${beatmapHash}.osz`);
    const ext = extLower(filename) || ".osz";
    const tempPath = path.join(tempDir, `downloaded${ext}`);
    await fs.writeFile(tempPath, buffer);

    try {
      const cached = await cacheBeatmapToLibrary(
        {
          path: tempPath,
          originalName: filename,
          size: buffer.length,
        },
        ""
      );
      if (!cached?.beatmap) {
        onLog?.("Beatmap auto-download produced no cache entry.");
        continue;
      }
      onLog?.(
        cached.deduped
          ? `Beatmap auto-download matched existing library entry: ${cached.beatmap.name || cached.beatmap.id}`
          : `Beatmap auto-downloaded and cached: ${cached.beatmap.name || cached.beatmap.id}`
      );
      return {
        libraryBeatmap: cached.beatmap,
        deduped: Boolean(cached.deduped),
        sourceUrl: url,
      };
    } catch (error) {
      onLog?.(`Beatmap auto-download parse/cache failed: ${error.message || error}`);
      continue;
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }

  onLog?.("Beatmap auto-download failed for all configured mirrors.");
  return null;
}

function getBearerToken(req) {
  const raw = req.headers.authorization || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireAdmin(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Admin token is required" });

  const session = store.getAdminSessionByToken(token);
  if (!session) return res.status(401).json({ error: "Invalid or expired admin session" });

  req.adminToken = token;
  req.adminSession = session;
  req.admin = session.admin;
  next();
}

function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin?.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }
    next();
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeDirSafe(target) {
  await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
}

async function cleanupJobArtifacts(job) {
  if (!job) return;
  const jobId = String(job.id);
  await Promise.all([
    removeDirSafe(path.join(config.dirs.uploads, jobId)),
    removeDirSafe(path.join(config.dirs.output, jobId)),
    removeDirSafe(path.join(config.dirs.temp, jobId)),
    cleanupSkinPreview(jobId, config),
  ]);
}

app.get("/api/meta", (req, res) => {
  const siteSettings = store.getSiteSettings().settings;
  res.json({
    videoQualityOptions: [
      { value: "low", label: "720p / 30fps" },
      { value: "medium", label: "1080p / 60fps" },
      { value: "high", label: "1440p / 60fps" },
      { value: "ultra", label: "4K / 60fps" },
    ],
    defaults: {
      defaultVideoQuality: siteSettings.defaultVideoQuality || "medium",
    },
  });
});

app.get("/api/site-settings", (req, res) => {
  const { settings, updatedAt } = store.getSiteSettings();
  res.json({
    settings: {
      siteTitle: settings.siteTitle,
      siteSubtitle: settings.siteSubtitle,
      heroTitle: settings.heroTitle,
      heroDescription: settings.heroDescription,
      announcementText: settings.announcementText,
      uploadsEnabled: settings.uploadsEnabled,
      defaultVideoQuality: settings.defaultVideoQuality,
    },
    updatedAt,
  });
});

app.post("/api/skins/draft-preview", upload.single("skin"), async (req, res, next) => {
  const skinFile = req.file;
  try {
    if (!skinFile) {
      return res.status(400).json({ error: "Skin file is required (.zip/.osk)" });
    }
    if (!validateExt(skinFile, [".zip", ".osk"])) {
      await cleanupIncoming([skinFile]);
      return res.status(400).json({ error: "Skin file must be a .zip/.osk archive" });
    }

    const draftId = createId();
    const previewKey = `draft-${draftId}`;
    const skinPreview = await extractSkinPreview({ jobId: previewKey, zipPath: skinFile.path, config });
    await cleanupIncoming([skinFile]);

    const cached = {
      id: draftId,
      createdAt: nowIso(),
      preview: skinPreview || null,
    };
    draftSkinPreviewCache.set(draftId, cached);

    if (draftSkinPreviewCache.size > 50) {
      const oldestId = draftSkinPreviewCache.keys().next().value;
      if (oldestId) {
        const removed = draftSkinPreviewCache.get(oldestId);
        draftSkinPreviewCache.delete(oldestId);
        cleanupSkinPreview(`draft-${oldestId}`, config).catch(() => undefined);
        if (removed?.preview?.cacheDir) {
          removeDirSafe(removed.preview.cacheDir).catch(() => undefined);
        }
      }
    }

    const hasPreview = Boolean(skinPreview?.available && skinPreview?.filePath);
    res.json({
      draftId,
      skinPreview: skinPreview
        ? {
            available: Boolean(skinPreview.available),
            assetName: skinPreview.assetName || null,
            extractedAt: skinPreview.extractedAt || null,
            fileCount: skinPreview.fileCount ?? null,
            error: skinPreview.error || null,
            previewUrl: hasPreview ? `/api/skins/draft-preview/${draftId}` : null,
          }
        : null,
    });
  } catch (error) {
    await cleanupIncoming([skinFile].filter(Boolean));
    next(error);
  }
});

app.get("/api/skins/draft-preview/:id", async (req, res) => {
  const cached = draftSkinPreviewCache.get(req.params.id);
  const filePath = cached?.preview?.filePath;
  if (!cached || !cached.preview?.available || !filePath) {
    return res.status(404).json({ error: "Draft skin preview not available" });
  }
  if (!(await fileExists(filePath))) {
    return res.status(404).json({ error: "Draft skin preview file missing on disk" });
  }
  sendImageFile(res, filePath);
});

app.get("/api/skins", (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
  res.json({ skins: store.listSkins(limit).map(serializeSkin) });
});

app.post("/api/skins", upload.single("skin"), async (req, res, next) => {
  const skinFile = req.file;
  try {
    if (!skinFile) {
      return res.status(400).json({ error: "Skin file is required (.zip)" });
    }
    if (!validateExt(skinFile, [".zip", ".osk"])) {
      await cleanupIncoming([skinFile]);
      return res.status(400).json({ error: "Skin file must be a .zip/.osk archive" });
    }

    const skinId = createId();
    const storedFile = await storeSkinLibraryFile(skinId, skinFile);
    const preview = await extractSkinPreview({ jobId: `library-${skinId}`, zipPath: storedFile.path, config });
    const rawName = String(req.body?.name || "").trim();
    const defaultName = path.parse(storedFile.originalName || "Skin").name;
    const name = (rawName || defaultName || "Skin").slice(0, 120);

    const skin = store.createSkin({
      id: skinId,
      name,
      file: storedFile,
      preview,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    res.status(201).json({ skin: serializeSkin(skin) });
  } catch (error) {
    await cleanupIncoming([skinFile].filter(Boolean));
    next(error);
  }
});

app.get("/api/skins/:id", (req, res) => {
  const skin = store.getSkin(req.params.id);
  if (!skin) {
    return res.status(404).json({ error: "Skin not found" });
  }
  res.json({ skin: serializeSkin(skin) });
});

app.get("/api/skins/:id/photos/:photoId", async (req, res) => {
  const skin = store.getSkin(req.params.id);
  if (!skin) {
    return res.status(404).json({ error: "Skin not found" });
  }
  const gallery = normalizeSkinGalleryState(skin.gallery);
  const photo = gallery.photos.find((entry) => entry.id === String(req.params.photoId));
  if (!photo?.filePath) {
    return res.status(404).json({ error: "Skin photo not found" });
  }
  if (!(await fileExists(photo.filePath))) {
    return res.status(404).json({ error: "Skin photo missing on disk" });
  }
  sendImageFile(res, photo.filePath);
});

app.post("/api/skins/:id/photos", requireAdmin, upload.single("photo"), async (req, res, next) => {
  const photoFile = req.file;
  try {
    const skin = store.getSkin(req.params.id);
    if (!skin) {
      await cleanupIncoming([photoFile].filter(Boolean));
      return res.status(404).json({ error: "Skin not found" });
    }
    if (!photoFile) {
      return res.status(400).json({ error: "Photo file is required" });
    }
    if (!validateExt(photoFile, [".png", ".jpg", ".jpeg", ".webp"])) {
      await cleanupIncoming([photoFile]);
      return res.status(400).json({ error: "Photo must be .png, .jpg, .jpeg or .webp" });
    }

    const gallery = normalizeSkinGalleryState(skin.gallery);
    if (gallery.photos.length >= 3) {
      await cleanupIncoming([photoFile]);
      return res.status(400).json({ error: "Skin gallery can contain up to 3 photos" });
    }

    const photoId = createId();
    const photoMeta = await storeSkinGalleryPhotoFile(skin.id, photoId, photoFile);
    gallery.photos.push(photoMeta);
    if (!gallery.primaryPhotoId) gallery.primaryPhotoId = photoMeta.id;

    const updatedSkin = store.createSkin({
      ...skin,
      gallery,
      updatedAt: nowIso(),
    });

    res.status(201).json({ skin: serializeSkin(updatedSkin) });
  } catch (error) {
    await cleanupIncoming([photoFile].filter(Boolean));
    next(error);
  }
});

app.post("/api/skins/:id/photos/:photoId/primary", requireAdmin, (req, res) => {
  const skin = store.getSkin(req.params.id);
  if (!skin) {
    return res.status(404).json({ error: "Skin not found" });
  }
  const gallery = normalizeSkinGalleryState(skin.gallery);
  const photoId = String(req.params.photoId);
  if (!gallery.photos.some((photo) => photo.id === photoId)) {
    return res.status(404).json({ error: "Skin photo not found" });
  }
  gallery.primaryPhotoId = photoId;
  const updatedSkin = store.createSkin({
    ...skin,
    gallery,
    updatedAt: nowIso(),
  });
  res.json({ skin: serializeSkin(updatedSkin) });
});

app.delete("/api/skins/:id/photos/:photoId", requireAdmin, async (req, res, next) => {
  try {
    const skin = store.getSkin(req.params.id);
    if (!skin) {
      return res.status(404).json({ error: "Skin not found" });
    }
    const gallery = normalizeSkinGalleryState(skin.gallery);
    const photoId = String(req.params.photoId);
    const target = gallery.photos.find((photo) => photo.id === photoId);
    if (!target) {
      return res.status(404).json({ error: "Skin photo not found" });
    }
    gallery.photos = gallery.photos.filter((photo) => photo.id !== photoId);
    if (gallery.primaryPhotoId === photoId) {
      gallery.primaryPhotoId = gallery.photos[0]?.id || null;
    }
    await fs.unlink(target.filePath).catch(() => undefined);

    const updatedSkin = store.createSkin({
      ...skin,
      gallery,
      updatedAt: nowIso(),
    });
    res.json({ skin: serializeSkin(updatedSkin) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/skins/:id", requireAdmin, async (req, res, next) => {
  try {
    const skin = store.getSkin(req.params.id);
    if (!skin) {
      return res.status(404).json({ error: "Skin not found" });
    }

    await removeDirSafe(path.join(config.dirs.data, "skins-library", String(skin.id)));
    await cleanupSkinPreview(`library-${skin.id}`, config);
    store.deleteSkin(skin.id);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/skins/:id/preview", async (req, res) => {
  const skin = store.getSkin(req.params.id);
  if (!skin || !skin.preview?.available || !skin.preview?.filePath) {
    return res.status(404).json({ error: "Skin preview not available" });
  }
  if (!(await fileExists(skin.preview.filePath))) {
    return res.status(404).json({ error: "Skin preview file missing on disk" });
  }
  sendImageFile(res, skin.preview.filePath);
});

app.get("/api/skins/:id/download", async (req, res) => {
  const skin = store.getSkin(req.params.id);
  if (!skin || !skin.file?.path) {
    return res.status(404).json({ error: "Skin not found" });
  }
  if (!(await fileExists(skin.file.path))) {
    return res.status(404).json({ error: "Skin file missing on disk" });
  }
  res.download(skin.file.path, skin.file.originalName || `${skin.name || "skin"}.zip`);
});

app.get("/api/beatmaps", (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
  res.json({ beatmaps: store.listBeatmaps(limit).map(serializeBeatmap) });
});

app.post("/api/beatmaps", upload.single("beatmap"), async (req, res, next) => {
  const beatmapFile = req.file;
  try {
    if (!beatmapFile) {
      return res.status(400).json({ error: "Beatmap file is required (.osz/.osu/.zip)" });
    }
    if (!validateExt(beatmapFile, [".osz", ".osu", ".zip"])) {
      await cleanupIncoming([beatmapFile]);
      return res.status(400).json({ error: "Beatmap file must be .osz, .osu or .zip" });
    }

    const result = await cacheBeatmapToLibrary({
      path: beatmapFile.path,
      originalname: beatmapFile.originalname,
      size: beatmapFile.size,
    }, String(req.body?.name || ""));

    await cleanupIncoming([beatmapFile]);
    res.status(result.deduped ? 200 : 201).json({
      beatmap: serializeBeatmap(result.beatmap),
      deduped: Boolean(result.deduped),
    });
  } catch (error) {
    await cleanupIncoming([beatmapFile].filter(Boolean));
    next(error);
  }
});

app.get("/api/beatmaps/:id/download", async (req, res) => {
  const beatmap = store.getBeatmap(req.params.id);
  if (!beatmap || !beatmap.file?.path) {
    return res.status(404).json({ error: "Beatmap not found" });
  }
  if (!(await fileExists(beatmap.file.path))) {
    return res.status(404).json({ error: "Beatmap file missing on disk" });
  }
  res.download(beatmap.file.path, beatmap.file.originalName || `${beatmap.name || "beatmap"}.osz`);
});

app.get("/api/jobs", (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  res.json({ jobs: store.listJobs(limit).map(serializeJob) });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({ job: serializeJob(job) });
});

app.post(
  "/api/jobs",
  upload.fields([
    { name: "replay", maxCount: 1 },
    { name: "skin", maxCount: 1 },
    { name: "beatmap", maxCount: 1 },
  ]),
  async (req, res, next) => {
    const allFiles = [req.files?.replay?.[0], req.files?.skin?.[0], req.files?.beatmap?.[0]].filter(Boolean);

    try {
      const siteSettings = store.getSiteSettings().settings;
      if (siteSettings && siteSettings.uploadsEnabled === false) {
        await cleanupIncoming(allFiles);
        return res.status(403).json({ error: "Uploads are temporarily disabled by administrator" });
      }

      const replayFile = req.files?.replay?.[0];
      const skinFile = req.files?.skin?.[0];
      const beatmapFile = req.files?.beatmap?.[0];
      const librarySkinId = String(req.body?.librarySkinId || "").trim();
      const libraryBeatmapId = String(req.body?.libraryBeatmapId || "").trim();

      if (!replayFile) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Replay file is required (.osr)" });
      }
      if (!validateExt(replayFile, [".osr"])) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Replay file must have .osr extension" });
      }
      if (skinFile && !validateExt(skinFile, [".zip", ".osk"])) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Skin file must be a .zip/.osk archive" });
      }
      if (beatmapFile && !validateExt(beatmapFile, [".osz", ".osu", ".zip"])) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Beatmap file must be .osz, .osu or .zip" });
      }

      const jobId = createId();
      const title = String(req.body?.title || "").trim().slice(0, 120);
      const settings = parseUploadSettings(req.body);
      const jobSetupNotes = [];
      const addSetupNote = (message) => {
        if (message) jobSetupNotes.push(String(message));
      };
      const librarySkin = !skinFile && librarySkinId ? store.getSkin(librarySkinId) : null;
      const selectedLibraryBeatmap = !beatmapFile && libraryBeatmapId ? store.getBeatmap(libraryBeatmapId) : null;

      if (!skinFile && librarySkinId && !librarySkin) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Selected library skin not found" });
      }
      if (!beatmapFile && libraryBeatmapId && !selectedLibraryBeatmap) {
        await cleanupIncoming(allFiles);
        return res.status(400).json({ error: "Selected library beatmap not found" });
      }

      const replay = await promoteUploadedFile(jobId, "replay", replayFile);
      const skin = skinFile
        ? await promoteUploadedFile(jobId, "skin", skinFile)
        : await copyLibrarySkinToJob(jobId, librarySkin);

      let replayInfo = null;
      try {
        replayInfo = await parseOsrSummary(replay.path);
      } catch (error) {
        replayInfo = null;
      }

      let libraryBeatmap = selectedLibraryBeatmap;
      let autoMatchedLibraryBeatmap = false;
      if (!beatmapFile && !libraryBeatmap && replayInfo?.beatmapHash) {
        libraryBeatmap = store.findBeatmapByChecksum(replayInfo.beatmapHash);
        autoMatchedLibraryBeatmap = Boolean(libraryBeatmap);
      }

      let autoDownloadedBeatmap = null;
      if (!beatmapFile && !libraryBeatmap) {
        autoDownloadedBeatmap = await tryAutoDownloadBeatmapForReplay({
          jobId,
          replayInfo,
          onLog: addSetupNote,
        });
        if (autoDownloadedBeatmap?.libraryBeatmap) {
          libraryBeatmap = autoDownloadedBeatmap.libraryBeatmap;
        }
      }

      const beatmap = beatmapFile
        ? await promoteUploadedFile(jobId, "beatmap", beatmapFile)
        : await copyLibraryBeatmapToJob(jobId, libraryBeatmap);

      let cachedUploadedBeatmap = null;
      let cachedUploadedBeatmapDeduped = false;
      if (beatmapFile && beatmap?.path) {
        try {
          const cached = await cacheBeatmapToLibrary(
            {
              path: beatmap.path,
              originalName: beatmap.originalName,
              size: beatmap.size,
            },
            ""
          );
          cachedUploadedBeatmap = cached.beatmap || null;
          cachedUploadedBeatmapDeduped = Boolean(cached.deduped);
          if (cachedUploadedBeatmap) {
            beatmap.libraryBeatmapId = cachedUploadedBeatmap.id;
            beatmap.libraryBeatmapName = cachedUploadedBeatmap.name || null;
          }
        } catch (error) {
          // Do not fail the render job if library caching fails.
          addSetupNote(`Beatmap library cache failed: ${error.message || error}`);
          cachedUploadedBeatmap = null;
          cachedUploadedBeatmapDeduped = false;
        }
      }

      let skinPreview = null;
      if (skin?.path) {
        if (!skinFile && librarySkin?.preview) {
          skinPreview = cloneSkinPreview(librarySkin.preview);
        } else {
          skinPreview = await extractSkinPreview({ jobId, zipPath: skin.path, config });
        }
      }

      const createdAt = nowIso();
      const logs = [
        { at: createdAt, message: "Job created" },
        { at: nowIso(), message: `Renderer mode: ${config.rendererMode}` },
        {
          at: nowIso(),
          message: `Settings: quality=${settings.videoQuality}, music=${settings.musicVolume}%, hitsounds=${settings.hitsoundVolume}%`,
        },
      ];

      if (replayInfo) {
        logs.push({
          at: nowIso(),
          message: `Replay parsed: ${replayInfo.playerName || "unknown player"} | ${replayInfo.modeName} | mods=${(replayInfo.mods || []).join("") || "NM"}`,
        });
      } else {
        logs.push({ at: nowIso(), message: "Replay summary parser: metadata unavailable for this file" });
      }

      if (skinPreview?.available) {
        logs.push({ at: nowIso(), message: `Skin preview extracted (${skinPreview.assetName || "image"})` });
      } else if (skinPreview?.error) {
        logs.push({ at: nowIso(), message: `Skin preview extraction failed: ${skinPreview.error}` });
      }

      if (!skinFile && librarySkin) {
        logs.push({
          at: nowIso(),
          message: `Using library skin: ${librarySkin.name || librarySkin.file?.originalName || librarySkin.id}`,
        });
      }

      if (!beatmapFile && libraryBeatmap) {
        logs.push({
          at: nowIso(),
          message: autoMatchedLibraryBeatmap
            ? `Beatmap auto-matched from library by replay hash: ${libraryBeatmap.name || libraryBeatmap.file?.originalName || libraryBeatmap.id}`
            : autoDownloadedBeatmap?.libraryBeatmap
              ? `Using auto-downloaded beatmap from library cache: ${libraryBeatmap.name || libraryBeatmap.file?.originalName || libraryBeatmap.id}`
              : `Using library beatmap: ${libraryBeatmap.name || libraryBeatmap.file?.originalName || libraryBeatmap.id}`,
        });
      }

      if (cachedUploadedBeatmap) {
        logs.push({
          at: nowIso(),
          message: cachedUploadedBeatmapDeduped
            ? `Uploaded beatmap matched existing library entry: ${cachedUploadedBeatmap.name || cachedUploadedBeatmap.id}`
            : `Beatmap saved to library: ${cachedUploadedBeatmap.name || cachedUploadedBeatmap.id}`,
        });
      }

      if (!beatmap) {
        const hasLocalSongsFallback = Boolean(process.env.DANSER_OSU_SONGS_DIR?.trim());
        logs.push({
          at: nowIso(),
          message:
            hasLocalSongsFallback
              ? "No beatmap uploaded or matched. danser will try local osu! Songs via DANSER_OSU_SONGS_DIR."
              : boolFromEnv("BEATMAP_AUTODOWNLOAD_ENABLED", false)
                ? "No beatmap uploaded or matched. Auto-download mirrors failed or are unavailable. Upload .osz/.osu or set DANSER_OSU_SONGS_DIR."
                : "No beatmap uploaded. Upload .osz/.osu or set DANSER_OSU_SONGS_DIR to your local osu! Songs folder.",
        });
      }

      for (const note of jobSetupNotes) {
        logs.push({ at: nowIso(), message: note });
      }

      const job = {
        id: jobId,
        title,
        status: "queued",
        progress: 0,
        error: null,
        createdAt,
        updatedAt: createdAt,
        logs,
        files: { replay, skin, beatmap },
        settings,
        replayInfo,
        skinPreview,
      };

      store.createJob(job);
      queue.enqueue(jobId);

      res.status(202).json({ job: serializeJob(job) });
    } catch (error) {
      await cleanupIncoming(allFiles);
      next(error);
    }
  }
);

app.get("/api/jobs/:id/download", async (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.status !== "completed" || !job.result?.filePath) {
    return res.status(404).json({ error: "Result not found" });
  }

  if (!(await fileExists(job.result.filePath))) {
    return res.status(404).json({ error: "Result file missing on disk" });
  }

  res.download(job.result.filePath, job.result.fileName);
});

app.get("/api/jobs/:id/preview", async (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.status !== "completed" || job.result?.type !== "video") {
    return res.status(404).json({ error: "Video preview not available" });
  }

  if (!(await fileExists(job.result.filePath))) {
    return res.status(404).json({ error: "Result file missing on disk" });
  }

  res.type(job.result.contentType || "video/mp4");
  res.sendFile(job.result.filePath);
});

app.get("/api/jobs/:id/skin-preview", async (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || !job.skinPreview?.available || !job.skinPreview?.filePath) {
    return res.status(404).json({ error: "Skin preview not available" });
  }

  if (!(await fileExists(job.skinPreview.filePath))) {
    return res.status(404).json({ error: "Skin preview file missing on disk" });
  }
  sendImageFile(res, job.skinPreview.filePath);
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const admin = store.verifyAdminCredentials(username, password);
  if (!admin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const session = store.createAdminSession(admin.id, {
    userAgent: req.headers["user-agent"] || null,
  });

  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    admin,
  });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin, session: { expiresAt: req.adminSession.expiresAt } });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  store.revokeAdminSession(req.adminToken);
  res.json({ ok: true });
});

app.get("/api/admin/jobs", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 120));
  res.json({ jobs: store.listJobs(limit).map((job) => serializeJob(job, { includeLogs: true })) });
});

app.get("/api/admin/jobs/:id", requireAdmin, (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({ job: serializeJob(job, { includeLogs: true }) });
});

app.get("/api/admin/admins", requireSuperAdmin, (req, res) => {
  res.json({ admins: store.listAdmins() });
});

app.get("/api/admin/site-settings", requireSuperAdmin, (req, res) => {
  const settingsPayload = store.getSiteSettings();
  res.json(settingsPayload);
});

app.put("/api/admin/site-settings", requireSuperAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.siteTitle !== undefined) patch.siteTitle = body.siteTitle;
    if (body.siteSubtitle !== undefined) patch.siteSubtitle = body.siteSubtitle;
    if (body.heroTitle !== undefined) patch.heroTitle = body.heroTitle;
    if (body.heroDescription !== undefined) patch.heroDescription = body.heroDescription;
    if (body.announcementText !== undefined) patch.announcementText = body.announcementText;
    if (body.defaultVideoQuality !== undefined) patch.defaultVideoQuality = body.defaultVideoQuality;
    if (body.uploadsEnabled !== undefined) patch.uploadsEnabled = Boolean(body.uploadsEnabled);

    const updated = store.updateSiteSettings(patch, req.admin.id);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/admin/admins", requireSuperAdmin, (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "admin").trim().toLowerCase() === "super_admin" ? "super_admin" : "admin";
    const created = store.createAdmin({
      username,
      password,
      role,
      createdByAdminId: req.admin.id,
    });
    res.status(201).json({ admin: created });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/admin/admins/:id", requireSuperAdmin, (req, res) => {
  try {
    const removed = store.deleteAdmin(req.params.id, req.admin.id);
    if (!removed) return res.status(404).json({ error: "Admin not found" });
    res.json({ ok: true, admin: removed });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/admin/jobs/:id", requireAdmin, async (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const forceDelete = parseBoolean(req.query.force);
  if (job.status === "processing" && forceDelete !== true) {
    return res.status(409).json({
      error: "Job is processing. Retry with ?force=true to remove anyway (may leave partial render output).",
    });
  }

  store.deleteJob(job.id);
  await cleanupJobArtifacts(job);
  res.json({ ok: true, removedJobId: job.id });
});

app.use(express.static(path.join(config.ROOT, "public")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-login.html"));
});

app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-login.html"));
});

app.get("/admin/panel", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-panel.html"));
});

app.get("/admin/replays", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-replays.html"));
});

app.get("/admin/admins", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-admins.html"));
});

app.get("/admin/settings", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "admin-settings.html"));
});

app.get("/library", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "library.html"));
});

app.get("/skins", (req, res) => {
  const tab = String(req.query.tab || "skins").toLowerCase() === "beatmaps" ? "beatmaps" : "skins";
  res.redirect(302, `/library?tab=${tab}`);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(config.ROOT, "public", "index.html"));
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `File too large. Limit: ${config.maxFileSizeMb}MB` });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`osu replay render site running at http://localhost:${config.port}`);
  console.log(`Renderer mode: ${config.rendererMode}`);
});
