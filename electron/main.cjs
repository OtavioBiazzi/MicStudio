const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell, Tray } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// Desativar aceleração de hardware para evitar telas cinzas e travamentos de GPU na reprodução de mídia
app.disableHardwareAcceleration();

const ROOT = __dirname.endsWith("electron") ? path.join(__dirname, "..") : process.cwd();
const API = "http://127.0.0.1:38717";
const isDev = !app.isPackaged;
let mainWindow;
let tray;
let backend;
let quitting = false;
let shortcutTimer;
let registeredSoundShortcuts = new Map();
let registeredGlobalShortcuts = new Map();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}


function pythonPath() {
  return path.join(ROOT, ".venv", "Scripts", "python.exe");
}

function startBackend() {
  if (backend) return;
  try {
    const { execSync } = require("child_process");
    execSync("taskkill /f /im MicFudiddoBackend.exe", { stdio: "ignore" });
  } catch (e) {
    // Ignore error if process not found
  }

  // Configurar logs do backend em arquivo
  const fs = require("fs");
  const logDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, "backend.log");
  const logStream = fs.createWriteStream(logFile, { flags: "w" });

  if (isDev) {
    backend = spawn(pythonPath(), ["-m", "micfudiddo.backend", "--port", "38717"], {
      cwd: ROOT,
      windowsHide: true
    });
  } else {
    backend = spawn(path.join(process.resourcesPath, "backend", "MicFudiddoBackend.exe"), ["--port", "38717"], {
      windowsHide: true
    });
  }
  
  if (backend) {
    backend.stdout.pipe(logStream);
    backend.stderr.pipe(logStream);
    backend.on("error", (err) => {
      console.error("Erro ao iniciar o backend:", err);
    });
  }
}
async function stopBackend() {
  stopSoundHotkeys();
  try {
    await fetch(`${API}/api/shutdown`, { method: "POST" });
  } catch (_) {}
  if (backend) {
    backend.kill();
    backend = null;
  }
}

async function refreshSoundHotkeys() {
  try {
    const res = await fetch(`${API}/api/state`);
    if (!res.ok) return;
    const data = await res.json();
    
    // 1. Refresh Sound Hotkeys
    const nextSounds = new Map();
    for (const sound of data.sounds || []) {
      const accelerator = normalizeAccelerator(sound.shortcut);
      if (!accelerator) continue;
      nextSounds.set(accelerator, sound.id);
    }

    for (const accelerator of registeredSoundShortcuts.keys()) {
      if (nextSounds.get(accelerator) !== registeredSoundShortcuts.get(accelerator)) {
        globalShortcut.unregister(accelerator);
        registeredSoundShortcuts.delete(accelerator);
      }
    }

    for (const [accelerator, soundId] of nextSounds.entries()) {
      if (registeredSoundShortcuts.has(accelerator)) continue;
      try {
        const ok = globalShortcut.register(accelerator, () => {
          fetch(`${API}/api/sounds/play`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: soundId })
          }).catch(() => {});
        });
        if (ok) registeredSoundShortcuts.set(accelerator, soundId);
      } catch (_) {}
    }

    // 2. Refresh Global App Hotkeys
    const settings = data.settings || {};
    const nextGlobals = new Map();
    const GLOBAL_SHORTCUT_MAP = {
      shortcutMuteMic: "mute_mic",
      shortcutToggleBypass: "toggle_bypass",
      shortcutToggleSoundboard: "toggle_soundboard",
      shortcutToggleVoiceChanger: "toggle_voicechanger",
      shortcutRecordVoice: "record_voice",
      shortcutRecordPC: "record_pc",
      shortcutRecordCombo: "record_combo"
    };

    for (const [settingsKey, actionName] of Object.entries(GLOBAL_SHORTCUT_MAP)) {
      const shortcutValue = settings[settingsKey];
      const accelerator = normalizeAccelerator(shortcutValue);
      if (!accelerator) continue;
      nextGlobals.set(accelerator, actionName);
    }

    for (const accelerator of registeredGlobalShortcuts.keys()) {
      if (nextGlobals.get(accelerator) !== registeredGlobalShortcuts.get(accelerator)) {
        globalShortcut.unregister(accelerator);
        registeredGlobalShortcuts.delete(accelerator);
      }
    }

    for (const [accelerator, actionName] of nextGlobals.entries()) {
      if (registeredGlobalShortcuts.has(accelerator)) continue;
      try {
        const ok = globalShortcut.register(accelerator, () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("hotkey:trigger", actionName);
          }
        });
        if (ok) registeredGlobalShortcuts.set(accelerator, actionName);
      } catch (_) {}
    }
  } catch (_) {}
}

