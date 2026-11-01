# Back — API e persistência do OCTOR

Servidor Django/DRF do **OCTOR**. Centraliza usuários e sessões, permissões de guias/equipes, capturas e voz, geração de instruções e treinamentos com avaliação após concluir o conteúdo. É consumido pelo [frontend](../front/README.md) e pela [extensão](../extensao/README.md).

## Tecnologias e versões

As faixas abaixo vêm de `requirements.txt`; a coluna local foi consultada no ambiente virtual existente. Não há lockfile Python, portanto uma instalação nova pode resolver versões diferentes dentro dessas faixas.

| Dependência | Faixa declarada | Ambiente inspecionado |
| --- | --- | --- |
| Python | Sem versão fixada no repositório | 3.13.14 |
| Django | `>=5.1,<6.0` | 5.2.18 |
| Django REST Framework | `>=3.15.0` | 3.18.3 |
| SimpleJWT | `>=5.3.1` | 5.5.1 |
| django-cors-headers | `>=4.4.0` | 4.9.0 |
| Celery | `>=5.4.0` | 5.6.3 |
| redis, cliente Python | `>=5.0.0` | 8.1.0 |
| psycopg | `>=3.2.0`, extra binary | 3.3.6 |
| Pillow | `>=10.4.0` | 12.3.0 |
| python-dotenv | `>=1.0.1` | 1.2.4 |
| google-auth | `>=2.38,<3` | **Ausente no ambiente local** |
| requests | `>=2.32,<3` | 2.34.2 |

SQLite é o padrão local (biblioteca 3.50.4 no Python inspecionado). O Compose da raiz declara PostgreSQL `16-alpine` e Redis `7-alpine`; essas tags são do servidor, diferentes das versões dos clientes Python, e não comprovam containers em execução.

## Estrutura

```text
back/
├── manage.py                 # comandos Django
├── config/                   # settings, URLs, WSGI e Celery
├── accounts/                 # JWT, Google, perfil e revogação
├── guides/                   # guias, passos, equipes, convites e permissões
├── trainings/                # snapshots de conteúdo, participação, feedback e analytics
│   └── management/commands/  # seed de demonstração
├── ai/                       # prompts, provedores e transcrição
├── videos/                   # registro de job e pipeline atualmente simulado
├── requirements.txt
├── .env*.example             # exemplos sem credenciais reais
├── db.sqlite3                # dados locais ignorados pelo Git
├── media/                    # capturas e áudios locais ignorados
└── venv/                     # ambiente local ignorado
```

Cada app mantém models, serializers/views, URLs, migrações e testes quando aplicáveis. `staticfiles/` é o destino configurado de `collectstatic`, não uma pasta de fontes a editar.

## Instalar e configurar

Para **clone novo**, sem um ambiente virtual existente:

```powershell
cd "C:\Users\victo\.gemini\antigravity\scratch\PROJETO OCTOR\back"
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item -LiteralPath .env.example -Destination .env
```

Não execute a cópia sobre um `.env` já configurado. O ambiente movido da instalação atual deve ser usado por `venv\Scripts\python.exe`; `pip.exe`, `celery.exe` e scripts de ativação podem conservar o caminho anterior. Uma recriação não foi executada nesta etapa.

### Variáveis lidas por config/settings.py

| Variável | Função/configuração |
| --- | --- |
| `SECRET_KEY` | Assinatura Django/JWT; configurar segredo próprio no servidor. O fallback existente é de desenvolvimento. |
| `DEBUG` | Padrão atual verdadeiro; desabilitar para produção. |
| `ALLOWED_HOSTS` | Hosts separados por vírgula; padrão atual `*`, a restringir antes de publicar. |
| `DB_ENGINE` | `postgresql` seleciona PostgreSQL; outro valor usa SQLite local. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Conexão PostgreSQL. Nomes legados `autoguide_*` foram mantidos para preservar a base existente. |
| `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | Padrão local `redis://localhost:6379/0`. |
| `GOOGLE_CLIENT_ID` | ID público OAuth Web; este fluxo não usa Client Secret. |
| `LLM_PROVIDER` | Seleção implementada: `gemini`, `openai` ou `anthropic`. |
| `LLM_API_KEY` | Chave usada somente no backend; aceita `GEMINI_API_KEY` como fallback. |
| `LLM_MODEL` | Sobrescreve o modelo usado pelo provedor. Conferir compatibilidade da operação antes de configurar. |

