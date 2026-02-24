const path = require("node:path");
const fs = require("node:fs/promises");
const { nowIso } = require("./utils");

class RenderQueue {
  constructor({ store, renderer, config }) {
    this.store = store;
    this.renderer = renderer;
    this.config = config;
    this.queue = [];
    this.active = false;
  }

  enqueue(jobId) {
    if (!this.queue.includes(jobId)) {
      this.queue.push(jobId);
    }
    this._pump();
  }

  async _pump() {
    if (this.active) return;
    const nextId = this.queue.shift();
    if (!nextId) return;

    this.active = true;
    try {
      await this._process(nextId);
    } finally {
      this.active = false;
      if (this.queue.length > 0) {
        setImmediate(() => this._pump());
      }
    }
  }

  async _process(jobId) {
    const job = this.store.getJob(jobId);
    if (!job) return;

    const workDir = path.join(this.config.dirs.temp, jobId);
    const outputDir = path.join(this.config.dirs.output, jobId);
    const outputVideo = path.join(outputDir, "render.mp4");
    const outputText = path.join(outputDir, "render.txt");

    let maxObservedProgress = 0.05;
    const setProgress = (value) => {
      const bounded = Math.max(0, Math.min(1, Number(value) || 0));
      if (bounded <= maxObservedProgress) return;
      maxObservedProgress = bounded;
      this.store.patchJob(jobId, { progress: bounded });
    };

    const progressFromLogLine = (line) => {
      const text = String(line || "");
      const m = text.match(/\bProgress:\s*(\d{1,3})%\b/i);
      if (m) {
        const p = Math.max(0, Math.min(100, Number(m[1]) || 0));
        // Map danser's 0..100% to template stage after wrapper setup.
        return 0.35 + (p / 100) * 0.60;
      }
      if (/Starting encoding!/i.test(text)) return 0.4;
      if (/Starting composing audio and video into one file/i.test(text)) return 0.96;
      if (/Video is available at:/i.test(text) || /\bFfmpeg finished\./i.test(text)) return 0.985;
      return null;
    };

    this.store.patchJob(jobId, {
      status: "processing",
      progress: 0.05,
      startedAt: nowIso(),
      error: null,
    });
    this.store.appendLog(jobId, "Job started");

    const runtime = {
      job,
      files: {
        replayPath: job.files?.replay?.path || null,
        skinZipPath: job.files?.skin?.path || null,
        beatmapPath: job.files?.beatmap?.path || null,
        skinDir: null,
      },
      paths: {
        workDir,
        outputDir,
        outputVideo,
        outputText,
      },
    };

    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    try {
      const result = await this.renderer(this.config, runtime, {
        onLog: (line) => {
          this.store.appendLog(jobId, line);
          const fromLog = progressFromLogLine(line);
          if (fromLog != null) setProgress(fromLog);
        },
        onProgress: (value) => {
          setProgress(value);
        },
      });

      this.store.patchJob(jobId, {
        status: "completed",
        progress: 1,
        completedAt: nowIso(),
        result,
      });
      this.store.appendLog(jobId, "Job completed");
    } catch (error) {
      this.store.patchJob(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: nowIso(),
      });
      this.store.appendLog(jobId, `Job failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

module.exports = { RenderQueue };
