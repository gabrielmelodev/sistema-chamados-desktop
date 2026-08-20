'use strict';

/**
 * Configuração central do aplicativo.
 * Mantém separação clara entre "Application Files" (este código, imutável,
 * reinstalado a cada atualização) e "User Data" (perfil, sessão, preferências,
 * que NUNCA deve ser apagado em updates/reparo).
 */

const path = require('path');
const { app } = require('electron');

const BASE_URL = 'https://chamados.formosa.go.gov.br';
const LOGIN_URL = `${BASE_URL}/login`;
const API_BASE = `${BASE_URL}/api/v1`;

const API_ENDPOINTS = {
  ticketsPending: (page = 0, size = 20) => `${API_BASE}/tickets?status=PENDING&page=${page}&size=${size}`,
  notifications: (page = 0, size = 20) => `${API_BASE}/notifications?page=${page}&size=${size}`,
  unreadCount: `${API_BASE}/notifications/unread-count`,
  authRefresh: `${API_BASE}/auth/refresh`,
};

// Template usado para montar o link de um chamado a partir do ticketId.
// Ajustar assim que a rota real do frontend for confirmada (ex.: pode ser
// /chamados/:id, /tickets/:id, /atendimento/:id, etc.).
const TICKET_URL_TEMPLATE = (ticketId) => `${BASE_URL}/tickets/${ticketId}`;

// Partição de sessão persistente e nomeada (não usar 'temporary' nem partição
// default anônima). Isso garante que cookies/localStorage/IndexedDB do site
// sobrevivam a updates, reinstalações e reinicializações do Windows, pois o
// Electron grava esses dados em userData, fora da pasta de instalação.
const SESSION_PARTITION = 'persist:sistema-chamados';

// Diretório de dados do usuário (fora da pasta de instalação por padrão no
// Electron/Windows: %APPDATA%\Sistema de Chamados). Mantemos explícito aqui
// para reforçar a regra crítica do item 17 dos requisitos.
function getUserDataDir() {
  return app.getPath('userData');
}

module.exports = {
  BASE_URL,
  LOGIN_URL,
  API_BASE,
  API_ENDPOINTS,
  TICKET_URL_TEMPLATE,
  SESSION_PARTITION,
  getUserDataDir,
  isDev: process.argv.includes('--dev'),
};
