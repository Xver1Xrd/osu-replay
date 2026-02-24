const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const extract = require("extract-zip");
const { replacePlaceholders, quoteForCmd } = require("./utils");
const { runNativeReplayRenderer } = require("./native-replay-renderer");

const QUALITY_PRESETS = {
  low: { key: "low", label: "720p / 30fps", width: 1280, height: 720, fps: 30 },
  medium: { key: "medium", label: "1080p / 60fps", width: 1920, height: 1080, fps: 60 },
  high: { key: "high", label: "1440p / 60fps", width: 2560, height: 1440, fps: 60 },
  ultra: { key: "ultra", label: "4K / 60fps", width: 3840, height: 2160, fps: 60 },
};

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function boolValue(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  return Boolean(value);
}

function toCursorPercent(cursorSettings) {
  const explicitPercent = cursorSettings?.sizePercent;
  if (explicitPercent != null) {
    return Math.round(clamp(explicitPercent, 25, 300, 100));
  }

  // Backward compatibility: old jobs stored raw danser cursor size (default 12).
  if (cursorSettings?.size != null) {
    const legacySize = clamp(cursorSettings.size, 2, 64, 12);
    return Math.round(clamp((legacySize / 12) * 100, 25, 300, 100));
  }

  return 100;
}

function getAdvancedRender(job) {
  const s = job?.settings?.advancedRender || {};
  const cursorSizePercent = toCursorPercent(s?.cursor);
  const cursorSizeRaw = Math.round(clamp((12 * cursorSizePercent) / 100, 2, 64, 12));
  return {
    gameplay: {
      showHitbar: boolValue(s?.gameplay?.showHitbar, true),
      showUnstableRate: boolValue(s?.gameplay?.showUnstableRate, true),
      showScore: boolValue(s?.gameplay?.showScore, true),
      showHpBar: boolValue(s?.gameplay?.showHpBar, true),
      showComboCounter: boolValue(s?.gameplay?.showComboCounter, true),
      showPpCounter: boolValue(s?.gameplay?.showPpCounter, true),
      showKeyOverlay: boolValue(s?.gameplay?.showKeyOverlay, true),
      showLeaderboard: boolValue(s?.gameplay?.showLeaderboard, true),
      showLeaderboardAvatars: boolValue(s?.gameplay?.showLeaderboardAvatars, false),
      showBoundaries: boolValue(s?.gameplay?.showBoundaries, true),
      showMods: boolValue(s?.gameplay?.showMods, true),
      showResultsScreen: boolValue(s?.gameplay?.showResultsScreen, true),
      showHitCounter: boolValue(s?.gameplay?.showHitCounter, true),
      showSliderBreaks: boolValue(s?.gameplay?.showSliderBreaks, false),
      showAimErrorMeter: boolValue(s?.gameplay?.showAimErrorMeter, false),
      showStrainGraph: boolValue(s?.gameplay?.showStrainGraph, true),
    },
    skin: {
      useSkinCursor: boolValue(s?.skin?.useSkinCursor, false),
      useSkinHitsounds: boolValue(s?.skin?.useSkinHitsounds, false),
      useSkinComboColors: boolValue(s?.skin?.useSkinComboColors, false),
      useBeatmapComboColors: boolValue(s?.skin?.useBeatmapComboColors, false),
    },
    cursor: {
      ripples: boolValue(s?.cursor?.ripples, false),
      trail: boolValue(s?.cursor?.trail, true),
      sizePercent: cursorSizePercent,
      size: cursorSizeRaw,
      rainbow: boolValue(s?.cursor?.rainbow, true),
      trailGlow: boolValue(s?.cursor?.trailGlow, true),
    },
    other: {
      seizureWarning: boolValue(s?.other?.seizureWarning, true),
      loadStoryboards: boolValue(s?.other?.loadStoryboards, true),
      loadVideos: boolValue(s?.other?.loadVideos, false),
      skipIntro: boolValue(s?.other?.skipIntro, false),
      bgDimIntro: Number(clamp(s?.other?.bgDimIntro, 0, 1, 0)),
      bgDimNormal: Number(clamp(s?.other?.bgDimNormal, 0, 1, 0.95)),
      bgDimBreaks: Number(clamp(s?.other?.bgDimBreaks, 0, 1, 0.5)),
      bgParallax: boolValue(s?.other?.bgParallax, true),
      showDanserLogo: boolValue(s?.other?.showDanserLogo, true),
      playNightcoreHitsounds: boolValue(s?.other?.playNightcoreHitsounds, true),
      ignoreReplayFail: boolValue(s?.other?.ignoreReplayFail, false),
    },
  };
}

