"use strict";

const { app, ipcMain, shell, session } = require("electron");
const path = require("path");

if (process.argv.includes("--dev")) {
  require("electron-reload")(path.join(__dirname, ".."), {
    electron: process.execPath,
    hardResetMethod: "exit",
  });
}

const { WindowManager } = require("./windowManager");
const { NotificationManager } = require("./notificationManager");
const { SyncManager } = require("./syncManager");
const { TrayManager } = require("./trayManager");
const { UpdateManager } = require("./updateManager");
const { ApiClient } = require("./apiClient");
const { CookieManager } = require("./cookieManager");
const { AuthTokenStore } = require("./authTokenStore");
const stateStore = require("./stateStore");
const {
  BASE_URL,
  API_BASE,
  LOGIN_URL,
  SESSION_PARTITION,
  TICKET_URL_TEMPLATE,
} = require("./config");

/**
 * Converte um item de /api/v1/notifications no formato esperado pelo
 * NotificationManager. Usamos o ID DA NOTIFICAÇÃO (evento) como identificador
 * único de dedupe, não o ID do chamado, pois um mesmo chamado pode gerar
 * vários eventos (CREATED, ACCEPTED, REASSIGNED, CLOSED) que merecem
 * notificações separadas.
 */
function mapNotificationToTicketEvent(n) {
  return {
    id: String(n.id),
    ticketId: String(n.ticketId),
    number: String(n.protocol),
    type: n.type || null,
    title: n.title || "Atualização de chamado",
    description: n.message || "Há uma nova atualização no chamado.",
    priority: null,
    createdAt: n.createdAt,
    url: TICKET_URL_TEMPLATE(n.ticketId),
  };
}

