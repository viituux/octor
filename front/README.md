# Front — interface web do OCTOR

Aplicação Angular que apresenta o produto **OCTOR**: acesso à conta, biblioteca de procedimentos, editor, exportação e treinamentos. Consome a API do módulo [back](../back/README.md) e conversa com a [extensão](../extensao/README.md) para gravação e Me guie. A autorização definitiva e a confirmação do progresso pertencem ao servidor.

## Tecnologias e versões

| Tecnologia | Declarado em package.json | Resolvido no package-lock.json |
| --- | --- | --- |
| Angular Core | `^19.0.0` | 19.2.25 |
| Angular CLI / builder | `^19.0.0` | 19.2.27 |
| TypeScript | `~5.6.2` | 5.6.3 |
| RxJS | `~7.8.0` | 7.8.2 |
| Zone.js | `~0.15.0` | 0.15.1 |
| tslib | `^2.3.0` | 2.8.1 |

Ambiente local inspecionado: Node.js 24.21.0 e npm 11.19.0. O CLI instalado declara Node `^18.19.1 || ^20.11.1 || >=22.0.0` e npm `^6.11.0 || ^7.5.6 || >=8.0.0`; essa informação é o contrato do pacote, não uma garantia de suporte atual de todas essas versões. `npm ci` usa o lockfile; não há necessidade de instalar Angular CLI globalmente.

## Estrutura

```text
front/
├── src/
│   ├── main.ts                     # bootstrap Angular
│   ├── index.html                  # documento inicial e fonte Inter
│   ├── styles.css                  # estilos globais e impressão
│   ├── theme.css                   # gerado a partir dos tokens da raiz
│   └── app/
│       ├── app.config.ts           # roteador, HTTP e interceptor
│       ├── app.routes.ts           # telas e guards
│       ├── components/
│       │   ├── login/              # login, cadastro, Google e Minha conta
│       │   ├── guide-list/         # biblioteca, equipes e convites
│       │   ├── guide-editor/       # instruções, capturas e narração
│       │   ├── trainings/          # participante, gestão e dashboard
│       │   ├── settings-modal/     # preferências
│       │   └── shared/             # ícones de interface
│       └── services/               # clientes HTTP, sessão e guards
├── public/                         # arquivos estáticos copiados pelo builder
├── tests/                          # testes Node dos componentes de captura/voz
├── angular.json                    # projeto octor e comandos de build/serve
└── package.json / package-lock.json
```

## Instalar e executar

No PowerShell, considerando o projeto na localização atual:

```powershell
cd "C:\Users\victo\.gemini\antigravity\scratch\PROJETO OCTOR\front"
npm ci
npm start
```

Abra `http://localhost:4200`. A API deve estar disponível em `http://localhost:8000/api`; veja como iniciá-la no [README do backend](../back/README.md). Se o projeto foi clonado em outro local, ajuste apenas o caminho do comando `cd`.

### Configuração e .env

**O frontend atual não carrega `.env` nem possui configuração de URL por ambiente.** Os endereços da API estão no código dos serviços de autenticação, guias e treinamentos. A ponte de extensão também usa as origens locais definidas no código e no manifesto. Criar um `.env` em `front` não altera esses valores.

Chaves de IA e configurações privadas pertencem a `back/.env`. O navegador recebe somente o identificador público Google quando o backend habilita esse fluxo. Não coloque chaves em fontes Angular, arquivos de assets ou variáveis incorporadas ao build.

O tema é compartilhado na raiz. Para regenerá-lo:

```powershell
cd ..
node scripts/build-theme.cjs
```

Edite `design-tokens.json`, não os arquivos de tema gerados.

## Funcionalidades e fluxo de dados

1. Login/cadastro retorna `access`, `refresh` e `user`. O serviço sincroniza signals e armazenamento local (`access_token`, `refresh_token`, `current_user`). O interceptor adiciona Bearer conforme a condição de autenticação atual.
2. A biblioteca consulta guias e equipes. Favoritos são pessoais; compartilhamento, membros, lixeira e restauração são confirmados pela API.
3. O editor recebe passos e metadados. Alterações de texto, título, enquadramento e voz são persistidas pelos serviços. A geração de instruções usa a configuração de IA do servidor.
4. PDF usa o fluxo de impressão do navegador; exportação HTML monta um arquivo local. Não há endpoint de renderização PDF no frontend.
5. O criador publica o procedimento e atribui treinamentos. O participante percorre conteúdo → avaliação. O servidor confirma a conclusão e impede avaliações duplicadas. Não há perguntas, pontuação ou ranking de participantes no fluxo atual.
6. O Me guie solicita à extensão a abertura do tutorial. O guia continua no site real: não é uma cópia isolada ou simulador de HTML.

