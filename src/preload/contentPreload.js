"use strict";
const { ipcRenderer } = require("electron");

const SIDEBAR_SELECTORS = [
  "aside",
  '[role="complementary"]',
  '[class*="sidebar" i]',
  '[class*="side-bar" i]',
  '[id*="sidebar" i]',
  '[class*="drawer" i]',
  '[class*="offcanvas" i]',
];
const CLOSE_LABEL = /fechar|close|recolher|collapse/i;

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function closeOpenSidebars() {
  const panels = document.querySelectorAll(SIDEBAR_SELECTORS.join(","));
  for (const panel of panels) {
    if (!isVisible(panel)) continue;
    const closeButton = Array.from(
      panel.querySelectorAll("button, [role=button], a"),
    ).find((control) => {
      const label = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""} ${control.textContent || ""}`;
      return CLOSE_LABEL.test(label) && isVisible(control);
    });
    closeButton?.click();
  }
}

function reportTheme() {
  const root = document.documentElement;
  const values = [root, document.body].filter(Boolean);
  const isDark = values.some((element) => {
    const attributes = `${element.className} ${element.getAttribute("data-theme") || ""} ${element.getAttribute("data-mode") || ""}`;
    return /(^|[\s_-])dark([\s_-]|$)/i.test(attributes);
  });
  const prefersDark = window.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches;
  ipcRenderer.send(
    "site:theme-changed",
    isDark || prefersDark ? "dark" : "light",
  );
}

window.addEventListener("DOMContentLoaded", () => {
  reportTheme();
  closeOpenSidebars();
  const observer = new MutationObserver(reportTheme);
  const options = {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-mode"],
  };
  observer.observe(document.documentElement, options);
  if (document.body) observer.observe(document.body, options);

  const sidebarObserver = new MutationObserver(closeOpenSidebars);
  sidebarObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-expanded", "aria-hidden", "style"],
  });
});

/**
 * Preload aplicado dentro do BrowserView que carrega o site real de
 * chamados.formosa.go.gov.br. Mantido propositalmente enxuto: a sessão
 * (cookies, tokens, storage) é gerenciada pelo próprio Chromium através da
 * partição 'persist:sistema-chamados' (ver config.js / item 7 dos
 * requisitos) — este preload NÃO deve copiar ou interceptar credenciais.
 *
 * Ponto de extensão futuro: quando a estrutura real da SPA for conhecida,
 * este arquivo pode expor um observer de DOM/rota para detectar novos
 * chamados client-side como alternativa/complemento ao polling da API feito
 * pelo SyncManager no processo principal.
 */

window.addEventListener("DOMContentLoaded", () => {
  document.title = document.title || "Sistema de Chamados";
});