// Instância única (item 18: comportamento de app nativo, não abre várias janelas soltas).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let windowManager;
  let notificationManager;
  let syncManager;
  let trayManager;
  let updateManager;
  let isQuitting = false;
  let siteTheme = "light";

  app.on("second-instance", () => {
    if (windowManager) windowManager.focusAndShow();
  });

  app.whenReady().then(async () => {
    const savedWindowState = stateStore.get("window");
    const savedSplit = stateStore.get("split");
    const cookieManager = new CookieManager();
    try {
      await cookieManager.start();
    } catch (err) {
      console.error("[CookieManager] falha ao iniciar sessão:", err.message);
    }

    const authTokenStore = new AuthTokenStore();
    const apiClient = new ApiClient({
      accessToken: authTokenStore.get(),
      onSessionExpired: () => {
        apiSessionBlocked = true;
        authTokenStore.clear();
        console.warn(
          "[main] sessão da API indisponível; mantendo a página atual",
        );
      },
    });
    const setConnectionStatus = (state, message) => {
      windowManager?.mainWindow?.webContents.send("connection:status-changed", {
        state,
        message,
      });
    };
    setConnectionStatus("checking", "Verificando...");
    const siteSession = session.fromPartition(SESSION_PARTITION);
    const requestAuthState = new Map();
    siteSession.webRequest.onBeforeSendHeaders(
      { urls: [`${BASE_URL}/*`] },
      (details, callback) => {
        const authorizationHeader = Object.entries(details.requestHeaders).find(
          ([name]) => name.toLowerCase() === "authorization",
        )?.[1];
        const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
        if (details.url.startsWith(`${API_BASE}/`)) {
          requestAuthState.set(details.id, Boolean(match?.[1]));
        }
        if (match?.[1]) {
          apiClient.setAccessToken(match[1]);
          authTokenStore.set(match[1]);
        }
        callback({ requestHeaders: details.requestHeaders });
      },
    );
    siteSession.webRequest.onCompleted(
      { urls: [`${API_BASE}/*`] },
      (details) => {
        const hasAuthorization = requestAuthState.get(details.id) || false;
        requestAuthState.delete(details.id);
        if (details.statusCode === 401) {
          console.warn(
            `[AuthMonitor] HTTP 401 em ${details.method} ${details.url} ` +
              `(Authorization: ${hasAuthorization ? "presente" : "ausente"})`,
          );
        }
      },
    );

    windowManager = new WindowManager();
    windowManager.createMainWindow(savedWindowState);
    windowManager.mainWindow.webContents.on("did-finish-load", () => {
      windowManager.mainWindow?.webContents.send(
        "site:theme-changed",
        siteTheme,
      );
    });
    windowManager.ensureViews({
      urlPrimary: savedSplit?.urlPrimary,
    });

    if (savedSplit && savedSplit.enabled) {
      windowManager.toggleSplit(true);
      windowManager.setSplitRatio(savedSplit.ratio || 0.5);
      if (savedSplit.urlSecondary) {
        windowManager.navigatePanel("secondary", savedSplit.urlSecondary);
      }
    }

    // --- Notificações (itens 3, 4, 5) ---
    notificationManager = new NotificationManager({
      onOpenTicket: (ticketId, url) => {
        windowManager.focusAndShow();
        windowManager.navigatePanel("primary", url || LOGIN_URL);
      },
    });

    // --- Tray (mantém app rodando mesmo com janela escondida) ---
    trayManager = new TrayManager({
      onShow: () => windowManager.focusAndShow(),
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
    });

    // --- API real (item 7: usa a sessão do Chromium, nunca copia tokens) ---
    let apiSessionBlocked = false;
    let isAuthenticated = false;
    const isSiteLoginPage = () => {
      const url = windowManager.viewPrimary?.webContents.getURL() || "";
      return !url || url === LOGIN_URL || url.startsWith(`${LOGIN_URL}?`);
    };
    windowManager.viewPrimary.webContents.on("did-finish-load", () => {
      isAuthenticated = !isSiteLoginPage();
      if (isAuthenticated) {
        apiSessionBlocked = false;
        apiClient.markSessionAvailable();
      }
    });

    // --- Sync (item 9) ---
    syncManager = new SyncManager({
      fetchTickets: async () => {
        if (!isAuthenticated || apiSessionBlocked) return null;
        try {
          const notifications = await apiClient.getUnreadNotifications(0, 20);
          setConnectionStatus("online", "Online");
          return notifications.map(mapNotificationToTicketEvent);
        } catch (err) {
          setConnectionStatus("offline", "Sem conexão");
          throw err;
        }
      },
      onTicketsUpdated: async (events) => {
        for (const event of events) {
          notificationManager.notifyNewTicket(event);
        }
        notificationManager.pruneOldEntries();

        // Contador real vindo da API (não apenas o que foi notificado nesta
        // rodada), refletido no tray e no badge da toolbar.
        try {
          const unreadCount = await apiClient.getUnreadCount();
          trayManager.setUnreadCount(unreadCount);
          windowManager.mainWindow?.webContents.send(
            "notifications:unread-count",
            unreadCount,
          );
        } catch (err) {
          setConnectionStatus("offline", "Sem conexão");
          console.error("[main] falha ao obter unread-count:", err.message);
        }
      },
    });
    syncManager.start();

    // Mantém a sessão viva independentemente do polling de notificações.
    setInterval(
      () => {
        if (isAuthenticated && !apiSessionBlocked) apiClient.refreshAuth();
      },
      10 * 60 * 1000,
    ); // a cada 10min

    windowManager.mainWindow.on("focus", () => syncManager.setForeground(true));
    windowManager.mainWindow.on("blur", () => syncManager.setForeground(false));
    windowManager.mainWindow.on("minimize", () =>
      syncManager.setForeground(false),
    );
    windowManager.mainWindow.on("restore", () =>
      syncManager.setForeground(true),
    );

    // Minimizar para a bandeja em vez de fechar, para notificações continuarem.
    windowManager.mainWindow.on("close", (event) => {
      if (!isQuitting) {
        event.preventDefault();
        windowManager.mainWindow.hide();
      } else {
        stateStore.set("window", windowManager.getStateSnapshot());
        stateStore.set("split", {
          enabled: windowManager.splitEnabled,
          ratio: windowManager.splitRatio,
          urlPrimary: windowManager.viewPrimary?.webContents.getURL(),
          urlSecondary:
            windowManager.viewSecondary?.webContents.getURL() || null,
        });
      }
    });

    // --- Auto update (itens 15, 16, 17) ---
    updateManager = new UpdateManager({
      getStateSnapshot: () => windowManager.getStateSnapshot(),
      persistState: (snapshot) => {
        stateStore.set("window", snapshot);
        stateStore.set("split", {
          enabled: snapshot.splitEnabled,
          ratio: snapshot.splitRatio,
          urlPrimary: snapshot.urlPrimary,
          urlSecondary: snapshot.urlSecondary,
        });
      },
      onUpdateReady: () => {
        windowManager.mainWindow?.webContents.send("update:ready");
      },
      onUpdateAvailable: () => {
        windowManager.focusAndShow();
      },
      onUpdateStatus: (status) => {
        windowManager.mainWindow?.webContents.send("update:status", status);
      },
    });
    updateManager.checkForUpdates();
    setInterval(() => updateManager.checkForUpdates(), 4 * 60 * 60 * 1000); // a cada 4h

    // --- IPC: comandos vindos da toolbar (renderer) ---

    // Split-screen
    ipcMain.handle("toolbar:toggle-split", (_e, enabled) => {
      windowManager.toggleSplit(enabled);
      return windowManager.splitEnabled;
    });
    ipcMain.on("toolbar:set-split-ratio", (_e, ratio) =>
      windowManager.setSplitRatio(ratio),
    );

    // Notificações
    ipcMain.handle("toolbar:toggle-sound", (_e, enabled) => {
      return notificationManager.setSoundEnabled(enabled);
    });
    ipcMain.handle("toolbar:get-sound", () =>
      notificationManager.isSoundEnabled(),
    );

    // Navegação
    ipcMain.on("toolbar:go-back", () => windowManager.goBack());
    ipcMain.on("toolbar:go-forward", () => windowManager.goForward());
    ipcMain.on("toolbar:reload", () => windowManager.reload());
    ipcMain.on("toolbar:navigate", (_e, { panel, url }) =>
      windowManager.navigatePanel(panel, url),
    );

    ipcMain.on("site:theme-changed", (_e, theme) => {
      siteTheme = theme === "dark" ? "dark" : "light";
      windowManager.mainWindow?.webContents.send("site:theme-changed", theme);
    });

    // Update
    ipcMain.on("app:restart-for-update", () => updateManager.quitAndInstall());

    // Externo
    ipcMain.on("app:open-external", (_e, url) => shell.openExternal(url));

    // Sessão: cookies HttpOnly são limpos no processo principal.
    ipcMain.handle("session:get-cookie-metadata", () =>
      cookieManager.getMetadata(),
    );
    ipcMain.handle("session:clear", async () => {
      await cookieManager.clear();
      authTokenStore.clear();
      apiClient.clearAccessToken();
      windowManager.navigatePanel("primary", LOGIN_URL);
      if (windowManager.viewSecondary) {
        windowManager.navigatePanel("secondary", LOGIN_URL);
      }
      return true;
    });

    // Controles da janela
    ipcMain.on("window:minimize", () => windowManager.mainWindow?.minimize());
    ipcMain.on("window:maximize", () => {
      if (windowManager.mainWindow?.isMaximized()) {
        windowManager.mainWindow.restore();
      } else {
        windowManager.mainWindow?.maximize();
      }
    });
    ipcMain.on("window:close", () => windowManager.mainWindow?.close());
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    // No Windows, o app continua vivo na bandeja (item 3: notificações
    // funcionam mesmo com a janela minimizada/escondida).
    if (process.platform !== "darwin") {
      // não chama app.quit() aqui de propósito
    }
  });
}
