"use strict";

const { net, session } = require("electron");
const { SESSION_PARTITION, API_ENDPOINTS } = require("./config");

/**
 * ApiClient (item 7)
 * Usa `net.request` amarrado à MESMA partição de sessão do BrowserView
 * (`persist:sistema-chamados`). O token capturado do frontend é mantido apenas
 * no processo principal e enviado explicitamente nas chamadas da API.
 */
class ApiClient {
  constructor({ accessToken = null, onSessionExpired } = {}) {
    this.ses = session.fromPartition(SESSION_PARTITION);
    this.accessToken = this._normalizeToken(accessToken);
    this.onSessionExpired = onSessionExpired;
    this.sessionFailureReported = false;
  }

  _request(url, method = "GET", includeAuthorization = true) {
    return new Promise((resolve, reject) => {
      const request = net.request({ method, url, session: this.ses });
      request.setHeader("Accept", "application/json");
      const authorization = includeAuthorization
        ? this._getAuthorizationHeader()
        : null;
      if (authorization) {
        request.setHeader("Authorization", authorization);
      }

      let body = "";
      request.on("response", (response) => {
        response.on("data", (chunk) => {
          body += chunk.toString();
        });
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            this.sessionFailureReported = false;
            try {
              resolve(body ? JSON.parse(body) : null);
            } catch (err) {
              reject(new Error(`Resposta inválida (${url}): ${err.message}`));
            }
          } else {
            const err = new Error(`HTTP ${response.statusCode} em ${url}`);
            err.statusCode = response.statusCode;
            reject(err);
          }
        });
      });
      request.on("error", reject);
      request.end();
    });
  }

  /**
   * Tenta a requisição; se receber 401 (sessão expirada), tenta renovar via
   * /auth/refresh uma vez e repete a chamada original.
   */
  async _requestWithRefresh(url, method = "GET") {
    try {
      return await this._request(url, method);
    } catch (err) {
      if (err.statusCode === 401) {
        // Um token salvo pode ter sido revogado ou estar atrás de um cookie
        // de sessão válido. Testa a sessão Chromium sem o Bearer antigo.
        if (this.accessToken) {
          this.clearAccessToken();
          try {
            return await this._request(url, method, false);
          } catch (cookieError) {
            if (cookieError.statusCode !== 401) throw cookieError;
          }
        }
        const refreshed = await this.refreshAuth();
        if (refreshed) return this._request(url, method);
      }
      throw err;
    }
  }

  async refreshAuth() {
    if (this.sessionFailureReported) return false;

    try {
      await this._request(API_ENDPOINTS.authRefresh, "POST");
      return true;
    } catch (err) {
      // Sessão realmente expirada - próxima navegação da view vai redirecionar
      // naturalmente para /login, sem necessidade de tratamento especial aqui.
      console.warn("[ApiClient] refresh de sessão falhou:", err.message);
      if (!this.sessionFailureReported) {
        this.sessionFailureReported = true;
        this.onSessionExpired?.();
      }
      return false;
    }
  }

  markSessionAvailable() {
    this.sessionFailureReported = false;
  }

  setAccessToken(token) {
    const normalizedToken = this._normalizeToken(token);
    if (!normalizedToken) return;
    this.accessToken = normalizedToken;
    this.markSessionAvailable();
  }

  _normalizeToken(token) {
    if (typeof token !== "string") return null;
    const normalizedToken = token.trim();
    return normalizedToken.replace(/^Bearer\s+/i, "").trim() || null;
  }

  _getAuthorizationHeader() {
    return this.accessToken ? `Bearer ${this.accessToken}` : null;
  }

  clearAccessToken() {
    this.accessToken = null;
    this.sessionFailureReported = false;
  }

  async getPendingTickets(page = 0, size = 20) {
    return this._requestWithRefresh(API_ENDPOINTS.ticketsPending(page, size));
  }

  async getNotifications(page = 0, size = 20) {
    return this._requestWithRefresh(API_ENDPOINTS.notifications(page, size));
  }

  async getUnreadNotifications(page = 0, size = 20) {
    const data = await this.getNotifications(page, size);
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.content)
        ? data.content
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.data?.content)
            ? data.data.content
            : [];
    return items.filter(
      (notification) =>
        notification &&
        !notification.read &&
        notification.id &&
        notification.ticketId &&
        notification.protocol,
    );
  }

  async getUnreadCount() {
    const data = await this._requestWithRefresh(API_ENDPOINTS.unreadCount);
    return data?.count ?? 0;
  }
}

module.exports = { ApiClient };
