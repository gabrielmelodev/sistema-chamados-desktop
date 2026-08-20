"use strict";

const { BrowserWindow, BrowserView, screen } = require("electron");
const path = require("path");
const { BASE_URL, LOGIN_URL, SESSION_PARTITION } = require("./config");

// Altura da toolbar nativa, em pixels lógicos (CSS px). O restante da área
// é sempre recalculado dinamicamente -> ver layout responsivo (item 1/2).
const TOOLBAR_HEIGHT = 36;

/**
 * ResponsiveLayoutManager (item 2 dos requisitos)
 * Não escala tudo proporcionalmente: define breakpoints e ajusta a divisão
 * do split-screen e a altura útil de conteúdo de acordo com o tamanho real
 * da janela, preservando hierarquia visual.
 */
class ResponsiveLayoutManager {
  static classify(width) {
    if (width < 1024) return "compact";
    if (width < 1600) return "normal";
    return "expanded";
  }
}

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.viewPrimary = null; // painel esquerdo / modo normal
    this.viewSecondary = null; // painel direito (modo dividido)
    this.splitEnabled = false;
    this.splitRatio = 0.5; // 50/50 por padrão, arrastável (item 10)
    this.onWindowStateChange = null; // callback opcional (persistência de estado)
  }

  createMainWindow(initialState = {}) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: workAreaWidth, height: workAreaHeight } =
      primaryDisplay.workAreaSize;
    const width = Math.min(
      workAreaWidth,
      Math.max(560, initialState.width || Math.round(workAreaWidth * 0.85)),
    );
    const height = Math.min(
      workAreaHeight,
      Math.max(360, initialState.height || Math.round(workAreaHeight * 0.85)),
    );
    const x = Number.isFinite(initialState.x)
      ? Math.max(0, Math.min(initialState.x, workAreaWidth - width))
      : undefined;
    const y = Number.isFinite(initialState.y)
      ? Math.max(0, Math.min(initialState.y, workAreaHeight - height))
      : undefined;

    this.mainWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      minWidth: 560,
      minHeight: 360,
      show: false,
      frame: false,
      backgroundColor: "#1e1f24",
      autoHideMenuBar: true,
      icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Toolbar nativa (HTML local, não o site) ocupa o topo da janela.
    this.mainWindow.loadFile(
      path.join(__dirname, "..", "renderer", "index.html"),
    );

    this.mainWindow.once("ready-to-show", () => {
      if (initialState.maximized) this.mainWindow.maximize();
      this.mainWindow.show();
    });

    this.mainWindow.on("resize", () => this._relayout());
    this.mainWindow.on("close", () => this._notifyStateChange());

    return this.mainWindow;
  }

  /** Cria (ou reutiliza) as BrowserViews que carregam o sistema web real. */
  ensureViews(initialState = {}) {
    if (!this.viewPrimary) {
      this.viewPrimary = this._createView();
      this._bindViewEvents(this.viewPrimary, "primary");
      this.viewPrimary.webContents.loadURL(
        this._getRestorableUrl(initialState.urlPrimary),
      );
      this.mainWindow.addBrowserView(this.viewPrimary);
    }
    this._relayout();
  }

  _getRestorableUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.origin === BASE_URL ? parsed.toString() : LOGIN_URL;
    } catch {
      return LOGIN_URL;
    }
  }

  _createView() {
    return new BrowserView({
      webPreferences: {
        partition: SESSION_PARTITION, // sessão persistente e compartilhada (item 7)
        preload: path.join(__dirname, "..", "preload", "contentPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  }

  toggleSplit(enabled) {
    this.splitEnabled = enabled;
    if (enabled && !this.viewSecondary) {
      this.viewSecondary = this._createView();
      this._bindViewEvents(this.viewSecondary, "secondary");
      this.viewSecondary.webContents.loadURL(BASE_URL);
      this.mainWindow.addBrowserView(this.viewSecondary);
    }
    if (!enabled && this.viewSecondary) {
      this.mainWindow.removeBrowserView(this.viewSecondary);
      this.viewSecondary.webContents.destroy();
      this.viewSecondary = null;
    }
    this._relayout();
  }

  setSplitRatio(ratio) {
    // Limita entre 20% e 80% para nunca esconder completamente um painel.
    this.splitRatio = Math.min(0.8, Math.max(0.2, ratio));
    this._relayout();
  }

  _bindViewEvents(view, panel) {
    const sendNavigationState = () => {
      const history = view.webContents.navigationHistory;
      const currentUrl = view.webContents.getURL();
      this.mainWindow?.webContents.send("navigation:state-changed", {
        panel,
        canGoBack: history.canGoBack() || !this._isLoginUrl(currentUrl),
        canGoForward: history.canGoForward(),
      });
    };
    view.webContents.on("did-navigate", sendNavigationState);
    view.webContents.on("did-navigate-in-page", sendNavigationState);
    view.webContents.on("did-finish-load", sendNavigationState);
  }

  goBack(panel = "primary") {
    const view = panel === "secondary" ? this.viewSecondary : this.viewPrimary;
    if (view?.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
    } else if (view && !this._isLoginUrl(view.webContents.getURL())) {
      view.webContents.loadURL(LOGIN_URL);
    }
  }

  _isLoginUrl(url) {
    return url === LOGIN_URL || url.startsWith(`${LOGIN_URL}?`);
  }

  goForward(panel = "primary") {
    const view = panel === "secondary" ? this.viewSecondary : this.viewPrimary;
    if (view?.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward();
    }
  }

  reload(panel = "primary") {
    const view = panel === "secondary" ? this.viewSecondary : this.viewPrimary;
    view?.webContents.reload();
  }

  /** Recalcula bounds das views conforme tamanho da janela e modo atual. */
  _relayout() {
    if (!this.mainWindow || !this.viewPrimary) return;
    const [width, height] = this.mainWindow.getContentSize();
    const contentHeight = Math.max(0, height - TOOLBAR_HEIGHT);
    const layoutMode = ResponsiveLayoutManager.classify(width);

    if (this.splitEnabled && this.viewSecondary) {
      const leftWidth = Math.round(width * this.splitRatio);
      const rightWidth = width - leftWidth;
      this.viewPrimary.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width: leftWidth,
        height: contentHeight,
      });
      this.viewSecondary.setBounds({
        x: leftWidth,
        y: TOOLBAR_HEIGHT,
        width: rightWidth,
        height: contentHeight,
      });
    } else {
      this.viewPrimary.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width,
        height: contentHeight,
      });
    }

    if (this.mainWindow.webContents) {
      this.mainWindow.webContents.send("layout:mode-changed", {
        mode: layoutMode,
        width,
        height,
      });
    }
  }

  /** Navega um painel específico sem afetar o outro (item 11). */
  navigatePanel(panel, url) {
    const view = panel === "secondary" ? this.viewSecondary : this.viewPrimary;
    if (view) view.webContents.loadURL(url);
  }

  focusAndShow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    if (!this.mainWindow.isVisible()) this.mainWindow.show();
    this.mainWindow.focus();
  }

  getStateSnapshot() {
    if (!this.mainWindow) return null;
    const bounds = this.mainWindow.getBounds();
    return {
      ...bounds,
      maximized: this.mainWindow.isMaximized(),
      splitEnabled: this.splitEnabled,
      splitRatio: this.splitRatio,
      urlPrimary: this.viewPrimary
        ? this.viewPrimary.webContents.getURL()
        : LOGIN_URL,
      urlSecondary: this.viewSecondary
        ? this.viewSecondary.webContents.getURL()
        : null,
    };
  }

  _notifyStateChange() {
    if (this.onWindowStateChange)
      this.onWindowStateChange(this.getStateSnapshot());
  }
}

module.exports = { WindowManager, ResponsiveLayoutManager, TOOLBAR_HEIGHT };
