const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createId() {
  return crypto.randomUUID();
}

function safeBaseName(filename) {
  const parsed = path.parse(filename || "file");
  const base = parsed.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "file";
  const ext = (parsed.ext || "").replace(/[^\w.]+/g, "");
  return `${base}${ext}`.replace(/\.+/g, ".");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFile(src, dst) {
  await ensureDir(path.dirname(dst));
  await fs.rename(src, dst);
}

function nowIso() {
  return new Date().toISOString();
}

function replacePlaceholders(template, context) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = context[key];
    return value == null ? "" : String(value);
  });
}

function quoteForCmd(value) {
  if (value == null) return '""';
  const str = String(value).replace(/"/g, '\\"');
  // Escape % for cmd.exe env expansion.
  return `"${str.replace(/%/g, "%%")}"`;
}

function extLower(filename) {
  return path.extname(filename || "").toLowerCase();
}

module.exports = {
  createId,
  safeBaseName,
  ensureDir,
  moveFile,
  nowIso,
  replacePlaceholders,
  quoteForCmd,
  extLower,
};
