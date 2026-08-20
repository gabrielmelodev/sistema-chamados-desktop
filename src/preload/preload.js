"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chamadosApp", {
  // Split-screen
  toggleSplit: (enabled) => ipcRenderer.invoke("toolbar:toggle-split", enabled),
  setSplitRatio: (ratio) => ipcRenderer.send("toolbar:set-split-ratio", ratio),

  // Notificações
  toggleSound: (enabled) => ipcRenderer.invoke("toolbar:toggle-sound", enabled),
  getSoundEnabled: () => ipcRenderer.invoke("toolbar:get-sound"),

  // Navegação
  goBack: () => ipcRenderer.send("toolbar:go-back"),
  goForward: () => ipcRenderer.send("toolbar:go-forward"),
  reload: () => ipcRenderer.send("toolbar:reload"),
  navigate: (panel, url) =>
    ipcRenderer.send("toolbar:navigate", { panel, url }),

  // Sessão. Apenas metadados são expostos; valores de cookie ficam no main.
  getCookieMetadata: () => ipcRenderer.invoke("session:get-cookie-metadata"),
  clearSession: () => ipcRenderer.invoke("session:clear"),

  // Update
  restartForUpdate: () => ipcRenderer.send("app:restart-for-update"),

  // Externo
  openExternal: (url) => ipcRenderer.send("app:open-external", url),

  // Listeners
  onLayoutModeChanged: (callback) =>
    ipcRenderer.on("layout:mode-changed", (_e, data) => callback(data)),
  onUnreadCountChanged: (callback) =>
    ipcRenderer.on("notifications:unread-count", (_e, count) =>
      callback(count),
    ),
  onConnectionStatusChanged: (callback) =>
    ipcRenderer.on("connection:status-changed", (_e, status) =>
      callback(status),
    ),
  onUpdateReady: (callback) => ipcRenderer.on("update:ready", () => callback()),
  onUpdateStatus: (callback) =>
    ipcRenderer.on("update:status", (_e, status) => callback(status)),
  onNavigationStateChanged: (callback) =>
    ipcRenderer.on("navigation:state-changed", (_e, state) => callback(state)),
  onSiteThemeChanged: (callback) =>
    ipcRenderer.on("site:theme-changed", (_e, theme) => callback(theme)),
});

// API de controles Windows (exposta no global, não em chamadosApp)
contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
});
