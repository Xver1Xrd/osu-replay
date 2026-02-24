const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { parseOsrReplayPayload } = require("./osr-parser");

const PYTHON_DECOMPRESS_SCRIPT = [
  "import sys, lzma",
  "with open(sys.argv[1], 'rb') as f:",
  "    data = f.read()",
  "decoded = lzma.decompress(data)",
  "sys.stdout.buffer.write(decoded)",
].join("\n");

const KEY_BIT_LABELS = [
  [1, "M1", "00F5FF"],
  [2, "M2", "FF8A00"],
  [4, "K1", "6BFF7A"],
  [8, "K2", "FF4DB8"],
];

function captureProcess(command, args, { cwd, onLine, allowNonZero = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = [];
    let stderr = [];
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushLines = (chunk, type) => {
      const text = chunk.toString();
      if (type === "stdout") {
        stdout.push(chunk);
        stdoutBuffer += text;
      } else {
        stderr.push(chunk);
        stderrBuffer += text;
      }

      const combined = type === "stdout" ? stdoutBuffer : stderrBuffer;
      const lines = combined.split(/\r?\n/);
      const rest = lines.pop() || "";
      for (const line of lines) {
        if (line.trim() && typeof onLine === "function") {
          onLine(`${type}> ${line}`);
        }
      }

      if (type === "stdout") stdoutBuffer = rest;
      else stderrBuffer = rest;
    };

    child.stdout.on("data", (chunk) => flushLines(chunk, "stdout"));
    child.stderr.on("data", (chunk) => flushLines(chunk, "stderr"));

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (stdoutBuffer.trim() && typeof onLine === "function") onLine(`stdout> ${stdoutBuffer.trim()}`);
      if (stderrBuffer.trim() && typeof onLine === "function") onLine(`stderr> ${stderrBuffer.trim()}`);

      const result = {
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };

      if (code === 0 || allowNonZero) {
        resolve(result);
      } else {
        const stderrText = result.stderr.trim();
        reject(new Error(`${command} exited with code ${code}${stderrText ? `: ${stderrText}` : ""}`));
      }
    });
  });
}

