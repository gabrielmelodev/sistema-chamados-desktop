"use strict";

(function () {
  // =====================================================
  // NAVEGAÇÃO
  // =====================================================
  const backBtn = document.getElementById("back");
  const forwardBtn = document.getElementById("forward");
  const reloadBtn = document.getElementById("reload");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.chamadosApp?.goBack?.();
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener("click", () => {
      window.chamadosApp?.goForward?.();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      window.chamadosApp?.reload?.();
    });
  }

  // =====================================================
  // CONTROLES DA JANELA (Electron only)
  // =====================================================
  if (window.electronAPI || window.electronAPI?.minimize) {
    document.getElementById("minimize")?.addEventListener("click", () => {
      window.electronAPI?.minimize?.();
    });

    document.getElementById("maximize")?.addEventListener("click", () => {
      window.electronAPI?.maximize?.();
    });

    document.getElementById("close")?.addEventListener("click", () => {
      window.electronAPI?.close?.();
    });
  }

  // =====================================================
  // NOTIFICAÇÕES
  // =====================================================
  const notificationBtn = document.getElementById("notifications");
  const badge = document.getElementById("ticket-badge");

  if (notificationBtn && badge) {
    notificationBtn.addEventListener("click", () => {
      // Opcional: abrir drawer/modal de notificações quando clicado
      console.log("Notificações clicadas");
    });

    // Listener de contagem de não lidos (Electron)
    if (window.chamadosApp?.onUnreadCountChanged) {
      window.chamadosApp.onUnreadCountChanged((count) => {
        if (count > 0) {
          badge.classList.remove("hidden");
          badge.textContent = String(count > 99 ? "99+" : count);
        } else {
          badge.classList.add("hidden");
        }
      });
    }
  }

  // =====================================================
  // STATUS DE CONEXÃO
  // =====================================================
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  const applyConnectionStatus = ({ state, message }) => {
    if (!statusDot || !statusText) return;
    statusDot.classList.toggle("online", state === "online");
    statusDot.classList.toggle("loading", state === "checking");
    statusDot.classList.toggle("offline", state === "offline");
    statusText.textContent = message || "Verificando...";
  };

  window.chamadosApp?.onConnectionStatusChanged?.(applyConnectionStatus);

  window.addEventListener("online", () => {
    applyConnectionStatus({ state: "checking", message: "Verificando..." });
  });

  window.addEventListener("offline", () => {
    applyConnectionStatus({ state: "offline", message: "Sem conexão" });
  });

  // Verifica status inicial
  if (navigator.onLine) {
    applyConnectionStatus({ state: "checking", message: "Verificando..." });
  } else {
    applyConnectionStatus({ state: "offline", message: "Sem conexão" });
  }

  // =====================================================
  // RECURSOS ELECTRON (Split-screen, Som, Update)
  // =====================================================

  const btnSplit = document.getElementById("btn-split");
  const btnSound = document.getElementById("btn-sound");
  const btnLogout = document.getElementById("btn-logout");
  const updateBanner = document.getElementById("update-banner");
  const divider = document.getElementById("split-divider");

  if (window.chamadosApp) {
    // SPLIT-SCREEN
    if (btnSplit) {
      btnSplit.hidden = false;
      btnSplit.addEventListener("click", async () => {
        const enabled = await window.chamadosApp.toggleSplit?.(
          btnSplit.getAttribute("aria-pressed") === "false",
        );
        if (enabled !== undefined) {
          btnSplit.setAttribute("aria-pressed", String(enabled));
          if (divider) divider.hidden = !enabled;
        }
      });
    }

    // SOM DE NOTIFICAÇÕES
    if (btnSound) {
      btnSound.hidden = false;
      const applySoundState = (enabled) => {
        btnSound.setAttribute("aria-pressed", String(enabled));
        btnSound.setAttribute(
          "aria-label",
          enabled
            ? "Desativar som das notificações"
            : "Ativar som das notificações",
        );
        btnSound.title = enabled
          ? "Som das notificações: ativado"
          : "Som das notificações: desativado";
      };

      window.chamadosApp.getSoundEnabled?.().then(applySoundState);
      btnSound.addEventListener("click", async () => {
        const current = btnSound.getAttribute("aria-pressed") === "true";
        const enabled = await window.chamadosApp.toggleSound?.(!current);
        if (enabled !== undefined) {
          applySoundState(enabled);
        }
      });
    }

    // ENCERRAR SESSAO: remove cookies HttpOnly e volta para o login.
    if (btnLogout) {
      btnLogout.hidden = false;
      btnLogout.addEventListener("click", async () => {
        if (window.confirm("Deseja encerrar a sessão neste computador?")) {
          await window.chamadosApp.clearSession?.();
        }
      });
    }

    // ATUALIZAÇÃO PRONTA
    if (updateBanner) {
      const updateNowButton = document.getElementById("btn-update-now");
      if (updateNowButton) updateNowButton.hidden = true;

      window.chamadosApp.onUpdateReady?.(() => {
        updateBanner.querySelector(".update-text").textContent =
          "Nova atualização disponível. Reiniciar agora?";
        if (updateNowButton) updateNowButton.hidden = false;
        updateBanner.hidden = false;
      });

      window.chamadosApp.onUpdateStatus?.(({ state, percent, version }) => {
        if (state === "available") {
          updateBanner.querySelector(".update-text").textContent =
            `Nova atualização disponível${version ? ` (${version})` : ""}. Baixando...`;
          if (updateNowButton) updateNowButton.hidden = true;
          updateBanner.hidden = false;
        } else if (state === "downloading") {
          updateBanner.querySelector(".update-text").textContent =
            `Baixando atualização... ${percent || 0}%`;
          if (updateNowButton) updateNowButton.hidden = true;
          updateBanner.hidden = false;
        } else if (state === "downloaded") {
          updateBanner.querySelector(".update-text").textContent =
            "Atualização pronta. Reiniciar agora?";
          if (updateNowButton) updateNowButton.hidden = false;
          updateBanner.hidden = false;
        }
      });

      document
        .getElementById("btn-update-now")
        ?.addEventListener("click", () => {
          window.chamadosApp.restartForUpdate?.();
        });

      document
        .getElementById("btn-update-later")
        ?.addEventListener("click", () => {
          updateBanner.hidden = true;
        });
    }

    // DIVISOR ARRASTÁVEL
    if (divider) {
      let dragging = false;
      divider.addEventListener("mousedown", () => {
        dragging = true;
        divider.classList.add("dragging");
      });

      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const ratio = e.clientX / window.innerWidth;
        window.chamadosApp.setSplitRatio?.(ratio);
      });

      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        divider.classList.remove("dragging");
      });
    }
  }

  // =====================================================
  // LAYOUT RESPONSIVO
  // =====================================================
  if (window.chamadosApp?.onLayoutModeChanged) {
    window.chamadosApp.onLayoutModeChanged(({ mode }) => {
      document.body.setAttribute("data-layout-mode", mode);
    });
  }

  window.chamadosApp?.onNavigationStateChanged?.(
    ({ canGoBack, canGoForward }) => {
      if (backBtn) backBtn.disabled = true;
      if (forwardBtn) forwardBtn.disabled = !canGoForward;
    },
  );

  window.chamadosApp?.onSiteThemeChanged?.((theme) => {
    document.documentElement.dataset.theme = theme;
  });
})();
