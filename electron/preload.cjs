const { contextBridge, ipcRenderer, webUtils, clipboard } = require("electron");

contextBridge.exposeInMainWorld("micfudiddo", {
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  openAudioFiles: () => ipcRenderer.invoke("dialog:open-audio"),
  openMfsoundFile: () => ipcRenderer.invoke("dialog:open-mfsound"),
  saveMfsoundPath: (defaultName) => ipcRenderer.invoke("dialog:save-mfsound", defaultName),
  openAudioFolders: () => ipcRenderer.invoke("dialog:open-folder"),
  openImageFile: () => ipcRenderer.invoke("dialog:open-image"),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  showItemInFolder: (itemPath) => ipcRenderer.invoke("shell:show-item-in-folder", itemPath),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeToTray: () => ipcRenderer.invoke("window:close-to-tray"),
  closeWithChoice: () => ipcRenderer.invoke("window:close-choice"),
  quitApp: () => ipcRenderer.invoke("window:quit-app"),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  claimUpdateCheck: () => ipcRenderer.invoke("app:claim-update-check"),
  getBackendStatus: () => ipcRenderer.invoke("backend:get-status"),
  retryBackend: () => ipcRenderer.invoke("backend:retry"),
  openBackendLogs: () => ipcRenderer.invoke("backend:open-logs"),
  onBackendStatus: (callback) => {
    const listener = (_event, status) => callback?.(status);
    ipcRenderer.on("backend:status", listener);
    return () => ipcRenderer.removeListener("backend:status", listener);
  },
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke("app:set-launch-at-startup", Boolean(enabled)),
  getLaunchAtStartup: () => ipcRenderer.invoke("app:get-launch-at-startup"),
  updateApp: (downloadUrl) => ipcRenderer.invoke("app:update-app", downloadUrl),
  openSoundSettings: () => ipcRenderer.invoke("system:open-sound-settings"),
  openSoundControlPanel: () => ipcRenderer.invoke("system:open-mmsys"),
  getShortcutConflicts: () => ipcRenderer.invoke("shortcuts:get-conflicts"),
  openTtsWidget: () => ipcRenderer.invoke("window:open-tts-widget"),
  closeTtsWidget: () => ipcRenderer.invoke("window:close-tts-widget"),
  onTtsWidgetClosed: (callback) => {
    const listener = () => callback?.();
    ipcRenderer.on("tts-widget:closed", listener);
    return () => ipcRenderer.removeListener("tts-widget:closed", listener);
  },
  onTtsWidgetFocusInput: (callback) => {
    const listener = () => callback?.();
    ipcRenderer.on("tts-widget:focus-input", listener);
    return () => ipcRenderer.removeListener("tts-widget:focus-input", listener);
  },
  onCloseChoiceRequested: (callback) => {
    const listener = () => callback?.();
    ipcRenderer.on("window:close-choice-requested", listener);
    return () => ipcRenderer.removeListener("window:close-choice-requested", listener);
  },
  onHotkeyTriggered: (callback) => {
    const listener = (event, action) => callback?.(action);
    ipcRenderer.on("hotkey:trigger", listener);
    return () => ipcRenderer.removeListener("hotkey:trigger", listener);
  },
  screen: {
    sources: () => ipcRenderer.invoke("screen:sources"),
    addresses: () => ipcRenderer.invoke("screen:addresses"),
    hostStart: (options) => ipcRenderer.invoke("screen:host-start", options),
    hostStop: (options) => ipcRenderer.invoke("screen:host-stop", options),
    probe: (host) => ipcRenderer.invoke("screen:probe", host),
    discoverStart: () => ipcRenderer.invoke("screen:discover-start"),
    discoverStop: () => ipcRenderer.invoke("screen:discover-stop"),
    setStatus: (status) => ipcRenderer.invoke("screen:status", status),
    takeCommand: () => ipcRenderer.invoke("screen:take-command"),
    notify: (body) => ipcRenderer.invoke("screen:notify", body),
    saveSound: (payload) => ipcRenderer.invoke("screen:save-sound", payload),
    saveImage: (payload) => ipcRenderer.invoke("screen:save-image", payload),
    onRooms: (callback) => {
      const listener = (_event, rooms) => callback?.(rooms);
      ipcRenderer.on("screen:rooms", listener);
      return () => ipcRenderer.removeListener("screen:rooms", listener);
    },
    onCommand: (callback) => {
      const listener = (_event, command) => callback?.(command);
      ipcRenderer.on("screen:command", listener);
      return () => ipcRenderer.removeListener("screen:command", listener);
    }
  },
  audioPathsFromDrop: (files) => Array.from(files || []).map((file) => webUtils.getPathForFile(file)).filter(Boolean)
});