function startSoundHotkeys() {
  stopSoundHotkeys();
  shortcutTimer = setInterval(refreshSoundHotkeys, 2500);
  refreshSoundHotkeys();
}

function stopSoundHotkeys() {
  if (shortcutTimer) {
    clearInterval(shortcutTimer);
    shortcutTimer = null;
  }
  for (const accelerator of registeredSoundShortcuts.keys()) {
    globalShortcut.unregister(accelerator);
  }
  registeredSoundShortcuts = new Map();

  for (const accelerator of registeredGlobalShortcuts.keys()) {
    globalShortcut.unregister(accelerator);
  }
  registeredGlobalShortcuts = new Map();
}

function normalizeAccelerator(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/controle/ig, "Ctrl")
    .replace(/control/ig, "Ctrl")
    .replace(/ctrl/ig, "Ctrl")
    .replace(/shift/ig, "Shift")
    .replace(/alt/ig, "Alt");
}

async function readAppSettings() {
  try {
    const res = await fetch(`${API}/api/state`);
    const data = await res.json();
    return data.settings || {};
  } catch (_) {
    return {};
  }
}

async function closeOrHideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
}

function askCloseChoice() {
  if (!mainWindow) return;
  mainWindow.webContents.send("window:close-choice-requested");
}

async function quitAppFully() {
  quitting = true;
  await stopBackend();
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 740,
    title: "MicFudiddo Studio",
    backgroundColor: "#07111d",
    icon: path.join(ROOT, "assets", "micfudiddo.ico"),
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      webSecurity: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE] ${message} (${sourceId}:${line})`);
  });


  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5177");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "studio-dist", "index.html"));
  }
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      askCloseChoice();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(ROOT, "assets", "micfudiddo.ico"));
  tray.setToolTip("MicFudiddo Studio");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mostrar", click: () => mainWindow?.show() },
    {
      label: "Fechar",
      click: async () => {
        quitting = true;
        await stopBackend();
        app.quit();
      }
    }
  ]));
  tray.on("double-click", () => mainWindow?.show());
}

ipcMain.handle("dialog:open-audio", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Adicionar sons",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio e video curto", extensions: ["wav", "mp3", "flac", "ogg", "aiff", "aif", "m4a", "aac", "opus", "wma", "mp4", "mov", "mkv", "webm"] },
      { name: "Todos os arquivos", extensions: ["*"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:open-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importar pasta de sons",
    properties: ["openDirectory", "multiSelections"]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:open-image", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Escolher imagem do som",
    properties: ["openFile"],
    filters: [
      { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      { name: "Todos os arquivos", extensions: ["*"] }
    ]
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("shell:open-path", async (_event, targetPath) => {
  if (!targetPath) return "no-path";
  return shell.openPath(String(targetPath));
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close-to-tray", () => {
  return closeOrHideWindow();
});

ipcMain.handle("window:close-choice", () => {
  return askCloseChoice();
});

ipcMain.handle("window:quit-app", () => {
  return quitAppFully();
});

app.whenReady().then(() => {
  startBackend();
  createWindow();
  createTray();
  startSoundHotkeys();
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("before-quit", async (event) => {
  if (!quitting) {
    event.preventDefault();
    quitting = true;
    await stopBackend();
    app.quit();
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("will-quit", () => {
  stopSoundHotkeys();
});
