const fs = require("node:fs/promises");

const MOD_FLAGS = [
  [0, "NF"],
  [1, "EZ"],
  [3, "HD"],
  [4, "HR"],
  [5, "SD"],
  [6, "DT"],
  [7, "RX"],
  [8, "HT"],
  [9, "NC"],
  [10, "FL"],
  [11, "AT"],
  [12, "SO"],
  [13, "AP"],
  [14, "PF"],
  [15, "4K"],
  [16, "5K"],
  [17, "6K"],
  [18, "7K"],
  [19, "8K"],
  [20, "FI"],
  [21, "RN"],
  [22, "CN"],
  [23, "TP"],
  [24, "9K"],
  [25, "CP"],
  [26, "1K"],
  [27, "3K"],
  [28, "2K"],
  [29, "SV2"],
  [30, "MR"],
];

const MODE_NAMES = {
  0: "osu!standard",
  1: "osu!taiko",
  2: "osu!catch",
  3: "osu!mania",
};

class OsrReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  ensure(length) {
    if (this.offset + length > this.buffer.length) {
      throw new Error("Unexpected end of .osr file");
    }
  }

  byte() {
    this.ensure(1);
    const v = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  int16() {
    this.ensure(2);
    const v = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  int32() {
    this.ensure(4);
    const v = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  uint32() {
    this.ensure(4);
    const v = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  int64() {
    this.ensure(8);
    const v = this.buffer.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  bytes(length) {
    this.ensure(length);
    const v = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return v;
  }

  uleb128() {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = this.byte();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
    throw new Error("Invalid ULEB128 length in .osr string");
  }

  string() {
    const marker = this.byte();
    if (marker === 0x00) return "";
    if (marker !== 0x0b) {
      throw new Error("Invalid string marker in .osr file");
    }
    const length = this.uleb128();
    const bytes = this.bytes(length);
    return bytes.toString("utf8");
  }
}

function toIsoFromOsuTicks(ticks) {
  if (typeof ticks !== "bigint") return null;
  if (ticks <= 0n) return null;
  const unixEpochTicks = 621355968000000000n;
  const ms = Number((ticks - unixEpochTicks) / 10000n);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function modsFromBitmask(mask) {
  const mods = [];
  for (const [bit, label] of MOD_FLAGS) {
    if (mask & (1 << bit)) mods.push(label);
  }
  if (mods.includes("NC") && mods.includes("DT")) {
    return mods.filter((m) => m !== "DT");
  }
  if (mods.includes("PF") && mods.includes("SD")) {
    return mods.filter((m) => m !== "SD");
  }
  return mods;
}

function calcAccuracy(mode, counts) {
  const c300 = counts.count300 || 0;
  const c100 = counts.count100 || 0;
  const c50 = counts.count50 || 0;
  const miss = counts.countMiss || 0;
  const geki = counts.countGeki || 0;
  const katu = counts.countKatu || 0;

  if (mode === 0) {
    const total = c300 + c100 + c50 + miss;
    if (!total) return null;
    return ((c50 * 50 + c100 * 100 + c300 * 300) / (total * 300)) * 100;
  }

  if (mode === 1) {
    const total = c300 + c100 + miss;
    if (!total) return null;
    return ((c100 * 150 + c300 * 300) / (total * 300)) * 100;
  }

  if (mode === 2) {
    const total = c300 + c100 + c50 + katu + miss;
    if (!total) return null;
    return ((c300 + c100 + c50) / total) * 100;
  }

  if (mode === 3) {
    const total = c300 + c100 + c50 + geki + katu + miss;
    if (!total) return null;
    return ((c50 * 50 + c100 * 100 + katu * 200 + (c300 + geki) * 300) / (total * 300)) * 100;
  }

  return null;
}

function parseOsrBaseBuffer(buffer, options = {}) {
  const { includeReplayData = false } = options;
  const r = new OsrReader(buffer);

  const mode = r.byte();
  const version = r.int32();
  const beatmapHash = r.string();
  const playerName = r.string();
  const replayHash = r.string();

  const count300 = r.int16();
  const count100 = r.int16();
  const count50 = r.int16();
  const countGeki = r.int16();
  const countKatu = r.int16();
  const countMiss = r.int16();
  const score = r.int32();
  const maxCombo = r.int16();
  const perfect = r.byte() === 1;
  const modsBitmask = r.uint32();
  const lifeBarGraph = r.string();
  const timestampTicks = r.int64();
  const replayDataLength = r.int32();

  const replayDataCompressed = replayDataLength > 0 ? Buffer.from(r.bytes(replayDataLength)) : Buffer.alloc(0);

  let onlineScoreId = null;
  if (r.offset + 8 <= buffer.length) {
    onlineScoreId = r.int64().toString();
  }

  const counts = {
    count300,
    count100,
    count50,
    countGeki,
    countKatu,
    countMiss,
  };

  const accuracy = calcAccuracy(mode, counts);
  const mods = modsFromBitmask(modsBitmask);

  const summary = {
    mode,
    modeName: MODE_NAMES[mode] || `mode-${mode}`,
    version,
    playerName,
    beatmapHash,
    replayHash,
    score,
    maxCombo,
    perfect,
    modsBitmask,
    mods,
    counts,
    accuracy: accuracy == null ? null : Number(accuracy.toFixed(2)),
    playedAt: toIsoFromOsuTicks(timestampTicks),
    lifeBarPreview: typeof lifeBarGraph === "string" ? lifeBarGraph.slice(0, 120) : "",
    onlineScoreId,
  };

  if (includeReplayData) {
    summary.replayDataCompressed = replayDataCompressed;
    summary.replayDataLength = replayDataLength;
  }

  return summary;
}

function parseOsrSummaryBuffer(buffer) {
  return parseOsrBaseBuffer(buffer, { includeReplayData: false });
}

function parseOsrReplayPayloadBuffer(buffer) {
  return parseOsrBaseBuffer(buffer, { includeReplayData: true });
}

async function parseOsrSummary(filePath) {
  const buffer = await fs.readFile(filePath);
  return parseOsrSummaryBuffer(buffer);
}

async function parseOsrReplayPayload(filePath) {
  const buffer = await fs.readFile(filePath);
  return parseOsrReplayPayloadBuffer(buffer);
}

module.exports = {
  parseOsrSummary,
  parseOsrSummaryBuffer,
  parseOsrReplayPayload,
  parseOsrReplayPayloadBuffer,
};
