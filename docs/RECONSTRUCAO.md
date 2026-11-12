# Reconstrução do OCTOR

A ordem abaixo permite verificar cada módulo antes de conectar o próximo. Use um banco novo e dados fictícios enquanto reproduz os fluxos.

| Camada | Onde começar | Responsabilidade |
| --- | --- | --- |
| Backend | `back/config/urls.py` e `back/config/settings.py` | Define a API, as permissões e a configuração do PostgreSQL. |
| Frontend | `front/src/main.ts`, `front/src/app/app.routes.ts` e `front/src/app/api-config.ts` | Configura as rotas Angular, resolve o endereço da API e monta a interface. |
| Extensão | `extensao/manifest.json` e `extensao/environment.js` | Declara permissões, origens, painel lateral e worker do Chrome. |
| Implantação | `deploy/google-cloud/` | Contém os exemplos de Nginx e systemd usados como base para a VM Ubuntu. |

## 1. Suba a API e o banco

1. Instale as dependências de `back/requirements.txt` em um ambiente virtual. Copie `back/.env.example` para `back/.env` e configure seu PostgreSQL local.
2. Execute `python manage.py migrate` e `python manage.py runserver 8000` dentro de `back`. Abra `/api/system/version/` para verificar que a API responde.
3. Reproduza o cadastro em `accounts/serializers.py` e a sessão em `accounts/sessions.py`. O cadastro verifica a versão do termo. A renovação troca o refresh token para impedir a reutilização do anterior. O pareamento emite outra sessão para que o Chrome e o site renovem separadamente.
4. Leia `accounts/google_auth.py` depois do login com senha. A API verifica emissor, público e desafio da credencial Google. Em hospedagem, cadastre a origem HTTPS no cliente OAuth e configure o Client ID no servidor.

## 2. Reproduza o frontend

1. Em `front`, execute `npm ci` e `npm start`. Comece pela rota de login. Siga de `auth.service.ts` para `auth.interceptor.ts` e depois para a tela de guias.
2. Reproduza a lista e o editor usando `guide.service.ts`. A tela usa a API para recuperar guias e passos. As permissões de leitura e escrita ficam no backend, em `guides/permissions.py`.
3. Faça o build com `npm run build`. Em hospedagem, sirva o conteúdo de `dist/octor/browser` e encaminhe `/api/` para o Django. Essa topologia usa a mesma origem no navegador.

## 3. Reproduza a extensão

1. Carregue `extensao` sem compactação em `chrome://extensions`. O worker em `background.js` mantém o estado da gravação e o painel em `popup.js` mostra os controles ao usuário.
2. Siga um clique de `content.js` até `background.js`. A extensão detecta a ação na página, captura a imagem e guarda o passo até finalizar a gravação. Confira o guia criado com dois cliques em uma página de teste.
3. Leia `playback-background.js` junto com `playback.js`. O primeiro valida a origem e controla a aba. O segundo mostra o destaque e os controles de progresso. Use um destino de teste autorizado para validar a navegação.
4. Para usar um domínio publicado, ajuste `environment.js` e `externally_connectable.matches` no manifesto. Recarregue a extensão e conecte a conta pelo painel.

## 4. Adicione manuais e treinamentos

- **Manual por URL.** Siga `manual-bridge.js`, `manual-background.js` e `back/manuals/services.py`. A extensão coleta a página e a API valida as referências às capturas no rascunho gerado. A revisão é parte do fluxo de publicação.
- **Treinamentos.** Leia `back/trainings/models.py`, `services.py`, `quiz.py` e `archive.py`. A publicação registra uma versão. A participação aponta para ela para preservar o histórico. A pontuação e o tempo determinam o ranking.
- **Validação integrada.** Crie um guia, publique um treinamento e atribua a uma segunda conta. Use essa conta para confirmar acesso, concluir os passos, responder ao quiz quando exigido e enviar feedback. Volte à primeira conta para conferir o histórico da versão.

Os READMEs de [front](../front/README.md), [back](../back/README.md) e [extensão](../extensao/README.md) detalham cada módulo. O [índice da documentação](README.md) reúne os fluxos por recurso.
