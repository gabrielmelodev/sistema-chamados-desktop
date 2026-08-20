"use strict";

const { app, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");

/**
 * UpdateManager (itens 15, 16 e 17)
 * - Verifica e baixa a atualização em background, sem interromper o usuário.
 * - Só notifica quando o download termina, oferecendo reiniciar quando
 *   conveniente.
 * - A preservação de sessão/dados entre versões é garantida por eles
 *   ficarem em userData (fora da pasta de instalação) - ver config.js.
 */
class UpdateManager {
  constructor({
    onUpdateReady,
    onUpdateStatus,
    onUpdateAvailable,
    getStateSnapshot,
    persistState,
  }) {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    this.onUpdateReady = onUpdateReady;
    this.onUpdateStatus = onUpdateStatus;
    this.onUpdateAvailable = onUpdateAvailable;
    this.getStateSnapshot = getStateSnapshot;
    this.persistState = persistState;
    this.checking = false;
    this.lastCheckAt = 0;
    this.notifiedVersion = null;

    autoUpdater.allowDowngrade = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("update-available", (info) => {
      if (this.notifiedVersion !== info.version) {
        this.notifiedVersion = info.version;
        const notification = new Notification({
          title: "Nova atualização disponível",
          body: `A versão ${info.version} está sendo baixada.`,
          icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
        });
        notification.on("click", () => this.onUpdateAvailable?.());
        notification.show();
      }
      this.onUpdateStatus?.({ state: "available", version: info.version });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.onUpdateStatus?.({
        state: "downloading",
        percent: Math.round(progress.percent),
      });
    });

    autoUpdater.on("update-downloaded", () => {
      // Salva o estado atual (item 16) antes de permitir o restart.
      if (this.getStateSnapshot && this.persistState) {
        this.persistState(this.getStateSnapshot());
      }
      if (this.onUpdateReady) this.onUpdateReady();
      this.onUpdateStatus?.({ state: "downloaded" });
    });

    autoUpdater.on("error", (err) => {
      log.error("[UpdateManager] erro na atualização:", err);
      this.onUpdateStatus?.({ state: "error" });
    });
  }

  checkForUpdates() {
    if (
      !app.isPackaged ||
      this.checking ||
      Date.now() - this.lastCheckAt < 15 * 60 * 1000
    ) {
      return;
    }
    this.checking = true;
    this.lastCheckAt = Date.now();
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err) => {
        log.error("[UpdateManager] falha ao verificar atualização:", err);
      })
      .finally(() => {
        this.checking = false;
      });
  }

  /** Chamado quando o usuário aceita reiniciar para aplicar a atualização. */
  quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
  }
}

module.exports = { UpdateManager };
