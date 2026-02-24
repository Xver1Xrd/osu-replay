const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const extract = require("extract-zip");
const { createId } = require("./utils");

function hashBuffer(buffer, algo) {
  return crypto.createHash(algo).update(buffer).digest("hex");
}

async function hashFile(filePath, algo) {
  const buffer = await fs.readFile(filePath);
  return hashBuffer(buffer, algo);
}

async function walkFiles(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out;
}

function parseOsuMetadata(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "mi"));
    return m ? m[1].trim() : "";
  };

  const title = get("TitleUnicode") || get("Title");
  const artist = get("ArtistUnicode") || get("Artist");
  const version = get("Version");
  const creator = get("Creator");
  const beatmapSetIdRaw = get("BeatmapSetID");
  const beatmapIdRaw = get("BeatmapID");

  const beatmapSetId = Number.parseInt(beatmapSetIdRaw, 10);
  const beatmapId = Number.parseInt(beatmapIdRaw, 10);

  return {
    title: title || null,
    artist: artist || null,
    version: version || null,
    creator: creator || null,
    beatmapSetId: Number.isFinite(beatmapSetId) && beatmapSetId > 0 ? beatmapSetId : null,
    beatmapId: Number.isFinite(beatmapId) && beatmapId > 0 ? beatmapId : null,
  };
}

async function inspectOsuFile(filePath) {
  const buffer = await fs.readFile(filePath);
  const text = buffer.toString("utf8");
  const meta = parseOsuMetadata(text);
  return {
    checksumMd5: hashBuffer(buffer, "md5"),
    relativePath: path.basename(filePath),
    ...meta,
  };
}

function chooseDisplayName({ originalName, entries }) {
  const list = Array.isArray(entries) ? entries : [];
  const first = list.find((item) => item && (item.artist || item.title || item.version)) || null;
  if (first) {
    const core = [first.artist, first.title].filter(Boolean).join(" - ") || first.title || "Beatmap";
    if (list.length <= 1) {
      return [core, first.version ? `[${first.version}]` : ""].filter(Boolean).join(" ").trim();
    }
    return `${core} (${list.length} diffs)`;
  }
  return path.parse(String(originalName || "Beatmap")).name || "Beatmap";
}

async function inspectBeatmapFile({ filePath, originalName, tempRoot }) {
  const ext = path.extname(originalName || filePath || "").toLowerCase();
  const fileHash = await hashFile(filePath, "sha256");
  const inspectDir = path.join(tempRoot, "_beatmap-inspect", createId());

  let osuEntries = [];
  try {
    if (ext === ".osu") {
      const info = await inspectOsuFile(filePath);
      info.relativePath = path.basename(originalName || filePath);
      osuEntries = [info];
    } else if (ext === ".osz" || ext === ".zip") {
      await fs.mkdir(inspectDir, { recursive: true });
      await extract(filePath, { dir: inspectDir });
      const allFiles = await walkFiles(inspectDir);
      const osuFiles = allFiles.filter((f) => path.extname(f).toLowerCase() === ".osu");
      for (const osuPath of osuFiles) {
        const info = await inspectOsuFile(osuPath);
        info.relativePath = path.relative(inspectDir, osuPath);
        osuEntries.push(info);
      }
    } else {
      throw new Error("Unsupported beatmap format");
    }
  } finally {
    await fs.rm(inspectDir, { recursive: true, force: true }).catch(() => undefined);
  }

  const checksums = Array.from(new Set(osuEntries.map((entry) => entry.checksumMd5).filter(Boolean)));
  const beatmapSetId = osuEntries.find((entry) => entry.beatmapSetId)?.beatmapSetId || null;
  const names = osuEntries.map((entry) => entry.version).filter(Boolean);
  const title = osuEntries.find((entry) => entry.title)?.title || null;
  const artist = osuEntries.find((entry) => entry.artist)?.artist || null;
  const creator = osuEntries.find((entry) => entry.creator)?.creator || null;

  return {
    fileHash,
    checksums,
    meta: {
      sourceExt: ext || null,
      osuFileCount: osuEntries.length,
      beatmapSetId,
      title,
      artist,
      creator,
      difficulties: names.slice(0, 200),
      entries: osuEntries.slice(0, 200),
    },
    suggestedName: chooseDisplayName({ originalName, entries: osuEntries }),
  };
}

module.exports = {
  inspectBeatmapFile,
};
