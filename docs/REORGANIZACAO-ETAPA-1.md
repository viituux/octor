# Reorganização — etapa 1

A raiz local foi renomeada de `autoguide` para `PROJETO OCTOR`. O diretório `.git` foi preservado e o remoto continua https://github.com/viituux/octor.git. Nenhum commit ou push faz parte desta etapa.

## Estrutura

- `frontend` → `front`: 49 arquivos versionados, além das dependências e builds locais.
- `backend` → `back`: 73 arquivos versionados, além do ambiente virtual, configuração local, banco e mídias.
- `extension` → `extensao`: 18 arquivos versionados.
- `docs`, `scripts`, `design-tokens.json`, `docker-compose.yml`, `.gitignore` e `README.md` permanecem na raiz.
- `.idea` permanece como metadado local ignorado, sem participação na execução.

## Ajustes efetuados

- `scripts/build-theme.cjs`: saídas em `front/src` e `extensao`.
- Dois testes do frontend: caminhos de TypeScript e dos componentes em `front`.
- `.gitignore`: mídias locais agora em `back/media`.
- README principal, documentação existente e exemplos de ambiente: caminhos de instalação, execução e testes.
- Caminhos absolutos com espaços foram envolvidos por aspas nas instruções PowerShell.
- Nenhuma alteração de imports relativos foi necessária nos módulos: sua estrutura interna foi preservada.
- Angular, package.json/lock, requirements.txt e manifest.json mantêm seus caminhos internos válidos. O manifesto foi conferido: todos os scripts e a página lateral referenciados existem.
- Docker Compose só inicia PostgreSQL e Redis; não contém caminhos dos módulos. Nomes de containers, banco, usuário, volumes e chaves de sessão/mensagens foram preservados.
- Não existem Dockerfiles no projeto atual para ajustar.

## Incoerências e cuidados identificados

O ambiente virtual Python movido mantém referências antigas em executáveis auxiliares e scripts de ativação. O interpretador funciona, mas o pip.exe direto falhou após a movimentação. Use `back/venv/Scripts/python.exe -m pip`, `-m celery` e o mesmo interpretador para manage.py. O ambiente não foi recriado nem teve dependências atualizadas; uma recriação poderá ser aprovada separadamente.

A extensão carregada sem compactação precisa ser removida/recarregada pelo novo caminho `extensao` no navegador. O identificador pode mudar ao mudar o caminho; nesse caso, reconecte a extensão em Minha conta. Não foi alterada a autenticação para compensar essa mudança.

O README anterior mistura descrições de funcionalidades atuais e planejadas (por exemplo, vídeos e avatar). Esse conteúdo não foi reinterpretado como funcionalidade pronta; a revisão técnica será tratada nas etapas de documentação após confirmação.

Nenhum arquivo de lógica da aplicação foi modificado. Banco, .env e mídias foram comparados por SHA-256 antes/depois e preservados integralmente. Não há migrações novas.

## Comandos de validação

Na raiz:

```powershell
node --test extensao/tests/*.test.cjs front/tests/*.test.cjs
node scripts/build-theme.cjs
.\back\venv\Scripts\python.exe back/manage.py check
```

No `back`: `.\venv\Scripts\python.exe manage.py test --noinput`.
No `front`: `npm run build`.

## Resultado da validação

- 69 testes da extensão/frontend: aprovados.
- 89 testes Django: aprovados; banco de testes temporário removido automaticamente.
- Build de produção Angular: aprovado, em `front/dist/octorr`.
- Django system check: sem problemas.
- Gerador de tema: saídas idênticas por SHA-256.
- Manifesto MV3: todas as referências locais presentes.
- Todos os 230 arquivos do manifesto pré-movimentação localizados; .env, banco e mídias com conteúdo idêntico.
- Apenas referências de caminhos, testes que leem arquivos, documentação e ignore foram ajustados; a lógica da aplicação foi preservada.

## Inventário completo dos movimentos

