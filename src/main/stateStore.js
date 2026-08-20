'use strict';

const Store = require('electron-store');

/**
 * Guarda apenas ESTADO DE UI (não credenciais - isso fica a cargo do próprio
 * mecanismo de sessão do Chromium/partição persistente, conforme item 7).
 * electron-store grava em userData, fora da pasta de instalação (item 17).
 */
const store = new Store({
  name: 'app-state',
  defaults: {
    window: { width: undefined, height: undefined, x: undefined, y: undefined, maximized: false },
    split: { enabled: false, ratio: 0.5, urlPrimary: null, urlSecondary: null },
    theme: 'system',
    notifications: { sound: true, seenIds: [] },
    lastActiveUrl: null,
  },
});

module.exports = {
  get(key) {
    return store.get(key);
  },
  set(key, value) {
    store.set(key, value);
  },
  all() {
    return store.store;
  },
};