function buildDanserJobSPatch(job, preset) {
  const advanced = getAdvancedRender(job);
  const musicVolume = clamp(job?.settings?.musicVolume, 0, 200, 100) / 100;
  const hitsoundVolume = clamp(job?.settings?.hitsoundVolume, 0, 200, 100) / 100;

  const cursorPatch = {
    EnableTrailGlow: advanced.cursor.trailGlow,
    Colors: {
      EnableRainbow: advanced.cursor.rainbow,
    },
  };

  if (!advanced.skin.useSkinCursor) {
    cursorPatch.CursorRipples = advanced.cursor.ripples;
    cursorPatch.CursorSize = advanced.cursor.size;
    cursorPatch.TrailMaxLength = advanced.cursor.trail ? 2000 : 0;
  }

  return {
    Recording: {
      FrameWidth: preset.width,
      FrameHeight: preset.height,
      FPS: preset.fps,
    },
    Audio: {
      MusicVolume: Number(musicVolume.toFixed(2)),
      SampleVolume: Number(hitsoundVolume.toFixed(2)),
      PlayNightcoreSamples: advanced.other.playNightcoreHitsounds,
      IgnoreBeatmapSamples: advanced.skin.useSkinHitsounds,
      IgnoreBeatmapSampleVolume: advanced.skin.useSkinHitsounds,
    },
    Gameplay: {
      HitErrorMeter: {
        Show: advanced.gameplay.showHitbar,
        ShowUnstableRate: advanced.gameplay.showUnstableRate,
      },
      AimErrorMeter: {
        Show: advanced.gameplay.showAimErrorMeter,
      },
      Score: {
        Show: advanced.gameplay.showScore,
      },
      HpBar: {
        Show: advanced.gameplay.showHpBar,
      },
      ComboCounter: {
        Show: advanced.gameplay.showComboCounter,
      },
      PPCounter: {
        Show: advanced.gameplay.showPpCounter,
      },
      HitCounter: {
        Show: advanced.gameplay.showHitCounter,
        ShowSliderBreaks: advanced.gameplay.showSliderBreaks,
      },
      StrainGraph: {
        Show: advanced.gameplay.showStrainGraph,
      },
      KeyOverlay: {
        Show: advanced.gameplay.showKeyOverlay,
      },
      ScoreBoard: {
        Show: advanced.gameplay.showLeaderboard,
        ShowAvatars: advanced.gameplay.showLeaderboardAvatars,
      },
      Mods: {
        Show: advanced.gameplay.showMods,
      },
      Boundaries: {
        Enabled: advanced.gameplay.showBoundaries,
      },
      ShowResultsScreen: advanced.gameplay.showResultsScreen,
      IgnoreFailsInReplays: advanced.other.ignoreReplayFail,
    },
    Skin: {
      Cursor: {
        UseSkinCursor: advanced.skin.useSkinCursor,
      },
      UseColorsFromSkin: advanced.skin.useSkinComboColors,
      UseBeatmapColors: advanced.skin.useBeatmapComboColors,
    },
    Objects: {
      Colors: {
        UseSkinComboColors: advanced.skin.useSkinComboColors,
        UseBeatmapComboColors: advanced.skin.useBeatmapComboColors,
      },
    },
    Cursor: cursorPatch,
    Playfield: {
      SeizureWarning: {
        Enabled: advanced.other.seizureWarning,
      },
      Background: {
        LoadStoryboards: advanced.other.loadStoryboards,
        LoadVideos: advanced.other.loadVideos,
        Dim: {
          Intro: advanced.other.bgDimIntro,
          Normal: advanced.other.bgDimNormal,
          Breaks: advanced.other.bgDimBreaks,
        },
        Parallax: {
          Enabled: advanced.other.bgParallax,
        },
      },
      Logo: {
        Enabled: advanced.other.showDanserLogo,
      },
    },
  };
}

