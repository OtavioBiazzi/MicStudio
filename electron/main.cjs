const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell, Tray, clipboard } = require("electron");
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
let STATE_BACKEND_RUNNING_EXTERNALLY = false;
let shortcutConflicts = new Map();

function getIconPath() {
  if (isDev) {
    return path.join(ROOT, "assets", "micfudiddo.ico");
  }
  // In packaged app, try multiple locations
  const candidates = [
    path.join(__dirname, "..", "assets", "micfudiddo.ico"),
    path.join(process.resourcesPath, "assets", "micfudiddo.ico"),
    path.join(ROOT, "assets", "micfudiddo.ico"),
  ];
  const fs = require("fs");
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]; // fallback
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}


function pythonPath() {
  return path.join(ROOT, ".venv", "Scripts", "python.exe");
}

const net = require("net");
const http = require("http");

function checkPortOccupied(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port, "127.0.0.1");
  });
}

function pingHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1",
      port: port,
      path: "/api/health",
      method: "GET",
      timeout: 1000
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed && parsed.ok === true);
        } catch (_) {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function startBackend() {
  if (backend) return;
  
  const port = 38717;
  const occupied = await checkPortOccupied(port);
  if (occupied) {
    const healthy = await pingHealth(port);
    if (healthy) {
      console.log("Backend já está rodando e saudável na porta " + port + ". Reutilizando...");
      STATE_BACKEND_RUNNING_EXTERNALLY = true;
      return;
    } else {
      dialog.showErrorBox(
        "Conflito de Porta",
        `A porta do servidor de áudio (${port}) já está em uso por outro programa.\n\nPor favor, feche o outro programa e tente abrir o MicFudiddo Studio novamente.`
      );
      app.quit();
      process.exit(0);
    }
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
    backend.on("exit", (code) => {
      if (code !== 0 && !quitting && !STATE_BACKEND_RUNNING_EXTERNALLY) {
        let logExcerpt = "";
        try {
          if (fs.existsSync(logFile)) {
            const lines = fs.readFileSync(logFile, "utf8").split("\n");
            logExcerpt = lines.slice(-15).join("\n");
          }
        } catch (_) {}
        
        dialog.showErrorBox(
          "Falha no Servidor de Áudio",
          `O servidor de áudio (backend) fechou inesperadamente com o código ${code}.\n\nLogs de Erro:\n${logExcerpt || "Sem logs disponíveis."}\n\nSe o erro persistir, exporte o diagnóstico nas Configurações.`
        );
      }
    });
  }
}
async function stopBackend() {
  stopSoundHotkeys();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    await fetch(`${API}/api/shutdown`, { method: "POST", signal: controller.signal }).catch(() => {});
    clearTimeout(timeoutId);
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
      globalShortcut.unregister(accelerator);
      registeredSoundShortcuts.delete(accelerator);
    }

    // Sound shortcuts are now registered and handled natively on the Python backend to avoid blocking keys.

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
      shortcutRecordCombo: "record_combo",
      shortcutClip: "clip"
    };

    const GLOBAL_SHORTCUT_LABELS = {
      shortcutMuteMic: "Mudar Mute Mic",
      shortcutToggleBypass: "Modo Bypass",
      shortcutToggleSoundboard: "Mute Soundboard",
      shortcutToggleVoiceChanger: "Ativar Voice Changer",
      shortcutRecordVoice: "Gravar Própria Voz",
      shortcutRecordPC: "Gravar Áudio PC",
      shortcutRecordCombo: "Gravar Combo",
      shortcutClip: "Salvar Clipe Retroativo"
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
      if (registeredGlobalShortcuts.has(accelerator)) {
        shortcutConflicts.delete(accelerator);
        continue;
      }
      try {
        const ok = globalShortcut.register(accelerator, () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("hotkey:trigger", actionName);
          }
        });
        if (ok) {
          registeredGlobalShortcuts.set(accelerator, actionName);
          shortcutConflicts.delete(accelerator);
        } else {
          const settingsKey = Object.keys(GLOBAL_SHORTCUT_MAP).find(k => GLOBAL_SHORTCUT_MAP[k] === actionName);
          shortcutConflicts.set(accelerator, GLOBAL_SHORTCUT_LABELS[settingsKey] || actionName);
        }
      } catch (_) {
        shortcutConflicts.set(accelerator, "Erro de Registro");
      }
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
    icon: getIconPath(),
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      webSecurity: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  tray = new Tray(getIconPath());
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

ipcMain.handle("dialog:save-mfsound", async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exportar pacote de som (.mfsound)",
    defaultPath: defaultName || "som.mfsound",
    filters: [
      { name: "MicFudiddo Sound Package", extensions: ["mfsound"] }
    ]
  });
  return result.canceled ? "" : result.filePath;
});

ipcMain.handle("dialog:open-mfsound", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importar pacote .mfsound",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "MicFudiddo Sound Package", extensions: ["mfsound"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:open-audio", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importar Sons ou Pacotes",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Mídia e Pacotes", extensions: ["mfsound", "wav", "mp3", "flac", "ogg", "aiff", "aif", "m4a", "aac", "opus", "wma", "mp4", "mov", "mkv", "webm"] },
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

