const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, session, ipcMain, screen } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { IpMidi } = require('./ip-midi.cjs');
const ipMidi = new IpMidi();

const desktopPort = 4178;
const localUrl = `http://127.0.0.1:${desktopPort}`;
const hasSingleInstance = app.requestSingleInstanceLock();
let server;
let mainWindow;
let stemDeckProcess;
const displayAssignments = new Map();
const displayWindows = new Map();
const stemDeckConfigPath = () => path.join(app.getPath("userData"), "stemdeck-path.json");

if (!hasSingleInstance) {
  app.quit();
} else {
  const trusted = event => event.sender === mainWindow?.webContents && new URL(event.sender.getURL()).origin === localUrl;
  for (const [name, handler] of Object.entries({start: config => ipMidi.start(config), stop: () => ipMidi.stop(), send: (id,data,delay) => ipMidi.send(id,data,delay), clear: id => ipMidi.clear(id)})) {
    ipcMain.handle(`ipmidi:${name}`, (event,...args) => { if(!trusted(event))throw new Error('Janela não autorizada.');return handler(...args); });
  }
  ipMidi.on('message', message => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('ipmidi:message',message); });
  ipMidi.on('status', status => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('ipmidi:status',status); });
  ipcMain.handle("displays:list", (event) => {
    if (event.sender !== mainWindow?.webContents) return [];
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((display, index) => ({ id: String(display.id), name: display.label || `Ecrã ${index + 1}`, primary: display.id === primary.id }));
  });
  ipcMain.handle("displays:assign", (event, target, id) => {
    if (event.sender !== mainWindow?.webContents || typeof target !== "string" || !/^(main|stageset-lyrics-\d+|stageset-lyrics-mosaic)$/.test(target)) return false;
    if (!id) { displayAssignments.delete(target); return true; }
    const display = screen.getAllDisplays().find((item) => String(item.id) === id);
    if (!display) return false;
    displayAssignments.set(target, id);
    if (target === "main") { const wasFull = mainWindow.isFullScreen(); if (wasFull) mainWindow.setFullScreen(false); mainWindow.setPosition(display.workArea.x, display.workArea.y); if (wasFull) mainWindow.setFullScreen(true); }
    else { const child = displayWindows.get(target); if (child && !child.isDestroyed()) child.setPosition(display.workArea.x, display.workArea.y); }
    return true;
  });
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
    callback(["midi", "midiSysex", "media"].includes(permission) && _webContents.getURL().startsWith(localUrl + '/'));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, origin) => ["midi", "midiSysex", "media"].includes(permission) && origin === localUrl);

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
    ? { action: "allow", overrideBrowserWindowOptions: { width: 1100, height: 700, minWidth: 360, minHeight: 280, autoHideMenuBar: true, ...(() => { const display = screen.getAllDisplays().find((item) => String(item.id) === displayAssignments.get(frameName)); return display ? { x: display.workArea.x, y: display.workArea.y } : {}; })() } }
    : { action: "deny" });
  mainWindow.webContents.on("did-create-window", (child, details) => { displayWindows.set(details.frameName, child); child.once("closed", () => { if (displayWindows.get(details.frameName) === child) displayWindows.delete(details.frameName); }); });
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    let origin = "";
    try { origin = new URL(destination).origin; } catch {}
    if (origin !== localUrl) event.preventDefault();
  });
  mainWindow.loadURL(localUrl);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("before-quit", () => {
  ipMidi.stop();
  if (server?.listening) server.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
