const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, session, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");

const desktopPort = 4178;
const localUrl = `http://127.0.0.1:${desktopPort}`;
const hasSingleInstance = app.requestSingleInstanceLock();
let server;
let mainWindow;
let stemDeckProcess;
const stemDeckConfigPath = () => path.join(app.getPath("userData"), "stemdeck-path.json");

if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(startDesktop).catch(async (error) => {
    await dialog.showMessageBox({
      type: "error",
      title: "StageSet não iniciou",
      message: "Não foi possível iniciar o servidor local do StageSet.",
      detail: error.message,
    });
    app.quit();
  });

  ipcMain.handle("stemdeck:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Selecionar StemDeck", properties: ["openFile"], filters: [{ name: "Aplicação StemDeck", extensions: ["exe"] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(stemDeckConfigPath(), JSON.stringify({ path: result.filePaths[0] }), "utf8");
    return { path: result.filePaths[0] };
  });
  ipcMain.handle("stemdeck:launch", async () => {
    let executable = "";
    try { executable = JSON.parse(await fs.readFile(stemDeckConfigPath(), "utf8")).path || ""; } catch {}
    if (!executable) return { configured: false };
    if (stemDeckProcess && !stemDeckProcess.killed) return { launched: true, alreadyRunning: true };
    const child = spawn(executable, [], { cwd: path.dirname(executable), detached: true, stdio: "ignore", windowsHide: false });
    stemDeckProcess = child;
    child.once("error", (error) => { stemDeckProcess = null; console.error("StemDeck não iniciou:", error.message); });
    child.once("exit", () => { stemDeckProcess = null; });
    child.unref();
    return { launched: true };
  });
}

async function startDesktop() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "midi" || permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "midi" || permission === "media");

  const serverPath = path.join(__dirname, "..", "server.mjs");
  const { createStageSetServer } = await import(pathToFileURL(serverPath).href);
  server = createStageSetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(desktopPort, "127.0.0.1", resolve);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: "#10141b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ frameName }) => frameName?.startsWith("stageset-lyrics-")
    ? { action: "allow", overrideBrowserWindowOptions: { width: 1100, height: 700, minWidth: 360, minHeight: 280, autoHideMenuBar: true } }
    : { action: "deny" });
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    let origin = "";
    try { origin = new URL(destination).origin; } catch {}
    if (origin !== localUrl) event.preventDefault();
  });
  mainWindow.loadURL(localUrl);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("before-quit", () => {
  if (server?.listening) server.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