async function pickPythonCommand() {
  const candidates = [
    { command: "python", argsPrefix: [] },
    { command: "py", argsPrefix: ["-3"] },
  ];

  for (const candidate of candidates) {
    try {
      await captureProcess(candidate.command, [...candidate.argsPrefix, "--version"], { allowNonZero: false });
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  throw new Error("Python 3 is required for native replay rendering (used for LZMA decode of .osr replay data)");
}

async function ensureFfmpegAvailable() {
  try {
    await captureProcess("ffmpeg", ["-version"], { allowNonZero: false });
  } catch {
    throw new Error("ffmpeg is required for native replay rendering but was not found in PATH");
  }
}

async function decodeReplayDataText(compressedBuffer, workDir, onLog) {
  if (!Buffer.isBuffer(compressedBuffer) || compressedBuffer.length === 0) {
    throw new Error("Replay contains empty compressed input stream");
  }

  const python = await pickPythonCommand();
  const compressedPath = path.join(workDir, "replay-data.lzma");
  await fs.writeFile(compressedPath, compressedBuffer);

  onLog(`Native renderer: decoding replay data via ${python.command}`);

  const result = await captureProcess(
    python.command,
    [...python.argsPrefix, "-c", PYTHON_DECOMPRESS_SCRIPT, compressedPath],
    {
      cwd: process.cwd(),
    }
  );

  if (!result.stdout) {
    throw new Error("Failed to decode replay data: decompressed stream is empty");
  }

  return result.stdout;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function msToAssTime(ms) {
  const totalCs = Math.max(0, Math.round((Number(ms) || 0) / 10));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  return `${hours}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function sanitizeAssText(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, " ");
}

function formatAssEvent({ layer = 0, startMs, endMs, style, text }) {
  return `Dialogue: ${layer},${msToAssTime(startMs)},${msToAssTime(endMs)},${style},,0,0,0,,${text}`;
}

function parseReplayTextFrames(text) {
  const rawParts = String(text || "").split(",");
  const frames = [];
  let currentTime = 0;

  for (const rawPart of rawParts) {
    const part = rawPart.trim();
    if (!part) continue;

    const [deltaRaw, xRaw, yRaw, keysRaw] = part.split("|");
    const delta = Number(deltaRaw);
    const x = Number(xRaw);
    const y = Number(yRaw);
    const keys = Number(keysRaw ?? 0);

    if (!Number.isFinite(delta) || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    // Special metadata/rng seed entries (commonly -12345|0|0|0) are not timeline frames.
    if (delta < 0) {
      continue;
    }

    currentTime += delta;
    frames.push({
      t: currentTime,
      x,
      y,
      keys: Number.isFinite(keys) ? keys : 0,
    });
  }

  if (!frames.length) {
    throw new Error("Replay timeline has no cursor frames after decoding");
  }

  const firstTime = frames[0].t;
  if (firstTime > 0) {
    for (const frame of frames) {
      frame.t -= firstTime;
    }
  }

  return frames;
}

function resampleFrames(frames, fps) {
  const safeFps = Math.max(10, Math.min(240, Number(fps) || 60));
  const step = 1000 / safeFps;
  const result = [];
  const endTime = Math.max(0, frames[frames.length - 1]?.t || 0);
  let i = 0;

  for (let t = 0; t <= endTime; t += step) {
    while (i + 1 < frames.length && frames[i + 1].t <= t) {
      i += 1;
    }

    const a = frames[i];
    const b = frames[Math.min(i + 1, frames.length - 1)];
    let x = a.x;
    let y = a.y;
    let keys = a.keys;

    if (b && b.t > a.t && t > a.t) {
      const ratio = (t - a.t) / (b.t - a.t);
      x = a.x + (b.x - a.x) * ratio;
      y = a.y + (b.y - a.y) * ratio;
      keys = ratio >= 0.5 ? b.keys : a.keys;
    }

    result.push({
      t: Math.round(t),
      x,
      y,
      keys,
    });
  }

  const last = frames[frames.length - 1];
  if (!result.length || result[result.length - 1].t < last.t) {
    result.push({ t: last.t, x: last.x, y: last.y, keys: last.keys });
  }

  return result;
}

function mapPlayfield(width, height) {
  const playfieldW = 512;
  const playfieldH = 384;
  const scale = Math.min(width / playfieldW, height / playfieldH);
  const w = Math.round(playfieldW * scale);
  const h = Math.round(playfieldH * scale);
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);

  return {
    x,
    y,
    w,
    h,
    map(xOsu, yOsu) {
      return {
        x: Math.round(x + (clamp(xOsu, 0, playfieldW) / playfieldW) * w),
        y: Math.round(y + (clamp(yOsu, 0, playfieldH) / playfieldH) * h),
      };
    },
  };
}

function buildPulseEvents(frames, mapper) {
  const pulses = [];
  let prevKeys = 0;

  for (const frame of frames) {
    const pressedMask = (frame.keys | 0) & ~prevKeys;
    if (pressedMask) {
      const pos = mapper.map(frame.x, frame.y);
      for (const [bit, label, colorHex] of KEY_BIT_LABELS) {
        if ((pressedMask & bit) !== 0) {
          pulses.push({
            t: frame.t,
            x: pos.x,
            y: pos.y,
            label,
            colorHex,
          });
        }
      }
    }
    prevKeys = frame.keys | 0;
  }

  return pulses;
}

function buildAssScript({ width, height, durationMs, samples, rawFrames, hudLines }) {
  const mapper = mapPlayfield(width, height);
  const events = [];

  const endTime = Math.max(1500, Math.ceil(durationMs));
  const videoEndAss = msToAssTime(endTime);

  if (Array.isArray(hudLines) && hudLines.length) {
    let lineIndex = 0;
    for (const line of hudLines.slice(0, 3)) {
      if (!line) continue;
      events.push(
        formatAssEvent({
          layer: 10,
          startMs: 0,
          endMs: endTime,
          style: "Hud",
          text: `{\\an7\\pos(24,${28 + lineIndex * 28})}${sanitizeAssText(line)}`,
        })
      );
      lineIndex += 1;
    }
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (!a || !b) continue;

    const startMs = Math.max(0, a.t);
    const endMs = Math.max(startMs + 1, b.t);
    const p1 = mapper.map(a.x, a.y);
    const p2 = mapper.map(b.x, b.y);

    const moving = p1.x !== p2.x || p1.y !== p2.y;
    const cursorText = moving
      ? `{\\an5\\move(${p1.x},${p1.y},${p2.x},${p2.y})}@`
      : `{\\an5\\pos(${p1.x},${p1.y})}@`;

    events.push(
      formatAssEvent({
        layer: 2,
        startMs,
        endMs,
        style: "Cursor",
        text: cursorText,
      })
    );
  }

  const pulses = buildPulseEvents(rawFrames, mapper);
  for (const pulse of pulses) {
    const startMs = pulse.t;
    const endMs = startMs + 140;
    events.push(
      formatAssEvent({
        layer: 3,
        startMs,
        endMs,
        style: "Pulse",
        text: `{\\an5\\pos(${pulse.x},${pulse.y})\\1c&H${pulse.colorHex}&\\fad(0,120)}*`,
      })
    );
    events.push(
      formatAssEvent({
        layer: 4,
        startMs,
        endMs: startMs + 240,
        style: "KeyLabel",
        text: `{\\an5\\pos(${pulse.x},${pulse.y - 24})\\1c&H${pulse.colorHex}&\\fad(0,160)}${pulse.label}`,
      })
    );
  }

  const ass = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 2",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Cursor,Arial,34,&H00FFFFFF,&H000000FF,&H00303030,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,20,20,20,1",
    "Style: Pulse,Arial,62,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,20,20,20,1",
    "Style: KeyLabel,Consolas,20,&H00FFFFFF,&H000000FF,&H001A1A1A,&H00000000,-1,0,0,0,100,100,0,0,1,1,0,5,20,20,20,1",
    "Style: Hud,Consolas,18,&H00F4F7FF,&H000000FF,&H00303030,&H00000000,0,0,0,0,100,100,0,0,1,1,0,7,18,18,18,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    `Comment: 0,0:00:00.00,${videoEndAss},Hud,,0,0,0,,generated-by=native-replay-renderer`,
    "",
  ].join("\n");

  return { ass, playfield: mapper };
}

function escapeFfmpegFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function qualityEncodeOptions(qualityKey) {
  switch (String(qualityKey || "").toLowerCase()) {
    case "low":
      return { crf: "25", preset: "veryfast" };
    case "high":
      return { crf: "20", preset: "medium" };
    case "ultra":
      return { crf: "18", preset: "medium" };
    case "medium":
    default:
      return { crf: "22", preset: "fast" };
  }
}

async function runNativeReplayRenderer(runtime, hooks, preset) {
  const { onLog, onProgress } = hooks;

  if (!runtime?.files?.replayPath) {
    throw new Error("Replay file is missing");
  }

  await ensureFfmpegAvailable();
  onProgress(0.15);

  const replayPayload = await parseOsrReplayPayload(runtime.files.replayPath);
  onLog(`Native renderer: parsed replay payload (${replayPayload.modeName}, ${replayPayload.playerName || "unknown"})`);
  onProgress(0.25);

  const decodedReplayText = await decodeReplayDataText(
    replayPayload.replayDataCompressed,
    runtime.paths.workDir,
    onLog
  );

  const rawFrames = parseReplayTextFrames(decodedReplayText);
  if (rawFrames.length < 2) {
    throw new Error("Replay has too few frames to render video");
  }
  onLog(`Native renderer: decoded ${rawFrames.length} timeline frames`);
  onProgress(0.4);

  const samples = resampleFrames(rawFrames, preset.fps);
  const lastSampleTime = samples[samples.length - 1]?.t || rawFrames[rawFrames.length - 1]?.t || 0;
  const durationMs = Math.max(3000, lastSampleTime + 900);

  const hudLines = [
    `${runtime.job?.title ? `${runtime.job.title} | ` : ""}${replayPayload.playerName || "Unknown player"}`,
    `${replayPayload.modeName} | ${Array.isArray(replayPayload.mods) && replayPayload.mods.length ? replayPayload.mods.join("") : "NM"} | ${replayPayload.accuracy != null ? `${replayPayload.accuracy.toFixed(2)}%` : "accuracy n/a"}`,
    `Score ${replayPayload.score ?? 0} | Combo ${replayPayload.maxCombo ?? 0}x | ${preset.label}`,
  ];

  const { ass, playfield } = buildAssScript({
    width: preset.width,
    height: preset.height,
    durationMs,
    samples,
    rawFrames,
    hudLines,
  });

  const assPath = path.join(runtime.paths.workDir, "replay-overlay.ass");
  await fs.writeFile(assPath, ass, "utf8");
  onLog(`Native renderer: ASS overlay generated (${samples.length} samples)`);
  onProgress(0.55);

  const gridStepX = Math.max(24, Math.round(playfield.w / 8));
  const gridStepY = Math.max(24, Math.round(playfield.h / 6));
  const borderThickness = Math.max(2, Math.round(Math.min(playfield.w, playfield.h) / 180));
  const encoded = qualityEncodeOptions(runtime.job?.settings?.videoQuality);
  const assFilterPath = escapeFfmpegFilterPath(assPath);

  const vf = [
    `drawgrid=x=${playfield.x}:y=${playfield.y}:w=${gridStepX}:h=${gridStepY}:t=1:c=white@0.06`,
    `drawbox=x=${playfield.x}:y=${playfield.y}:w=${playfield.w}:h=${playfield.h}:color=0x8ec5ff@0.22:t=${borderThickness}`,
    `ass='${assFilterPath}'`,
  ].join(",");

  onLog("Native renderer: encoding video with ffmpeg");
  onProgress(0.65);
  await captureProcess(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x11161e:s=${preset.width}x${preset.height}:r=${preset.fps}:d=${(durationMs / 1000).toFixed(3)}`,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      encoded.preset,
      "-crf",
      encoded.crf,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      runtime.paths.outputVideo,
    ],
    {
      cwd: process.cwd(),
      onLine,
    }
  );
  onProgress(0.98);
  onLog("Native renderer: video file created");

  function onLine(line) {
    if (!line) return;
    onLog(line);
  }
}

module.exports = {
  runNativeReplayRenderer,
};
