# Autorização de procedimentos para teste

Publicada na AWS em 16/11/2026, após autorização explícita. Migração guides.0008 aplicada em produção após backup do banco, backend e frontend. O banco de desenvolvimento persistente permanece sem migração nesta implementação.

## Fluxo

1. O criador prepara o guia e cria/publica o treinamento com o fluxo existente.
2. Atribui o treinamento ao participante em Administrar. A atribuição pode anteceder a autorização.
3. No guia, clica em Válido para Teste. O backend registra test_authorized_at e test_authorized_by e mantém a classificação técnica test.
4. O participante atualiza Meus treinamentos e passa a ver Me Guie. O link abre o treinamento autorizado; consentimento e início continuam obrigatórios. No conteúdo iniciado, Me guie no sistema revalida o acesso antes de chamar a extensão.

O menu Ambiente de produção foi removido do editor. A aprovação é idempotente e exclusiva do proprietário do guia, inclusive quando outro usuário administra o espaço. Uma classificação antiga como test não autoriza retroativamente: procedimentos existentes aguardam o clique explícito do criador. Publicação e atribuição continuam necessárias. Compartilhar um guia ou participar do espaço não substitui a atribuição.

## API e persistência

- POST /api/guides/{id}/authorize-test/: grava o aceite somente para o criador.
- GET /api/guides/{id}/playback-access/: exige autorização; devolve training_id para o participante atribuído e null para a revisão do próprio criador.
- POST /api/trainings/{id}/playback/: exige atribuição, autorização, publicação e treinamento iniciado.
- GET do treinamento e todas as ações do participante usam a mesma validação em my_part. Mídias de versões também passam por ela. A auditoria administrativa mantém o acesso previsto anteriormente.
- Campos de autoria/data são somente leitura no serializer. PATCH comum não forja o aceite. A migração 0008 adiciona campos nulos sem alterar snapshots ou participações.
- A lista sem liberação entrega apenas identificação, título, status e motivo de espera; não entrega conteúdo ou progresso.
- A extensão continua validando as origens permitidas. Autorizar não torna um site de produção seguro e não libera automaticamente um novo domínio.

## Validar localmente

Na pasta back, usando o Python do ambiente virtual e PostgreSQL local:

    python manage.py test guides.tests_test_authorization trainings.test_required_quiz trainings.test_archives guides.test_library --noinput
    python manage.py makemigrations --check --dry-run

Resultados: 8 testes de autorização e 37 regressões aprovados. Build Angular aprovado. Teste Chromium com API simulada aprovado; não substitui teste ponta a ponta com conta real/extensão.

Para testar a interface no banco de desenvolvimento, confira primeiro que DB_HOST aponta para localhost e faça backup local. Depois execute:

    python manage.py migrate guides

Não executar esse comando em produção sem autorização. O banco local persistente não foi migrado durante esta implementação; somente o banco descartável do runner recebeu as migrações.

No frontend:

    npm run build
    node tests/authorization.browser.cjs

O teste de navegador usa Playwright já instalado. Se o pacote estiver fora do projeto, defina PLAYWRIGHT_MODULE com seu caminho absoluto; CHROMIUM_PATH é opcional para um executável Chromium existente. Todas as chamadas do teste são simuladas e nenhuma conta de produção é usada.

Roteiro manual: atribuir e publicar sem autorizar; conferir lista bloqueada e HTTP 403 no GET/início; autorizar como criador; atualizar lista; abrir Me Guie, aceitar o termo e iniciar; conferir a extensão. Uma conta não atribuída continua bloqueada. A aprovação administrativa não altera o resultado ou a versão do quiz.
## Verificação do deploy

Backend e worker ativos. Site HTTPS e bundle main-CUJNQG3L.js retornaram HTTP 200. Verificação no backend confirmou bloqueio do treinamento e playback não autorizados e presença dos novos campos. Backup: /srv/octor/backups/test-authorization-20261117T001815Z. Validação manual com conta real e extensão continua pendente.

## Atualização local: liberação reversível e pré-visualização

Esta atualização ainda não foi publicada. Não exige nova migração: reutiliza os campos de autorização existentes.

- POST authorize-test aceita {"enabled": true} ou {"enabled": false}, somente pelo criador. O corpo vazio mantém compatibilidade com a ativação anterior. Valores não booleanos são recusados.
- Desativar remove a autorização atual; participações, versões e progresso permanecem no banco. Reativar restaura o acesso à participação existente.
- GET /api/guides/{id}/preview-training/ permite ao criador usar Visualizar Treinamento sem liberar participantes. A simulação utiliza o Me Guie existente e mantém as restrições de domínio da extensão.
- Aprovação/conclusão do treinamento permanece independente: o controle de liberação não aprova nem conclui participações.
- Lista, editor e player revalidam a permissão a cada 10 segundos enquanto a página está visível; o backend revalida cada acesso e ação. O endpoint GET /api/trainings/{id}/access/ verifica acesso sem transferir conteúdo.
- O player oculta o conteúdo ao detectar revogação. Não há comando de encerramento remoto de uma sessão da extensão que já esteja aberta.

Validação: 48 testes backend aprovados, build Angular aprovado e Chromium com API simulada aprovado (alternância, pré-visualização disponível, ocultação automática na lista e bloqueio de URL). Ainda falta teste ponta a ponta com contas e extensão reais.

Atualização publicada na AWS por solicitação do usuário em 16/11/2026 (Manaus). Backup: /srv/octor/backups/test-toggle-20261117T004117Z. Backend e worker ativos; Django check aprovado. Site e bundle main-XATVPG7F.js retornaram HTTP 200 com a pré-visualização nova. Nenhuma migração adicional necessária. A verificação de produção confirmou os campos; não havia participação publicada sem liberação disponível para repetir a checagem de bloqueio sem modificar dados. Os cenários de revogação permanecem cobertos pelos testes locais. Teste completo com contas reais e extensão pendente.