O `.env` é carregado a partir da pasta `back`, independentemente da pasta de trabalho do processo. Não há leitura de `DATABASE_URL` implementada. `MEDIA_ROOT` e `STATIC_ROOT` vêm dos caminhos declarados em settings, não de variáveis extras inventadas no `.env`.

Para PostgreSQL/Redis locais, opcionalmente execute na raiz: `docker compose up -d postgres redis`. Isso não muda sozinho a seleção do banco: configure `DB_ENGINE=postgresql` e a conexão. Trocar de SQLite para PostgreSQL **não migra os dados existentes automaticamente**. As credenciais do Compose são de desenvolvimento.

## Executar

Na pasta `back`:

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py createsuperuser
.\venv\Scripts\python.exe manage.py runserver 8000
```

Use `createsuperuser` somente quando precisar criar a conta administrativa; não existe senha administrativa universal que deva ser usada em produção. Administração Django: `http://localhost:8000/admin/`. API: `http://localhost:8000/api/`.

Com Redis disponível, o worker Windows de desenvolvimento pode ser iniciado em outro terminal:

```powershell
.\venv\Scripts\python.exe -m celery -A config worker --loglevel=info -P solo
```

Os endpoints atuais de geração textual e preparação de narração executam seu fluxo na requisição HTTP; não exigem worker para iniciar esse fluxo. O job de vídeo usa `.delay()`. Sua implementação apenas simula progresso: não produz TTS, avatar ou vídeo final real. Sem broker/worker, um job pode permanecer pendente, pois a falha de despacho é capturada pelo código atual.

## Funcionalidades e fluxo de dados

- Conta: cadastro/login emitem JWT, senha é tratada pelo Django e operações sensíveis exigem reconfirmação. Mudança de senha/revogação atualiza a versão de sessão. Access dura 7 dias e refresh 30 dias na configuração atual; rotação de refresh está desativada.
- Guias: criador registra procedimentos e passos; acesso considera autoria, equipe, publicação, compartilhamento e lixeira. Favorito é preferência individual.
- Mídia: capturas em base64 são validadas e persistidas como arquivos; narração individual e áudio compartilhado usam campos de arquivo e anotações/intervalos. Metadados ficam no banco; arquivos ficam em `media`.
- IA: chave do ambiente, contexto do passo, captura e/ou voz são usados pelo provedor. Geração falha sem substituir instruções por um resultado parcial inválido. A transcrição atual de voz usa o fluxo Gemini; não presume suporte equivalente nos outros provedores textuais.
- Treinamentos: publicação cria uma versão congelada do procedimento, sem perguntas. Participação registra início e conclusão; a avaliação fica disponível após concluir o conteúdo. Resultados antigos de quiz permanecem no banco apenas como histórico, sem uso nos endpoints e indicadores atuais.
- Duplicidade: validações, transações, bloqueios e restrições do banco protegem a avaliação. Reenvio idêntico retorna o registro existente; mudar os dados de uma avaliação já enviada retorna conflito.

### Endpoints principais

Todos os caminhos abaixo são relativos a `/api/`; manter a barra final evita redirecionamentos em operações de escrita.

