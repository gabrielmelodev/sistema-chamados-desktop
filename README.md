# Sistema de Chamados — Desktop (Electron)

Aplicativo desktop oficial do sistema de chamados da Prefeitura de Formosa/GO
(`https://chamados.formosa.go.gov.br`), empacotando o sistema web como um
app Windows nativo: toolbar própria, notificações, modo split-screen, sessão
persistente e auto-update.

## Estrutura do projeto

```text
chamados-app/
├── package.json              # config do app + electron-builder (instalador NSIS)
├── build/                    # ícone (icon.ico) e recursos do instalador
└── src/
    ├── main/
    │   ├── main.js            # orquestra todos os managers
    │   ├── config.js          # URL base, partição de sessão, paths
    │   ├── windowManager.js   # janela, BrowserViews, split-screen, layout responsivo
    │   ├── stateStore.js      # persistência de estado (electron-store)
    │   ├── notificationManager.js
    │   ├── syncManager.js
    │   ├── trayManager.js
    │   └── updateManager.js
    ├── preload/
    │   ├── preload.js         # API segura exposta à toolbar (contextBridge)
    │   └── contentPreload.js  # injetado no BrowserView do site real
    └── renderer/
        ├── index.html         # toolbar nativa
        ├── styles/             # CSS responsivo (clamp/vw/rem, sem tamanhos fixos)
        └── scripts/toolbar.js  # interações (split, som, tema, badge)
```

## Como rodar em desenvolvimento

```bash
npm install
npm run dev
```

No modo `dev`, o Electron reinicia automaticamente quando arquivos em `src/`
são alterados. O preload do site também mantém sidebars/drawers fechados
quando encontra um controle explícito de fechar ou recolher.

## Como gerar o instalador Windows

```bash
npm run build:win
```

Gera o instalador NSIS em `release/`, com:

- atalho no Desktop e Menu Iniciar;
- desinstalador;
- detecção de instalação existente (atualizar/reparar);
- suporte a x64 (build ARM64 pode ser adicionada depois em `package.json > build.win.target`).
- tela nativa personalizada com nome, textos e cores do aplicativo.

O instalador usa NSIS, que não suporta CSS diretamente. A personalização fica
em `build/installer.nsh`. Para uma tela realmente feita com HTML/CSS seria
necessário substituir o instalador NSIS por um instalador Electron próprio.

Antes de gerar builds de produção, substitua `build/icon.ico` por um ícone
oficial e confirme `build.publish.owner` e `build.publish.repo` em
`package.json` com o repositório real do GitHub.

`build/icon.svg` é usado pela identidade visual da toolbar durante o
desenvolvimento. O instalador, a bandeja e as notificações do Windows ainda
requerem o `build/icon.ico` oficial.

## O que já está implementado

- ✅ Janela nativa com toolbar própria (não parece "site dentro de Electron").
- ✅ Layout responsivo via CSS (clamp/vw/rem), sem tamanhos fixos indiscriminados.
- ✅ `ResponsiveLayoutManager` com breakpoints (compact/normal/expanded).
- ✅ Split-screen com dois `BrowserView`s independentes, divisor arrastável, ratio persistido.
- ✅ Sessão persistente via partição nomeada do Chromium (`persist:sistema-chamados`),
  separada da pasta de instalação — sobrevive a updates/reinicializações.
- ✅ Gerenciamento seguro de sessão: logout limpa os cookies da partição persistente
  no processo principal, incluindo cookies HttpOnly, sem expor valores ao renderer.
- ✅ Notificações nativas do Windows com dedupe por ID, controle de som, clique abre o chamado.
- ✅ Tray (bandeja): app continua rodando com a janela escondida; fechar a janela minimiza para a bandeja.
- ✅ `SyncManager` com intervalo adaptativo (foreground/background) e ponto de extensão para WebSocket/SSE.
- ✅ Auto-update em background (`electron-updater`) via GitHub Releases, com estado
  salvo antes do restart.
- ✅ Instalador NSIS configurado para detectar instalação existente (update/repair/cancel).
- ✅ Single-instance lock (evita múltiplas janelas do app).
- ✅ Hot reload no desenvolvimento e fechamento automático de sidebars abertas
  pelo site quando seus controles são identificáveis.

## Integração com a API real (já conectada)

- `src/main/apiClient.js` faz as chamadas HTTP via `net.request` amarrado à
  MESMA partição de sessão (`persist:sistema-chamados`) usada pelo
  `BrowserView`. O token `Bearer` enviado pelo frontend após o login é
  capturado apenas no processo principal, armazenado criptografado em
  `auth-session` e anexado automaticamente às próximas rotas da API.
- `src/main/cookieManager.js` mantém os cookies persistentes da sessão e
  garante o flush da store ao fazer logout. Cookies e token nunca são expostos
  ao renderer.
- Endpoints já ligados (`src/main/config.js > API_ENDPOINTS`):
  - `GET /api/v1/notifications?page&size` — usado pelo `SyncManager` para
    detectar eventos não lidos (`read:false`) a cada ciclo e disparar
    notificações nativas (CREATED, ACCEPTED, REASSIGNED, CLOSED, etc). O
    dedupe usa o `id` do EVENTO de notificação (não o `ticketId`), porque um
    mesmo chamado pode gerar vários eventos distintos.
  - `GET /api/v1/notifications/unread-count` — atualiza o badge da toolbar
    e o tooltip da bandeja com a contagem real de não lidos.
  - `POST /api/v1/auth/refresh` — chamado automaticamente em caso de `401`
    em qualquer requisição, e também proativamente a cada 10 minutos para
    manter a sessão viva.
  - `GET /api/v1/tickets?status=PENDING&page&size` — disponível em
    `apiClient.getPendingTickets()`, pronto para uso caso queira exibir uma
    lista de pendentes em algum painel (ainda não usado na UI).

## O que ainda depende de informações do sistema real

1. **`TICKET_URL_TEMPLATE` em `config.js`** — hoje monta o link do chamado
   como `${BASE_URL}/tickets/${ticketId}`. Essa é uma suposição; ajuste para
   a rota real do frontend (ex.: pode ser `/chamados/:id`, `/atendimento/:id`
   etc.) para que o clique na notificação abra o chamado corretamente.
2. **Login/SSO** — o app carrega `LOGIN_URL` diretamente; se o site usar
   SSO/redirecionamentos especiais, pode ser necessário tratar `will-navigate`
   ou `did-fail-load` no `windowManager` para casos de sessão expirada.
3. **Marcar notificação como lida** — a API tem `read:false/true` mas ainda
   não identificamos o endpoint de "marcar como lida" (provavelmente
   `PATCH /api/v1/notifications/{id}/read` ou similar). Sem isso, a mesma
   notificação pode reaparecer como "não lida" na API mesmo após o app já
   tê-la notificado (o dedupe local evita re-notificar, mas o contador da
   API pode ficar dessincronizado do que o app já mostrou).
4. **WebSocket/SSE em tempo real** — `syncManager.connectRealtime()` é um
   stub; se o sistema expuser um canal em tempo real, dá para reduzir bastante
   o polling.
5. **Ícone oficial** (`build/icon.ico`) — usar a identidade visual real da
   Prefeitura/sistema.

## Próximos passos sugeridos

1. Inspecionar a rede do site (DevTools) para confirmar os endpoints de
   listagem/detalhe de chamados e o formato de autenticação.
2. Testar a matriz de qualidade do item 19 dos requisitos (resoluções,
   escalas de DPI, perda de conexão, update, etc.).
3. Assinar digitalmente o instalador (recomendado para apps corporativos
   Windows, evita alertas do SmartScreen).
