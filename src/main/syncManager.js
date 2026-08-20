"use strict";

/**
 * SyncManager (item 9)
 * Responsável por verificar novos chamados/alterações periodicamente, com
 * intervalo adaptativo: mais frequente com a janela em foco, mais espaçado
 * em segundo plano. A implementação atual usa polling REST; WebSocket/SSE
 * pode ser conectado futuramente quando o backend disponibilizar o canal.
 *
 * `fetchTickets` é fornecido pela integração real e consulta as notificações
 * autenticadas da API com o token Bearer do usuário, mantido no processo
 * principal. Este manager permanece independente da API e do mecanismo de
 * autenticação.
 */
class SyncManager {
  constructor({
    fetchTickets,
    onTicketsUpdated,
    foregroundIntervalMs = 15000,
    backgroundIntervalMs = 60000,
  }) {
    this.fetchTickets = fetchTickets; // async () => ticket[]
    this.onTicketsUpdated = onTicketsUpdated; // (ticket[]) => void
    this.foregroundIntervalMs = foregroundIntervalMs;
    this.backgroundIntervalMs = backgroundIntervalMs;
    this.timer = null;
    this.isForeground = true;
    this.socket = null; // reservado para WebSocket/SSE futuro
  }

  start() {
    this._scheduleNext();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setForeground(isForeground) {
    if (this.isForeground === isForeground) return;
    this.isForeground = isForeground;
    // Reagenda imediatamente com o novo intervalo.
    this.stop();
    this._scheduleNext(0);
  }

  _scheduleNext(delayOverride) {
    const delay =
      delayOverride ??
      (this.isForeground
        ? this.foregroundIntervalMs
        : this.backgroundIntervalMs);
    this.timer = setTimeout(() => this._tick(), delay);
  }

  async _tick() {
    try {
      if (typeof this.fetchTickets === "function") {
        const tickets = await this.fetchTickets();
        if (tickets && this.onTicketsUpdated) this.onTicketsUpdated(tickets);
      }
    } catch (err) {
      // Falha de rede não deve derrubar o loop de sincronização.
      console.error("[SyncManager] Falha ao sincronizar:", err.message);
    } finally {
      this._scheduleNext();
    }
  }

  /**
   * Ponto de extensão: quando o endpoint WebSocket/SSE do sistema for
   * conhecido, conectar aqui e chamar this.onTicketsUpdated em tempo real,
   * podendo então aumentar bastante o backgroundIntervalMs do polling.
   */
  connectRealtime(/* wsUrl */) {
    // Não implementado - aguardando definição do endpoint real.
  }
}

module.exports = { SyncManager };
