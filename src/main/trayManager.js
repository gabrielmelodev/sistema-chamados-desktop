'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

class TrayManager {
  constructor({ onShow, onQuit }) {
    const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');
    this.tray = new Tray(nativeImage.createFromPath(iconPath));
    this.tray.setToolTip('Sistema de Chamados');

    const menu = Menu.buildFromTemplate([
      { label: 'Abrir', click: onShow },
      { type: 'separator' },
      { label: 'Sair', click: onQuit },
    ]);
    this.tray.setContextMenu(menu);
    this.tray.on('click', onShow);
  }

  /** Atualiza contador de chamados não lidos exibido no tooltip da bandeja. */
  setUnreadCount(count) {
    this.tray.setToolTip(count > 0 ? `Sistema de Chamados — ${count} não lido(s)` : 'Sistema de Chamados');
  }

  destroy() {
    if (this.tray) this.tray.destroy();
  }
}

module.exports = { TrayManager };