| Origem relativa | Destino relativo |
| --- | --- |
| `backend/.env.ai.example` | `back/.env.ai.example` |
| `backend/.env.example` | `back/.env.example` |
| `backend/.env.google.example` | `back/.env.google.example` |
| `backend/.gitignore` | `back/.gitignore` |
| `backend/accounts/__init__.py` | `back/accounts/__init__.py` |
| `backend/accounts/account_settings.py` | `back/accounts/account_settings.py` |
| `backend/accounts/authentication.py` | `back/accounts/authentication.py` |
| `backend/accounts/google_auth.py` | `back/accounts/google_auth.py` |
| `backend/accounts/migrations/0001_initial.py` | `back/accounts/migrations/0001_initial.py` |
| `backend/accounts/migrations/0002_googleaccount.py` | `back/accounts/migrations/0002_googleaccount.py` |
| `backend/accounts/migrations/0003_usersettings_session_version.py` | `back/accounts/migrations/0003_usersettings_session_version.py` |
| `backend/accounts/migrations/__init__.py` | `back/accounts/migrations/__init__.py` |
| `backend/accounts/models.py` | `back/accounts/models.py` |
| `backend/accounts/serializers.py` | `back/accounts/serializers.py` |
| `backend/accounts/sessions.py` | `back/accounts/sessions.py` |
| `backend/accounts/test_account_settings.py` | `back/accounts/test_account_settings.py` |
| `backend/accounts/tests.py` | `back/accounts/tests.py` |
| `backend/accounts/urls.py` | `back/accounts/urls.py` |
| `backend/accounts/views.py` | `back/accounts/views.py` |
| `backend/ai/README.md` | `back/ai/README.md` |
| `backend/ai/__init__.py` | `back/ai/__init__.py` |
| `backend/ai/narration.py` | `back/ai/narration.py` |
| `backend/ai/prompts.py` | `back/ai/prompts.py` |
| `backend/ai/tasks.py` | `back/ai/tasks.py` |
| `backend/ai/test_narration.py` | `back/ai/test_narration.py` |
| `backend/ai/test_prompts.py` | `back/ai/test_prompts.py` |
| `backend/ai/tests.py` | `back/ai/tests.py` |
| `backend/ai/urls.py` | `back/ai/urls.py` |
| `backend/ai/views.py` | `back/ai/views.py` |
| `backend/config/__init__.py` | `back/config/__init__.py` |
| `backend/config/celery.py` | `back/config/celery.py` |
| `backend/config/settings.py` | `back/config/settings.py` |
| `backend/config/urls.py` | `back/config/urls.py` |
| `backend/config/wsgi.py` | `back/config/wsgi.py` |
| `backend/guides/__init__.py` | `back/guides/__init__.py` |
| `backend/guides/migrations/0001_initial.py` | `back/guides/migrations/0001_initial.py` |
| `backend/guides/migrations/0002_alter_step_selector_alter_step_url.py` | `back/guides/migrations/0002_alter_step_selector_alter_step_url.py` |
| `backend/guides/migrations/0003_step_narration.py` | `back/guides/migrations/0003_step_narration.py` |
| `backend/guides/migrations/0004_guide_capture_audio.py` | `back/guides/migrations/0004_guide_capture_audio.py` |
| `backend/guides/migrations/0005_step_generation_prompt.py` | `back/guides/migrations/0005_step_generation_prompt.py` |
| `backend/guides/migrations/0006_guide_starred_by_guide_trashed_at_workspace_owner_and_more.py` | `back/guides/migrations/0006_guide_starred_by_guide_trashed_at_workspace_owner_and_more.py` |
| `backend/guides/migrations/__init__.py` | `back/guides/migrations/__init__.py` |
| `backend/guides/models.py` | `back/guides/models.py` |
| `backend/guides/permissions.py` | `back/guides/permissions.py` |
| `backend/guides/serializers.py` | `back/guides/serializers.py` |
| `backend/guides/teamwork.py` | `back/guides/teamwork.py` |
| `backend/guides/test_library.py` | `back/guides/test_library.py` |
| `backend/guides/test_narration.py` | `back/guides/test_narration.py` |
| `backend/guides/urls.py` | `back/guides/urls.py` |
| `backend/guides/views.py` | `back/guides/views.py` |
| `backend/guides/workspace_urls.py` | `back/guides/workspace_urls.py` |
| `backend/manage.py` | `back/manage.py` |
| `backend/requirements.txt` | `back/requirements.txt` |
| `backend/trainings/__init__.py` | `back/trainings/__init__.py` |
| `backend/trainings/analytics.py` | `back/trainings/analytics.py` |
| `backend/trainings/management/commands/seed_trainings.py` | `back/trainings/management/commands/seed_trainings.py` |
| `backend/trainings/migrations/0001_initial.py` | `back/trainings/migrations/0001_initial.py` |
| `backend/trainings/migrations/__init__.py` | `back/trainings/migrations/__init__.py` |
| `backend/trainings/models.py` | `back/trainings/models.py` |
| `backend/trainings/permissions.py` | `back/trainings/permissions.py` |
| `backend/trainings/serializers.py` | `back/trainings/serializers.py` |
| `backend/trainings/services.py` | `back/trainings/services.py` |
| `backend/trainings/tests.py` | `back/trainings/tests.py` |
| `backend/trainings/urls.py` | `back/trainings/urls.py` |
| `backend/trainings/views.py` | `back/trainings/views.py` |
| `backend/videos/__init__.py` | `back/videos/__init__.py` |
| `backend/videos/migrations/0001_initial.py` | `back/videos/migrations/0001_initial.py` |
| `backend/videos/migrations/__init__.py` | `back/videos/migrations/__init__.py` |
| `backend/videos/models.py` | `back/videos/models.py` |
| `backend/videos/serializers.py` | `back/videos/serializers.py` |
| `backend/videos/tasks.py` | `back/videos/tasks.py` |
| `backend/videos/urls.py` | `back/videos/urls.py` |
| `backend/videos/views.py` | `back/videos/views.py` |
| `extension/background.js` | `extensao/background.js` |
| `extension/content.js` | `extensao/content.js` |
| `extension/live-recorder.html` | `extensao/live-recorder.html` |
| `extension/live-recorder.js` | `extensao/live-recorder.js` |
| `extension/manifest.json` | `extensao/manifest.json` |
| `extension/playback-background.js` | `extensao/playback-background.js` |
| `extension/playback.js` | `extensao/playback.js` |
| `extension/popup.css` | `extensao/popup.css` |
| `extension/popup.html` | `extensao/popup.html` |
| `extension/popup.js` | `extensao/popup.js` |
| `extension/targets.js` | `extensao/targets.js` |
| `extension/tests/content.test.cjs` | `extensao/tests/content.test.cjs` |
| `extension/tests/live-recorder.test.cjs` | `extensao/tests/live-recorder.test.cjs` |
| `extension/tests/playback.test.cjs` | `extensao/tests/playback.test.cjs` |
| `extension/tests/recorder.test.cjs` | `extensao/tests/recorder.test.cjs` |
| `extension/tests/targets.test.cjs` | `extensao/tests/targets.test.cjs` |
| `extension/theme.css` | `extensao/theme.css` |
| `extension/theme.js` | `extensao/theme.js` |
| `frontend/angular.json` | `front/angular.json` |
| `frontend/package-lock.json` | `front/package-lock.json` |
| `frontend/package.json` | `front/package.json` |
| `frontend/src/app/app.component.ts` | `front/src/app/app.component.ts` |
| `frontend/src/app/app.config.ts` | `front/src/app/app.config.ts` |
| `frontend/src/app/app.routes.ts` | `front/src/app/app.routes.ts` |
| `frontend/src/app/components/guide-editor/guide-editor.component.css` | `front/src/app/components/guide-editor/guide-editor.component.css` |
| `frontend/src/app/components/guide-editor/guide-editor.component.html` | `front/src/app/components/guide-editor/guide-editor.component.html` |
| `frontend/src/app/components/guide-editor/guide-editor.component.ts` | `front/src/app/components/guide-editor/guide-editor.component.ts` |
| `frontend/src/app/components/guide-editor/step-capture.component.ts` | `front/src/app/components/guide-editor/step-capture.component.ts` |
| `frontend/src/app/components/guide-editor/step-narration.component.ts` | `front/src/app/components/guide-editor/step-narration.component.ts` |
| `frontend/src/app/components/guide-list/guide-list.component.css` | `front/src/app/components/guide-list/guide-list.component.css` |
| `frontend/src/app/components/guide-list/guide-list.component.html` | `front/src/app/components/guide-list/guide-list.component.html` |
| `frontend/src/app/components/guide-list/guide-list.component.ts` | `front/src/app/components/guide-list/guide-list.component.ts` |
| `frontend/src/app/components/guide-list/workspace-invite.component.ts` | `front/src/app/components/guide-list/workspace-invite.component.ts` |
| `frontend/src/app/components/login/account.component.css` | `front/src/app/components/login/account.component.css` |
| `frontend/src/app/components/login/account.component.html` | `front/src/app/components/login/account.component.html` |
| `frontend/src/app/components/login/account.component.ts` | `front/src/app/components/login/account.component.ts` |
| `frontend/src/app/components/login/google-sign-in.component.ts` | `front/src/app/components/login/google-sign-in.component.ts` |
| `frontend/src/app/components/login/login.component.css` | `front/src/app/components/login/login.component.css` |
| `frontend/src/app/components/login/login.component.html` | `front/src/app/components/login/login.component.html` |
| `frontend/src/app/components/login/login.component.ts` | `front/src/app/components/login/login.component.ts` |
| `frontend/src/app/components/settings-modal/settings-modal.component.css` | `front/src/app/components/settings-modal/settings-modal.component.css` |
| `frontend/src/app/components/settings-modal/settings-modal.component.html` | `front/src/app/components/settings-modal/settings-modal.component.html` |
| `frontend/src/app/components/settings-modal/settings-modal.component.ts` | `front/src/app/components/settings-modal/settings-modal.component.ts` |
| `frontend/src/app/components/shared/octor-icon.component.ts` | `front/src/app/components/shared/octor-icon.component.ts` |
| `frontend/src/app/components/trainings/training-admin.component.html` | `front/src/app/components/trainings/training-admin.component.html` |
| `frontend/src/app/components/trainings/training-admin.component.ts` | `front/src/app/components/trainings/training-admin.component.ts` |
| `frontend/src/app/components/trainings/training-dashboard.component.html` | `front/src/app/components/trainings/training-dashboard.component.html` |
| `frontend/src/app/components/trainings/training-dashboard.component.ts` | `front/src/app/components/trainings/training-dashboard.component.ts` |
| `frontend/src/app/components/trainings/training-list.component.ts` | `front/src/app/components/trainings/training-list.component.ts` |
| `frontend/src/app/components/trainings/training-nav.component.ts` | `front/src/app/components/trainings/training-nav.component.ts` |
| `frontend/src/app/components/trainings/training-player.component.html` | `front/src/app/components/trainings/training-player.component.html` |
| `frontend/src/app/components/trainings/training-player.component.ts` | `front/src/app/components/trainings/training-player.component.ts` |
| `frontend/src/app/components/trainings/trainings.css` | `front/src/app/components/trainings/trainings.css` |
| `frontend/src/app/services/auth.guard.ts` | `front/src/app/services/auth.guard.ts` |
| `frontend/src/app/services/auth.interceptor.ts` | `front/src/app/services/auth.interceptor.ts` |
| `frontend/src/app/services/auth.service.ts` | `front/src/app/services/auth.service.ts` |
| `frontend/src/app/services/guide.service.ts` | `front/src/app/services/guide.service.ts` |
| `frontend/src/app/services/training-admin.guard.ts` | `front/src/app/services/training-admin.guard.ts` |
| `frontend/src/app/services/training.service.ts` | `front/src/app/services/training.service.ts` |
| `frontend/src/index.html` | `front/src/index.html` |
| `frontend/src/main.ts` | `front/src/main.ts` |
| `frontend/src/styles.css` | `front/src/styles.css` |
| `frontend/src/theme.css` | `front/src/theme.css` |
| `frontend/tests/capture.test.cjs` | `front/tests/capture.test.cjs` |
| `frontend/tests/narration.test.cjs` | `front/tests/narration.test.cjs` |
| `frontend/tsconfig.app.json` | `front/tsconfig.app.json` |
| `frontend/tsconfig.json` | `front/tsconfig.json` |
