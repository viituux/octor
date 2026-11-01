# Comentários em português — etapa 2

## Escopo entregue

Foram documentados 132 arquivos próprios do projeto, sem alterar a lógica ou os contratos da aplicação:

| Tipo | Arquivos | Conteúdo documentado |
| --- | ---: | --- |
| Python | 67 | Imports, funções/métodos, parâmetros, retornos, exceções explícitas, modelos, migrações e fluxos da API |
| TypeScript | 25 | Dependências Angular/RxJS, serviços, componentes, guards, estado e contratos dos métodos |
| JavaScript | 7 | Gravação, filas, associação de captura, voz, mensagens e apresentação do Me guie |
| Scripts/testes CommonJS | 8 | Simulações, contratos dos cenários, leitura de fontes e geração do tema |
| HTML | 11 | Responsabilidade dos templates e ordem dos fluxos apresentados |
| CSS próprio | 8 | Layout, responsividade, contraste via tokens e separação entre editor e impressão |
| requirements.txt | 1 | Finalidade de cada dependência do backend, sem alterar especificadores de versão |
| Docker Compose | 1 | Serviços auxiliares e preservação dos volumes/identificadores existentes |
| Exemplos de ambiente | 3 | Onde configurar credenciais e identificadores públicos |
| .gitignore raiz | 1 | Motivo de excluir dados locais, dependências e artefatos gerados |

Os comentários de funções registram os parâmetros, o retorno conforme a assinatura/corpo e as falhas explícitas ou o canal assíncrono quando aplicável. Comentários de decisão explicam por que existem bloqueios transacionais, idempotência, versão publicada do quiz, verificação de cena e preservação de rascunhos.

## Preservação do comportamento

- Python: comparação da AST antes/depois, sem posições de linha; nenhuma alteração de instrução, assinatura, literal ou docstring. Usaram-se comentários `#`, sem criar docstrings que mudariam `__doc__`.
- TypeScript/JavaScript: comparação da AST e do JavaScript emitido sem comentários em 40 arquivos; estruturas e emissão equivalentes.
- Templates: comparação do conteúdo após remover somente comentários HTML e normalizar espaços externos; nenhuma diretiva ou binding alterado.
- CSS: remoção dos comentários para comparação; seletores, regras e valores preservados.
- requirements, Compose, ignore e exemplos: linhas funcionais iguais após excluir comentários e linhas vazias.
- Finais de linha dentro dos literais de template foram preservados para manter a mesma emissão JavaScript.
- 80 arquivos locais sensíveis/dados (.env, banco e mídias) verificados por SHA-256 e preservados.
- Não foram instaladas/atualizadas dependências, criadas migrações, alteradas permissões ou executado push/commit nesta etapa.

## Formatos e arquivos que não receberam comentários

JSON estrito não aceita comentários. `package.json`, `package-lock.json`, `angular.json`, `tsconfig*.json`, `manifest.json` e `design-tokens.json` foram preservados. Suas responsabilidades serão explicadas nos READMEs de módulo e no documento de stack nas próximas etapas, em vez de invalidar os arquivos.

Dependências, ambiente virtual, caches, builds, banco e mídia não são código próprio a documentar. Os arquivos `front/src/theme.css`, `extensao/theme.css` e `extensao/theme.js` são gerados e foram preservados; a explicação fica no gerador `scripts/build-theme.cjs` para não desaparecer na próxima geração. Metadados locais do editor também permanecem fora do escopo.

## Limitações existentes explicitadas, sem correção funcional

- O Me guie orienta, destaca, rola e navega; não comprova que a ação aconteceu ao clicar em Próximo/Pular.
- A validação de URL do tutorial aceita HTTP/HTTPS; não constitui uma lista de ambientes permitidos.
- Ignorar eventos de senha não equivale a mascarar todos os dados sensíveis da imagem capturada.
- O interceptor web atual aplica a sessão conforme sua condição local; esta etapa não implementa uma nova política por domínio.
- O pipeline de vídeo atual simula etapas/progresso; não renderiza vídeo real.
- O ambiente virtual movido continua devendo ser usado pelo interpretador (`python.exe -m pip`, `python.exe -m celery`) conforme o relatório da etapa 1.

Esses pontos foram comentados como funcionamento atual. Nenhuma implementação de segurança, automação ou vídeo foi acrescentada.

## Validação

- `node --test extensao/tests/*.test.cjs front/tests/*.test.cjs`: **69 testes aprovados**.
- No back, `.\venv\Scripts\python.exe manage.py test --noinput`: **89 testes aprovados**, sem problemas na verificação Django.
- No front, `npm run build`: **aprovado**, incluindo compilação de templates Angular.
- Comparações estruturais e de conteúdo descritas acima: **aprovadas** após a revisão final dos comentários.

As ferramentas locais usadas para conferir equivalência ficaram fora do repositório. A etapa 3 (READMEs por módulo) e a etapa 4 (STACK.md) aguardam confirmação, conforme o fluxo combinado.

## Arquivos documentados