| Método e caminho | Uso |
| --- | --- |
| `POST auth/register/`, `POST auth/login/` | Cadastro/login: sessão com access, refresh e user |
| `POST auth/refresh/` | Recebe refresh e retorna access conforme o contrato JWT |
| `GET auth/me/`, `PATCH auth/profile/` | Perfil autenticado |
| `POST auth/password/`, `POST auth/sessions/revoke/` | Senha e revogação de outras sessões |
| `GET/PATCH auth/settings/` | Preferências aceitas pelo serializer |
| `GET auth/google/config/`, `POST auth/google/challenge/` | Configuração pública e tentativa Google |
| `POST auth/google/login/`, `POST auth/google/link/` | Autenticação/vinculação Google |
| CRUD `guides/`, `guides/<id>/` | Biblioteca e procedimento |
| `POST guides/<id>/steps/`, `POST guides/<id>/bulk-steps/` | Passo manual e conjunto capturado |
| CRUD `guides/steps/<id>/` | Detalhe/edição/exclusão de passo; listagem em `guides/steps/` |
| `POST guides/<id>/favorite/`, `restore/`, `permanent-delete/` | Favorito, restauração e exclusão definitiva |
| `GET/POST/DELETE guides/<id>/share/` | Compartilhamento direto |
| CRUD `workspaces/`, `workspaces/<id>/` | Equipes |
| `GET/DELETE workspaces/<id>/members/` | Membros |
| `GET/POST/DELETE workspaces/<id>/invitations/` | Convites da equipe |
| `GET/POST workspaces/invitations/<token>/` | Consultar/aceitar convite |
| `POST guides/<id>/generate-text/`, `guides/<id>/steps/<step_id>/generate-text/` | Gerar instruções do guia/passo |
| `POST guides/<id>/prepare-narration/` | Preparar transcrições para geração das instruções |
| `POST guides/<id>/video/`, `GET video-jobs/<id>/` | Criar/acompanhar job de vídeo simulado |
| `GET trainings/capabilities/` | Capacidade de gestão |
| `GET trainings/`, `GET trainings/<id>/` | Treinamentos e progresso do participante |
| `POST trainings/<id>/<action>/` | `start`, `complete`, `feedback` |
| `GET/POST trainings/admin/`, `GET/PATCH trainings/admin/<id>/` | Lista/criação/detalhe/edição administrativa |
| `POST trainings/admin/<id>/<action>/` | `publish`, `archive`, `assign` |
| `GET trainings/admin/<id>/participants/<user_id>/` | Respostas e comentário do participante |
| `GET trainings/admin/dashboard/` | Indicadores, rankings e comentários |

Filtros de analytics: `start`, `end` (datas), `rating` (1–5); dashboard aceita também `training` no escopo administrável. Consulte serializers/views para os payloads exatos.

Web e extensão usam `Authorization: Bearer <access>`. A extensão renova a sessão após 401 no fluxo de envio conforme seu próprio código. Google sem credenciais reais configuradas não foi validado ponta a ponta. CORS permite comunicação do navegador, mas não substitui autenticação/permissões.

## Testes e demonstração