### Rotas de interface

| Rotas | Uso |
| --- | --- |
| `/login`, `/register` | Acesso e cadastro |
| `/account` | Perfil, e-mail, senha, sessões, Google e conexão da extensão |
| `/guides`, `/guides/:id` | Biblioteca e editor |
| `/join/:token` | Consulta/aceitação de convite após autenticar |
| `/trainings`, `/trainings/:id` | Treinamentos do participante |
| `/training-admin`, `/training-admin/new`, `/training-admin/:id` | Gestão de treinamentos |
| `/training-dashboard` | Indicadores e rankings |

Guards organizam a navegação, mas não substituem as permissões dos endpoints. Raiz e rota desconhecida redirecionam à biblioteca conforme o roteador atual.

## Comunicação com os módulos

- API: JSON sobre HTTP, `Authorization: Bearer <access>`. Uploads de voz usam `FormData`. Famílias principais: `/api/auth/`, `/api/guides/`, `/api/workspaces/` e `/api/trainings/`.
- Extensão: pareamento `CONNECT_ACCOUNT` por `chrome.runtime.sendMessage`; o worker verifica a sessão em `/api/auth/me/`. O ID conectado fica em `autoguide_extension_id` por compatibilidade.
- Me guie: `START_PLAYBACK` por mensagem externa ou ponte `AUTOGUIDE_START` / `AUTOGUIDE_RESULT`, conforme o fluxo. As origens aceitas atualmente são `http://localhost:4200` e `http://127.0.0.1:4200`.
- Identificadores antigos `autoguide` em mensagens/armazenamento são contratos existentes; renomear a marca não os migrou.
- Os erros do servidor são apresentados pelos componentes. O frontend não deve interpretar apenas uma mudança visual como confirmação de persistência.

## Testar

Na raiz `PROJETO OCTOR`:

```powershell
node --test front/tests/*.test.cjs
node --test extensao/tests/*.test.cjs front/tests/*.test.cjs
```

No módulo `front`:

```powershell
npm run build
```

Não há script `npm test` configurado. Os testes atuais de captura/voz transpilam os componentes e usam objetos simulados; não constituem teste integral de todas as telas em navegador. Na etapa anterior, a suíte conjunta teve 69 testes aprovados e o build de produção passou.

Validação manual: entrar, criar/editar guia, salvar instrução, testar enquadramento, exportar PDF, conectar extensão e concluir treinamento e enviar avaliação. Google e IA exigem configuração válida para testar a integração real.

## Deploy

`npm run build` produz o site estático em `dist/octor/browser`. Sirva o conteúdo dessa pasta em um servidor HTTPS. Configure fallback SPA para `index.html` em rotas de interface; por exemplo, no bloco apropriado de um servidor Nginx estático: `try_files $uri $uri/ /index.html;`.

**Ainda não existe configuração pronta de produção:** é necessário definir endereços públicos da API, origens Google e da extensão, CORS e forma de acesso às mídias. Isso exige uma alteração de configuração/código futura; este README não a implementa. `npm start` é servidor de desenvolvimento, não a entrega de produção. Nenhum provedor foi configurado ou publicado nesta etapa.

## Problemas comuns

| Sintoma | Conferência/ação |
| --- | --- |
| API inacessível | Iniciar Django na porta 8000; conferir host usado no serviço e console/rede do navegador. |
| Sessão expirada ou 401 | Entrar novamente. O refresh do backend e a renovação da extensão não significam renovação automática de todo fluxo web. |
| Me guie não abre | Carregar `extensao`, atualizar a página e parear novamente em Minha conta; conferir origem e ID da extensão. |
| Rota direta dá 404 ao hospedar | Configurar o fallback SPA no servidor de arquivos estáticos. |
| Build falha buscando fontes | O documento usa Google Fonts; conferir acesso à rede durante a etapa de inlining. Não trocar o build de produção pelo de desenvolvimento como solução de publicação. |
| Alteração de tema desaparece | Alterar os tokens na raiz e executar o gerador, não editar `theme.css` diretamente. |
| Perfil/guia continua visível após erro | Conferir a resposta HTTP: a interface preserva dados em falhas para permitir nova tentativa. |

Veja também os [relatórios de reorganização](../docs/REORGANIZACAO-ETAPA-1.md) e [comentários](../docs/COMENTARIOS-ETAPA-2.md).