function getQualityPreset(job) {
  const key = String(job?.settings?.videoQuality || "medium").toLowerCase();
  return QUALITY_PRESETS[key] || QUALITY_PRESETS.medium;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, { cwd, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    const forward = (chunk, type) => {
      const text = chunk.toString();
      if (type === "stderr") {
        stderrBuffer += text;
      } else {
        stdoutBuffer += text;
      }

      const combined = (type === "stderr" ? stderrBuffer : stdoutBuffer);
      const lines = combined.split(/\r?\n/);
      const remainder = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) onLine(`${type}> ${line}`);
      }

      if (type === "stderr") {
        stderrBuffer = remainder;
      } else {
        stdoutBuffer = remainder;
      }
    };

    child.stdout.on("data", (chunk) => forward(chunk, "stdout"));
    child.stderr.on("data", (chunk) => forward(chunk, "stderr"));

    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) onLine(`stdout> ${stdoutBuffer.trim()}`);
      if (stderrBuffer.trim()) onLine(`stderr> ${stderrBuffer.trim()}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function maybeExtractSkin(skinZipPath, skinDir) {
  if (!skinZipPath) return null;
  await fs.mkdir(skinDir, { recursive: true });
  await extract(skinZipPath, { dir: skinDir });
  return skinDir;
}

async function tryMockVideo(outputVideo, onLog, preset) {
  const ffmpegCmd = `ffmpeg -y -f lavfi -i testsrc2=size=${preset.width}x${preset.height}:rate=${preset.fps} -t 5 -pix_fmt yuv420p ${quoteForCmd(outputVideo)}`;
  try {
    onLog(`Mock renderer: trying ffmpeg test video generation (${preset.label})`);
    await runCommand(ffmpegCmd, { cwd: process.cwd(), onLine: onLog });
    return true;
  } catch (error) {
    onLog(`Mock renderer: ffmpeg not available (${error.message}), writing placeholder file`);
    await fs.writeFile(
      outputVideo.replace(/\.mp4$/i, ".txt"),
      "Mock render complete. Configure RENDERER_MODE=template for real osu! rendering.\n",
      "utf8"
    );
    return false;
  }
}

function buildTemplateContext(runtime) {
  const preset = getQualityPreset(runtime.job);
  const musicVolume = Number(runtime.job?.settings?.musicVolume ?? 100);
  const hitsoundVolume = Number(runtime.job?.settings?.hitsoundVolume ?? 100);
  const advancedRender = getAdvancedRender(runtime.job);
  const danserJobSPatch = buildDanserJobSPatch(runtime.job, preset);
  const danserJobSPatchJson = JSON.stringify(danserJobSPatch);
  const raw = {
    jobId: runtime.job.id,
    title: runtime.job.title || "",
    replay: runtime.files.replayPath || "",
    skinZip: runtime.files.skinZipPath || "",
    skinDir: runtime.files.skinDir || "",
    beatmap: runtime.files.beatmapPath || "",
    outputDir: runtime.paths.outputDir,
    outputVideo: runtime.paths.outputVideo,
    videoQuality: preset.key,
    videoQualityLabel: preset.label,
    videoWidth: preset.width,
    videoHeight: preset.height,
    videoFps: preset.fps,
    musicVolume,
    hitsoundVolume,
    danserJobSPatchJson,
    danserJobSPatchB64: Buffer.from(danserJobSPatchJson, "utf8").toString("base64"),
    replayAdvancedSettingsJson: JSON.stringify(advancedRender),
    danserSkipIntro: advancedRender.other.skipIntro ? "1" : "0",
  };

  const context = { ...raw };
  for (const [key, value] of Object.entries(raw)) {
    context[`${key}_q`] = quoteForCmd(value);
  }
  return context;
}

async function runTemplateRenderer(config, runtime, hooks) {
  const { onLog, onProgress } = hooks;
  if (!config.renderCommandTemplate) {
    throw new Error("RENDER_COMMAND_TEMPLATE is empty");
  }
  const context = buildTemplateContext(runtime);
  const command = replacePlaceholders(config.renderCommandTemplate, context);
  onLog(`Running template renderer command`);
  onLog(command);
  let bestProgress = 0.35;
  let danserFinalVideoPath = null;
  const reportProgress = (value) => {
    const bounded = Math.max(0, Math.min(0.99, Number(value) || 0));
    if (bounded <= bestProgress) return;
    bestProgress = bounded;
    onProgress(bestProgress);
  };

  const progressFromDanserPercent = (percent) => {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    // Reserve head/tail for wrapper setup/finalization around danser run.
    return 0.35 + (p / 100) * 0.60;
  };

  onProgress(bestProgress);
  const handleLine = (line) => {
    onLog(line);

    const text = String(line || "");
    const videoPathMatch = text.match(/Video is available at:\s*(.+)\s*$/i);
    if (videoPathMatch) {
      danserFinalVideoPath = videoPathMatch[1].trim();
    }

    const progressMatch = text.match(/\bProgress:\s*(\d{1,3})%\b/i);
    if (progressMatch) {
      reportProgress(progressFromDanserPercent(progressMatch[1]));
      return;
    }

    if (/Starting encoding!/i.test(text)) {
      reportProgress(0.4);
      return;
    }
    if (/Starting composing audio and video into one file/i.test(text)) {
      reportProgress(0.96);
      return;
    }
    if (/Finished!\s*$/i.test(text) || /Video is available at:/i.test(text)) {
      reportProgress(0.985);
    }
  };

  try {
    await runCommand(command, {
      cwd: process.cwd(),
      onLine: handleLine,
    });
  } catch (error) {
    const fallbackSource = danserFinalVideoPath ? danserFinalVideoPath.replace(/^['"]|['"]$/g, "") : null;
    if (fallbackSource && (await exists(fallbackSource))) {
      await fs.mkdir(path.dirname(runtime.paths.outputVideo), { recursive: true });
      await fs.copyFile(fallbackSource, runtime.paths.outputVideo);
      onLog(`Template wrapper failed after danser completed; recovered final video from danser output: ${fallbackSource}`);
      reportProgress(0.99);
    } else {
      throw error;
    }
  }
  onProgress(Math.max(bestProgress, 0.99));
}

async function runMockRenderer(runtime, hooks) {
  const { onLog, onProgress } = hooks;
  const preset = getQualityPreset(runtime.job);
  onLog("Starting mock renderer");
  onLog(`Video quality preset: ${preset.label}`);
  onProgress(0.2);
  const createdVideo = await tryMockVideo(runtime.paths.outputVideo, onLog, preset);
  if (!createdVideo) {
    runtime.paths.outputVideo = null;
    runtime.paths.outputText = path.join(runtime.paths.outputDir, "mock-render.txt");
  }
  onProgress(0.95);
}

async function renderJob(config, runtime, hooks) {
  const { onLog, onProgress } = hooks;
  onLog("Preparing files");
  const musicVolume = Number(runtime.job?.settings?.musicVolume ?? 100);
  const hitsoundVolume = Number(runtime.job?.settings?.hitsoundVolume ?? 100);
  onLog(`Audio mix settings: music ${musicVolume}% / hitsounds ${hitsoundVolume}%`);
  await fs.mkdir(runtime.paths.outputDir, { recursive: true });

  if (runtime.files.skinZipPath) {
    onLog("Extracting custom skin");
    runtime.files.skinDir = path.join(runtime.paths.workDir, "skin");
    await maybeExtractSkin(runtime.files.skinZipPath, runtime.files.skinDir);
  }

  if (config.rendererMode === "template") {
    await runTemplateRenderer(config, runtime, hooks);
  } else if (config.rendererMode === "native") {
    await runNativeReplayRenderer(runtime, hooks, getQualityPreset(runtime.job));
  } else {
    await runMockRenderer(runtime, hooks);
  }

  const videoExists = runtime.paths.outputVideo && (await exists(runtime.paths.outputVideo));
  const textFallback = runtime.paths.outputText && (await exists(runtime.paths.outputText));

  if (!videoExists && !textFallback) {
    throw new Error(
      "Renderer finished but no output file was found. Expected outputVideo or fallback artifact."
    );
  }

  onProgress(1);
  if (videoExists) {
    return {
      type: "video",
      filePath: runtime.paths.outputVideo,
      fileName: path.basename(runtime.paths.outputVideo),
      contentType: "video/mp4",
    };
  }

  return {
    type: "text",
    filePath: runtime.paths.outputText,
    fileName: path.basename(runtime.paths.outputText),
    contentType: "text/plain; charset=utf-8",
  };
}

module.exports = { renderJob };