ipcMain.handle("shell:show-item-in-folder", async (_event, targetPath) => {
  if (!targetPath) return false;
  shell.showItemInFolder(String(targetPath));
  return true;
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

ipcMain.handle("shell:open-external", async (_event, url) => {
  if (url) {
    try {
      await shell.openExternal(url);
      return true;
    } catch (_) {}
  }
  return false;
});

ipcMain.handle("system:open-sound-settings", () => {
  try {
    require("child_process").exec("start ms-settings:sound");
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle("system:open-mmsys", () => {
  try {
    require("child_process").exec("control mmsys.cpl");
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle("shortcuts:get-conflicts", () => {
  return Object.fromEntries(shortcutConflicts);
});

ipcMain.handle("clipboard:write", async (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app:update-app", async (_event, downloadUrl) => {
  const fs = require("fs");
  const https = require("https");
  const { spawn } = require("child_process");
  
  return new Promise((resolve, reject) => {
    const tempDir = app.getPath("temp");
    const installerPath = path.join(tempDir, "MicFudiddoStudioSetup.exe");
    const file = fs.createWriteStream(installerPath);
    
    const download = (url) => {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          download(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Falha no download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(async () => {
            try {
              quitting = true;
              await stopBackend();
              
              const child = spawn(installerPath, [], {
                detached: true,
                stdio: "ignore"
              });
              child.unref();
              
              app.quit();
              resolve(true);
            } catch (e) {
              reject(e);
            }
          });
        });
      }).on("error", (err) => {
        fs.unlink(installerPath, () => reject(err));
      });
    };
    
    download(downloadUrl);
  });
});

function cleanOldVersion() {
  const fs = require("fs");
  const path = require("path");
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return;

  const currentDir = path.resolve(path.dirname(app.getPath("exe")));

  // 1. Limpar pastas antigas de instalação local
  const oldDirsToClean = [
    path.resolve(path.join(localAppData, "MicFudiddo")),
    path.resolve(path.join(localAppData, "MicFudiddoStudio")),
    path.resolve(path.join(localAppData, "micfudiddo-studio")),
    path.resolve(path.join(localAppData, "MicFudiddo Studio")),
    path.resolve(path.join(localAppData, "Programs", "micfudiddo-studio"))
  ];

  for (const oldDir of oldDirsToClean) {
    // Se o app atual estiver rodando de dentro da pasta antiga, nao deleta a si mesmo!
    if (currentDir.toLowerCase().startsWith(oldDir.toLowerCase())) {
      continue;
    }
    if (fs.existsSync(oldDir)) {
      try {
        fs.rmSync(oldDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`Erro ao deletar pasta antiga ${oldDir}:`, e);
      }
    }
  }

  const appData = app.getPath("appData");

  // 2. Limpar pastas antigas do Menu Iniciar
  if (appData) {
    const oldStartMenuFolder = path.join(appData, "Microsoft\\Windows\\Start Menu\\Programs\\MicFudiddo");
    if (fs.existsSync(oldStartMenuFolder)) {
      try {
        fs.rmSync(oldStartMenuFolder, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // 3. Limpar atalhos antigos específicos (Desktop e Start Menu)
  try {
    const desktopDir = app.getPath("desktop");
    const oldDesktopShortcuts = ["Mic Fudido.lnk", "MicFudiddo.lnk"];
    oldDesktopShortcuts.forEach((lnk) => {
      const lnkPath = path.join(desktopDir, lnk);
      if (fs.existsSync(lnkPath)) {
        try { fs.unlinkSync(lnkPath); } catch (_) {}
      }
    });

    if (appData) {
      const startMenuProgramsDir = path.join(appData, "Microsoft\\Windows\\Start Menu\\Programs");
      const oldStartMenuShortcuts = ["Mic Fudido.lnk", "MicFudiddo.lnk"];
      oldStartMenuShortcuts.forEach((lnk) => {
        const lnkPath = path.join(startMenuProgramsDir, lnk);
        if (fs.existsSync(lnkPath)) {
          try { fs.unlinkSync(lnkPath); } catch (_) {}
        }
      });
    }
  } catch (_) {}

  // 4. Recriar/Garantir atalhos válidos da versão atual
  try {
    // Não criar atalhos se estiver rodando em ambiente de desenvolvimento (isDev)
    if (!isDev) {
      const desktopDir = app.getPath("desktop");
      const newDesktopShortcut = path.join(desktopDir, "MicFudiddo Studio.lnk");
      
      const shortcutOptions = {
        target: app.getPath("exe"),
        workingDirectory: path.dirname(app.getPath("exe")),
        description: "MicFudiddo Studio - modificador de voz e soundboard",
        icon: app.getPath("exe"),
        iconIndex: 0
      };

      // Gravar atalho na Área de Trabalho (deleta antes para evitar erro de arquivo existente)
      if (fs.existsSync(newDesktopShortcut)) {
        try { fs.unlinkSync(newDesktopShortcut); } catch (_) {}
      }
      shell.writeShortcutLink(newDesktopShortcut, "create", shortcutOptions);

      // Gravar atalho no Menu Iniciar (deleta antes para evitar erro de arquivo existente)
      if (appData) {
        const startMenuProgramsDir = path.join(appData, "Microsoft\\Windows\\Start Menu\\Programs");
        const newStartMenuShortcut = path.join(startMenuProgramsDir, "MicFudiddo Studio.lnk");
        if (fs.existsSync(newStartMenuShortcut)) {
          try { fs.unlinkSync(newStartMenuShortcut); } catch (_) {}
        }
        shell.writeShortcutLink(newStartMenuShortcut, "create", shortcutOptions);
      }
    }
  } catch (err) {
    console.error("Erro ao criar/atualizar atalhos:", err);
  }
}

app.whenReady().then(async () => {
  cleanOldVersion();
  await startBackend();
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
