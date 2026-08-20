"use strict";

const { Notification } = require("electron");
const path = require("path");
const stateStore = require("./stateStore");

/**
 * NotificationManager (itens 3, 4 e 5)
 * - Funciona mesmo com a janela minimizada/na bandeja, pois usa Notification
 *   nativa do SO, independente da janela estar visível.
 * - Evita duplicidade via Set de IDs já notificados, persistido em disco.
 * - Controla som (config ligado/desligado) sem repetir para o mesmo chamado.
 */
class NotificationManager {
  constructor({ onOpenTicket }) {
    this.onOpenTicket = onOpenTicket; // callback (ticketId, url) => void
    const persisted = stateStore.get("notifications");
    this.seenIds = new Set(persisted.seenIds || []);
    this.soundEnabled = persisted.sound !== false;
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
    this._persist();
    return this.soundEnabled;
  }

  isSoundEnabled() {
    return this.soundEnabled;
  }

  /**
   * ticket: { id, number, title, description, priority, createdAt, url }
   */
  notifyNewTicket(ticket) {
    const uniqueId = String(ticket.id);
    if (this.seenIds.has(uniqueId)) return false; // já notificado, ignora

    const notification = new Notification({
      title: `🔔 Chamado #${ticket.number}`,
      body: ticket.title || ticket.description || "Novo chamado recebido",
      silent: !this.soundEnabled, // controla som sem tocar repetidamente
      icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
    });

    notification.on("click", () => {
      if (this.onOpenTicket) this.onOpenTicket(ticket.id, ticket.url);
    });

    notification.show();

    this.seenIds.add(uniqueId);
    this._persist();
    return true;
  }

  /** Limpa IDs antigos além de um limite, para não crescer indefinidamente. */
  pruneOldEntries(maxEntries = 500) {
    if (this.seenIds.size <= maxEntries) return;
    const excess = this.seenIds.size - maxEntries;
    const it = this.seenIds.values();
    for (let i = 0; i < excess; i++) {
      this.seenIds.delete(it.next().value);
    }
    this._persist();
  }

  _persist() {
    stateStore.set("notifications", {
      sound: this.soundEnabled,
      seenIds: Array.from(this.seenIds),
    });
  }
}

module.exports = { NotificationManager };
