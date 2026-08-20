"use strict";

const { session } = require("electron");
const { BASE_URL, SESSION_PARTITION } = require("./config");

/**
 * Centraliza o ciclo de vida dos cookies da sessão do sistema.
 * Valores nunca deixam o processo principal: a UI recebe apenas metadados.
 */
class CookieManager {
  constructor() {
    this.session = session.fromPartition(SESSION_PARTITION);
    this.started = false;
    this.lastChangedAt = null;
    this.handleCookieChanged = (_event, _cookie, _cause, removed) => {
      this.lastChangedAt = Date.now();
      if (removed) return;
    };
  }

  async start() {
    if (this.started) return;
    this.session.cookies.on("changed", this.handleCookieChanged);
    try {
      await this.session.cookies.get({ url: BASE_URL });
      this.started = true;
    } catch (err) {
      this.session.cookies.removeListener("changed", this.handleCookieChanged);
      throw err;
    }
  }

  stop() {
    if (!this.started) return;
    this.session.cookies.removeListener("changed", this.handleCookieChanged);
    this.started = false;
  }

  async getMetadata() {
    await this.start();
    const cookies = await this.session.cookies.get({ url: BASE_URL });
    return cookies.map(
      ({ name, domain, path, secure, httpOnly, expirationDate }) => ({
        name,
        domain,
        path,
        secure,
        httpOnly,
        session: expirationDate === undefined,
        expirationDate: expirationDate || null,
      }),
    );
  }

  async clear() {
    await this.start();
    await this.session.clearStorageData({ storages: ["cookies"] });
    await this.session.cookies.flushStore();
  }
}

module.exports = { CookieManager };