```powershell
.\venv\Scripts\python.exe manage.py test --noinput
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

A suíte anterior à remoção do quiz passou com 89 testes e banco temporário. A remoção possui regressões específicas de conteúdo, avaliação e preservação de histórico. Integrações de IA/Google são simuladas nos cenários pertinentes; aprovação não comprova disponibilidade ou faturamento de um provedor real.

Seed opcional, **somente em desenvolvimento** (`DEBUG=True`):

```powershell
.\venv\Scripts\python.exe manage.py seed_trainings --password "ESCOLHA-UMA-SENHA-LOCAL-FORTE"
```

Cria contas com prefixo `octor_demo_` e treinamentos `[DEMO]`. É repetível e não redefine senhas de contas já existentes. O comando grava dados locais e não foi executado como parte da documentação. Nunca crie essas contas em uma base de produção.

## Deploy

O ponto de entrada disponível é `config.wsgi:application`. Uma entrega de produção exige servidor WSGI, proxy HTTPS, processo de worker quando necessário, banco persistente e tratamento de arquivos estáticos/mídias. **Gunicorn/servidor WSGI de produção não está declarado nas dependências e não há Dockerfile da aplicação.** O Compose existente executa somente PostgreSQL e Redis. Não há deploy pronto configurado nesta etapa.

Antes de publicar, preparar em uma etapa própria: `DEBUG=False`, segredo forte, hosts restritos, CORS/CSRF de produção, domínio/HTTPS, política de acesso às mídias e backups de banco/arquivos. CORS atual é amplo e não é parametrizado por uma variável de ambiente de origens. O serviço de mídia anexado em `config/urls.py` funciona apenas com DEBUG; desligar DEBUG exige configurar entrega de mídia/estáticos separadamente. `collectstatic` usa `STATIC_ROOT`; não configura a entrega HTTP por conta própria.

Não usar `runserver` como servidor de produção. Não expor Redis/PostgreSQL diretamente sem rever a rede e as portas publicadas pelo Compose. Essas são pendências de publicação identificadas, não correções executadas neste trabalho.

Sequência de implantação, depois de preparar essas configurações e backups:

1. Instalar dependências no ambiente do servidor e configurar as variáveis privadas.
2. Aplicar migrações, reunir estáticos e conferir os avisos de produção:

   ```sh
   python manage.py migrate
   python manage.py collectstatic --noinput
   python manage.py check --deploy
   ```

3. Instalar e configurar um servidor WSGI. Exemplo **adicional, não incluído no requirements atual**, para Linux:

   ```sh
   python -m pip install gunicorn
   python -m gunicorn config.wsgi:application --bind 127.0.0.1:8000
   ```

4. Configurar proxy HTTPS na frente desse processo e entrega de estáticos/mídia com a política de acesso definida. Manter o processo sob gerenciamento de serviços do servidor.
5. Iniciar Redis e, se houver uso de tarefas, um worker separado: `python -m celery -A config worker --loglevel=info`. Configurar persistência, reinício e acompanhamento de falhas.
6. Testar a integração com os endereços públicos preparados nos demais módulos antes de liberar usuários.

Os comandos são instruções para uma futura implantação; nenhum servidor WSGI foi instalado nem publicado durante a documentação. `check --deploy` é uma verificação complementar, não comprovação de que a aplicação está pronta para produção.

## Problemas comuns

| Sintoma | Causa/conferência |
| --- | --- |
| pip.exe ou celery.exe não inicia após mover pastas | Usar o interpretador explícito com `-m pip` / `-m celery`; recriar o ambiente em uma ação separada se necessário. |
| Google indisponível | `google-auth` consta nos requisitos mas está ausente no venv inspecionado. Executar instalação dos requisitos quando autorizado, configurar o client ID e conferir origens da aplicação Google. |
| Erro de tabela/coluna | Conferir o banco selecionado e executar `manage.py migrate` nessa base. |
| 401 ou token expirado/revogado | Fazer login novamente na web/extensão; uma revogação torna inválida a versão antiga da sessão. |
| IA não gera instrução | Conferir chave/modelo/provedor no servidor, conectividade e status retornado; nunca colocar a chave no cliente para contornar a falha. |
| Áudio não transcreve | Conferir formato, tamanho, intervalo e provedor de voz suportado; a ausência de texto não deve ser substituída por fala inventada. |
| Job de vídeo fica pending | Verificar broker e worker, lembrando que o pipeline atual é uma simulação. |
| Captura dá 404 depois do deploy | Conferir persistência/entrega de media e DEBUG; não basta copiar somente o banco. |
| Conflito 409 ao enviar duas vezes | Recarregar o estado; as restrições impedem duplicar uma escrita concorrente. |

Detalhes adicionais: [conta](../docs/account-settings.md), [equipes](../docs/library-and-workspaces.md), [treinamentos](../docs/trainings-feedback-quiz.md) e [IA](ai/README.md).