- `.gitignore`
- `back/.env.ai.example`
- `back/.env.example`
- `back/.env.google.example`
- `back/accounts/__init__.py`
- `back/accounts/account_settings.py`
- `back/accounts/authentication.py`
- `back/accounts/google_auth.py`
- `back/accounts/migrations/0001_initial.py`
- `back/accounts/migrations/0002_googleaccount.py`
- `back/accounts/migrations/0003_usersettings_session_version.py`
- `back/accounts/migrations/__init__.py`
- `back/accounts/models.py`
- `back/accounts/serializers.py`
- `back/accounts/sessions.py`
- `back/accounts/test_account_settings.py`
- `back/accounts/tests.py`
- `back/accounts/urls.py`
- `back/accounts/views.py`
- `back/ai/__init__.py`
- `back/ai/narration.py`
- `back/ai/prompts.py`
- `back/ai/tasks.py`
- `back/ai/test_narration.py`
- `back/ai/test_prompts.py`
- `back/ai/tests.py`
- `back/ai/urls.py`
- `back/ai/views.py`
- `back/config/__init__.py`
- `back/config/celery.py`
- `back/config/settings.py`
- `back/config/urls.py`
- `back/config/wsgi.py`
- `back/guides/__init__.py`
- `back/guides/migrations/0001_initial.py`
- `back/guides/migrations/0002_alter_step_selector_alter_step_url.py`
- `back/guides/migrations/0003_step_narration.py`
- `back/guides/migrations/0004_guide_capture_audio.py`
- `back/guides/migrations/0005_step_generation_prompt.py`
- `back/guides/migrations/0006_guide_starred_by_guide_trashed_at_workspace_owner_and_more.py`
- `back/guides/migrations/__init__.py`
- `back/guides/models.py`
- `back/guides/permissions.py`
- `back/guides/serializers.py`
- `back/guides/teamwork.py`
- `back/guides/test_library.py`
- `back/guides/test_narration.py`
- `back/guides/urls.py`
- `back/guides/views.py`
- `back/guides/workspace_urls.py`
- `back/manage.py`
- `back/requirements.txt`
- `back/trainings/__init__.py`
- `back/trainings/analytics.py`
- `back/trainings/management/commands/seed_trainings.py`
- `back/trainings/migrations/0001_initial.py`
- `back/trainings/migrations/__init__.py`
- `back/trainings/models.py`
- `back/trainings/permissions.py`
- `back/trainings/serializers.py`
- `back/trainings/services.py`
- `back/trainings/tests.py`
- `back/trainings/urls.py`
- `back/trainings/views.py`
- `back/videos/__init__.py`
- `back/videos/migrations/0001_initial.py`
- `back/videos/migrations/__init__.py`
- `back/videos/models.py`
- `back/videos/serializers.py`
- `back/videos/tasks.py`
- `back/videos/urls.py`
- `back/videos/views.py`
- `docker-compose.yml`
- `extensao/background.js`
- `extensao/content.js`
- `extensao/live-recorder.html`
- `extensao/live-recorder.js`
- `extensao/playback-background.js`
- `extensao/playback.js`
- `extensao/popup.css`
- `extensao/popup.html`
- `extensao/popup.js`
- `extensao/targets.js`
- `extensao/tests/content.test.cjs`
- `extensao/tests/live-recorder.test.cjs`
- `extensao/tests/playback.test.cjs`
- `extensao/tests/recorder.test.cjs`
- `extensao/tests/targets.test.cjs`
- `front/src/app/app.component.ts`
- `front/src/app/app.config.ts`
- `front/src/app/app.routes.ts`
- `front/src/app/components/guide-editor/guide-editor.component.css`
- `front/src/app/components/guide-editor/guide-editor.component.html`
- `front/src/app/components/guide-editor/guide-editor.component.ts`
- `front/src/app/components/guide-editor/step-capture.component.ts`
- `front/src/app/components/guide-editor/step-narration.component.ts`
- `front/src/app/components/guide-list/guide-list.component.css`
- `front/src/app/components/guide-list/guide-list.component.html`
- `front/src/app/components/guide-list/guide-list.component.ts`
- `front/src/app/components/guide-list/workspace-invite.component.ts`
- `front/src/app/components/login/account.component.css`
- `front/src/app/components/login/account.component.html`
- `front/src/app/components/login/account.component.ts`
- `front/src/app/components/login/google-sign-in.component.ts`
- `front/src/app/components/login/login.component.css`
- `front/src/app/components/login/login.component.html`
- `front/src/app/components/login/login.component.ts`
- `front/src/app/components/settings-modal/settings-modal.component.css`
- `front/src/app/components/settings-modal/settings-modal.component.html`
- `front/src/app/components/settings-modal/settings-modal.component.ts`
- `front/src/app/components/shared/octor-icon.component.ts`
- `front/src/app/components/trainings/training-admin.component.html`
- `front/src/app/components/trainings/training-admin.component.ts`
- `front/src/app/components/trainings/training-dashboard.component.html`
- `front/src/app/components/trainings/training-dashboard.component.ts`
- `front/src/app/components/trainings/training-list.component.ts`
- `front/src/app/components/trainings/training-nav.component.ts`
- `front/src/app/components/trainings/training-player.component.html`
- `front/src/app/components/trainings/training-player.component.ts`
- `front/src/app/components/trainings/trainings.css`
- `front/src/app/services/auth.guard.ts`
- `front/src/app/services/auth.interceptor.ts`
- `front/src/app/services/auth.service.ts`
- `front/src/app/services/guide.service.ts`
- `front/src/app/services/training-admin.guard.ts`
- `front/src/app/services/training.service.ts`
- `front/src/index.html`
- `front/src/main.ts`
- `front/src/styles.css`
- `front/tests/capture.test.cjs`
- `front/tests/narration.test.cjs`
- `scripts/build-theme.cjs`
