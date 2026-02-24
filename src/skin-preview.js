const fs = require("node:fs/promises");
const path = require("node:path");
const extract = require("extract-zip");

const PREFERRED_NAMES = [
  "menu-background.png",
  "menu-background.jpg",
  "scorebar-bg.png",
  "scorebar-bg@2x.png",
  "hitcircle.png",
  "cursor.png",
  "default-0.png",
];

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function rmSafe(target) {
  await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
}

async function walkFiles(dir, limit = 2000) {
  const out = [];
  const stack = [dir];

  while (stack.length && out.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }

  return out;
}

function pickPreviewAsset(files) {
  if (!files.length) return null;

  const images = files.filter((file) => IMAGE_EXTS.has(path.extname(file).toLowerCase()));
  if (!images.length) return null;

  const byBaseName = new Map(images.map((file) => [path.basename(file).toLowerCase(), file]));
  for (const preferred of PREFERRED_NAMES) {
    const hit = byBaseName.get(preferred);
    if (hit) return hit;
  }

  images.sort((a, b) => a.length - b.length);
  return images[0];
}

async function extractSkinPreview({ jobId, zipPath, config }) {
  if (!zipPath) return null;

  const cacheRoot = path.join(config.dirs.data, "skin-previews", String(jobId));
  await rmSafe(cacheRoot);
  await fs.mkdir(cacheRoot, { recursive: true });

  try {
    await extract(zipPath, { dir: cacheRoot });
  } catch (error) {
    await rmSafe(cacheRoot);
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      extractedAt: new Date().toISOString(),
    };
  }

  const files = await walkFiles(cacheRoot);
  const selected = pickPreviewAsset(files);
  if (!selected) {
    return {
      available: false,
      extractedAt: new Date().toISOString(),
      fileCount: files.length,
    };
  }

  const relativePath = path.relative(cacheRoot, selected).replace(/\\/g, "/");
  return {
    available: true,
    extractedAt: new Date().toISOString(),
    fileCount: files.length,
    assetName: path.basename(selected),
    relativePath,
    cacheDir: cacheRoot,
    filePath: selected,
  };
}

async function cleanupSkinPreview(jobId, config) {
  const cacheRoot = path.join(config.dirs.data, "skin-previews", String(jobId));
  await rmSafe(cacheRoot);
}

module.exports = {
  extractSkinPreview,
  cleanupSkinPreview,
};