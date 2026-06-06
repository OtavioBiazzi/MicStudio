const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("micfudiddo", {
  openAudioFiles: () => ipcRenderer.invoke("dialog:open-audio"),
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
  updateApp: (downloadUrl) => ipcRenderer.invoke("app:update-app", downloadUrl),
  openSoundSettings: () => ipcRenderer.invoke("system:open-sound-settings"),
  openSoundControlPanel: () => ipcRenderer.invoke("system:open-mmsys"),
  getShortcutConflicts: () => ipcRenderer.invoke("shortcuts:get-conflicts"),
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
  audioPathsFromDrop: (files) => Array.from(files || []).map((file) => webUtils.getPathForFile(file)).filter(Boolean)
});
