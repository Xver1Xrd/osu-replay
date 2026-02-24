const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

const ROOT = process.cwd();

const dirs = {
  data: path.join(ROOT, "data"),
  uploads: path.join(ROOT, "uploads"),
  output: path.join(ROOT, "output"),
  temp: path.join(ROOT, "temp"),
  incoming: path.join(ROOT, "temp", "_incoming"),
};

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureBaseDirs() {
  Object.values(dirs).forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

module.exports = {
  ROOT,
  dirs,
  port: numberFromEnv("PORT", 3000),
  rendererMode: (process.env.RENDERER_MODE || "native").trim().toLowerCase(),
  renderCommandTemplate: (process.env.RENDER_COMMAND_TEMPLATE || "").trim(),
  maxFileSizeMb: numberFromEnv("MAX_FILE_SIZE_MB", 512),
  ensureBaseDirs,
};
