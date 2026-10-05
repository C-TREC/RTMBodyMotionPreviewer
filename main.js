// RTMBodyMotion 預覽器：Electron 主程序（視窗、app:// 協定、讀寫檔案）
const { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const APP_DIR = path.join(__dirname, "app");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1100, minHeight: 700,
    backgroundColor: "#12161d",
    title: "RTMBodyMotion Previewer",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadURL("app://local/index.html");
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F12") win.webContents.toggleDevTools();
  });
  // 外部連結用系統瀏覽器開啟
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ---------------------------------------------------------------- 檔案
// RTM 的 JSON 常有註解與結尾逗號
function parseLooseJson(text) {
  let out = "", i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) { out += c; if (c === "\\") { out += text[i + 1] || ""; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && text[i + 1] === "*") { i = text.indexOf("*/", i + 2); i = i < 0 ? text.length : i + 2; continue; }
    out += c; i++;
  }
  out = out.replace(/,\s*([}\]])/g, "$1").replace(/^﻿/, "");
  return JSON.parse(out);
}

function readText(file) {
  const buf = fs.readFileSync(file);
  // MQO 多為 Shift_JIS／GBK；腳本與 JSON 為 UTF-8
  return buf.toString("utf8");
}

function dataUrl(file) {
  if (!file || !fs.existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
  if (!mime) return null;
  return "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
}

// 往上找 assets/minecraft（RTM 資源根目錄）
function findMinecraftRoot(start) {
  let d = path.dirname(start);
  for (let i = 0; i < 8; i++) {
    if (path.basename(d).toLowerCase() === "minecraft" && fs.existsSync(path.join(d, "models"))) return d;
    const cand = path.join(d, "assets", "minecraft");
    if (fs.existsSync(path.join(cand, "models"))) return cand;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

function loadModelFile(file, textureMap) {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file);
  const model = { name: path.basename(file), format: ext.slice(1), text: ext === ".mqo" ? raw.toString("latin1") : raw.toString("utf8"), textures: {} };
  if (ext === ".mqo") {
    // MQO 材質自帶的貼圖檔名（與模型同資料夾）
    const re = /tex\("([^"]+)"\)/g; let m;
    while ((m = re.exec(model.text))) {
      const f = path.join(path.dirname(file), m[1]);
      const d = dataUrl(f); if (d) model.textures["file:" + m[1]] = d;
    }
  }
  if (textureMap) for (const [mat, d] of Object.entries(textureMap)) if (d) model.textures[mat] = d;
  return model;
}

ipcMain.handle("open-text", async (e, opts) => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: opts.filters });
  if (r.canceled || !r.filePaths.length) return null;
  const f = r.filePaths[0];
  return { path: f, name: path.basename(f), text: readText(f) };
});

ipcMain.handle("open-scripts", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: [{ name: "JavaScript", extensions: ["js"] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const files = r.filePaths.slice();
  // 只選了模組時，自動找同資料夾的適配器
  const dir = path.dirname(files[0]);
  for (const n of ["RTMBodyMotion.js", "RTMBodyMotionAdapter.js"]) {
    const f = path.join(dir, n);
    if (!files.some((x) => path.basename(x) === n) && fs.existsSync(f)) files.push(f);
  }
  return files.map((f) => ({ path: f, name: path.basename(f), text: readText(f) }));
});

ipcMain.handle("open-model", async () => {
  const r = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "RTM vehicle JSON / MQO / OBJ", extensions: ["json", "mqo", "obj"] }],
  });
  if (r.canceled || !r.filePaths.length) return null;
  return loadVehicle(r.filePaths[0]);
});

// 自動測試用（只有設定環境變數時才有作用）：PREVIEW_TEST_MODEL＝車輛 JSON，PREVIEW_SNAPSHOT＝截圖輸出路徑
ipcMain.handle("test-info", () => ({ model: process.env.PREVIEW_TEST_MODEL || null, snapshot: !!process.env.PREVIEW_SNAPSHOT,
  scenario: process.env.PREVIEW_TEST_SCENARIO || null, time: Number(process.env.PREVIEW_TEST_TIME || 0), cam: process.env.PREVIEW_TEST_CAM || null }));
ipcMain.handle("test-model", () => (process.env.PREVIEW_TEST_MODEL ? loadVehicle(process.env.PREVIEW_TEST_MODEL) : null));
ipcMain.handle("test-done", async (e) => {
  const out = process.env.PREVIEW_SNAPSHOT;
  if (out) { const img = await e.sender.capturePage(); fs.writeFileSync(out, img.toPNG()); }
  app.quit();
});

function loadVehicle(f) {
  const ext = path.extname(f).toLowerCase();
  if (ext !== ".json") return { kind: "model", body: loadModelFile(f) };
  // 車輛 JSON：讀出車體模型、貼圖、轉向架、trainDistance、描畫腳本（含 MOTION_TUNING）
  const cfg = parseLooseJson(fs.readFileSync(f, "utf8"));
  const root = findMinecraftRoot(f);
  if (!root) throw new Error("assets/minecraft not found above " + f);
  const pick = (m) => m && (Array.isArray(m) ? m[0] : m);
  const bodyDef = pick(cfg.trainModel2 || cfg.trainModel || cfg.model);
  const res = { kind: "vehicle", name: cfg.trainName || path.basename(f), trainDistance: Number(cfg.trainDistance) || null, bogiePos: cfg.bogiePos || null };
  const load = (def) => {
    if (!def || !def.modelFile) return null;
    const mf = path.join(root, "models", def.modelFile);
    if (!fs.existsSync(mf)) return null;
    const tex = {};
    for (const t of def.textures || []) tex[t[0]] = dataUrl(path.join(root, t[1]));
    const m = loadModelFile(mf, tex);
    m.textureModes = Object.fromEntries((def.textures || []).map((t) => [t[0], t[2] || ""]));
    return m;
  };
  res.body = load(bodyDef);
  res.bogie = load(pick(cfg.bogieModel3 || cfg.bogieModel2 || cfg.bogieModel));
  if (bodyDef && bodyDef.rendererPath) {
    const rp = path.join(root, bodyDef.rendererPath);
    if (fs.existsSync(rp)) res.renderScript = { name: path.basename(rp), text: readText(rp) };
  }
  return res;
}

ipcMain.handle("save-text", async (e, { name, text, filters }) => {
  const r = await dialog.showSaveDialog({ defaultPath: name, filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, "utf8");
  return r.filePath;
});

ipcMain.handle("save-png", async (e, { name, dataUrl: d }) => {
  const r = await dialog.showSaveDialog({ defaultPath: name, filters: [{ name: "PNG", extensions: ["png"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(d.split(",")[1], "base64"));
  return r.filePath;
});

ipcMain.handle("app-info", () => ({ version: app.getVersion(), platform: process.platform, electron: process.versions.electron }));
