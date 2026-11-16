# OCTOR

Plataforma web de documentação e orientação de processos: captura de ações no navegador, guias visuais, equipes e treinamentos com avaliação.

## Documentação

Para reconstruir o projeto na mão, comece pelo [roteiro de reconstrução](docs/RECONSTRUCAO.md).

- **[Documentação técnica completa](docs/DOCUMENTACAO-TECNICA.md)**: arquitetura, instalação, ambiente, modelos, API, segurança e operação.
- **[Manual do usuário](docs/MANUAL-DO-USUARIO.md)**: conta, gravação, voz, editor, Manual por URL, Me guie e treinamentos.
- [Quiz obrigatório e ranking](docs/QUIZ-OBRIGATORIO.md).
- [Versionamento e auditoria](docs/VERSIONAMENTO-E-AUDITORIA.md).
- [Índice da documentação](docs/README.md).
- [Frontend](front/README.md), [backend](back/README.md), [extensão](extensao/README.md) e [stack](docs/STACK.md).

Base consolidada em **6 de novembro de 2026**, verificada nos fontes atuais. A documentação técnica consolidada substitui descrições históricas de recursos já alterados.

## Estrutura

```text
PROJETO OCTOR/
├── front/                # Angular 19: interface web
├── back/                 # Django/DRF: API, PostgreSQL e integrações
│   ├── accounts/         # Conta, Google, sessões e notificações
│   ├── guides/           # Guias, passos e equipes
│   ├── trainings/        # Treinamentos, quiz obrigatório e feedback
│   ├── manuals/          # Capturas privadas, Manual por URL e revisão
│   ├── ai/               # Instruções e narração
│   └── videos/           # Pipeline de vídeo ainda simulado
├── extensao/             # Chrome MV3: captura, voz e Me guie
├── docs/                 # Documentação
├── scripts/              # Ferramentas compartilhadas de tema
├── design-tokens.json    # Tema claro e acento azul
└── docker-compose.yml    # PostgreSQL e Redis; não executa a aplicação inteira
```

## Iniciar localmente

Pré-requisitos: Python, Node/npm, PostgreSQL e Chrome 116 ou superior. Execute na raiz local `D:\PROJETO OCTOR`:

```powershell
# Somente para uma instalação nova; preserve um ambiente existente funcional.
python -m venv back/venv
back/venv/Scripts/python.exe -m pip install -r back/requirements.txt
```

Se ainda não existir, copie `back/.env.example` para `back/.env`. Crie o banco PostgreSQL e configure a conexão antes das migrations. Não sobrescreva seu `.env` existente.

```powershell
back/venv/Scripts/python.exe back/manage.py migrate
back/venv/Scripts/python.exe back/manage.py createsuperuser
back/venv/Scripts/python.exe back/manage.py runserver 8000
```

Em outro terminal, entre em `front/` e execute `npm ci` e `npm start`. Abra `http://localhost:4200`.

No Chrome, abra `chrome://extensions`, ative o modo do desenvolvedor e carregue sem compactação a pasta **`extensao`**. Conecte a conta no painel lateral. Recarregue extensão e páginas após atualizações.

O Compose mantém nomes legados de PostgreSQL e pode conflitar com o banco local na porta 5432. Consulte o guia técnico antes de utilizá-lo. SQLite não é uma alternativa configurada.

## Funcionalidades atuais

- Gravação de ações, contexto, seletores e capturas com verificações de consistência.
- Editor de passos, instruções por IA, narração e impressão para PDF pelo navegador.
- Biblioteca pessoal, favoritos, lixeira, compartilhamentos e equipes.
- Conta, perfil, senha, sessões e Google condicionado à configuração OAuth.
- Treinamentos com cinco perguntas obrigatórias nas novas versões, ranking por acertos/tempo, estrelas e comentários.
- Notificações internas com controle de leitura.
- **Me guie:** abre o sistema e destaca elementos; o usuário realiza as ações.
- **Manual por URL:** coleta até seis regiões de uma página e gera um rascunho para revisão com Gemini no backend.

As demais funções de IA mantêm a configuração Gemini. Chaves pertencem somente ao backend. O Manual por URL não navega autonomamente entre páginas e seus passos de referência não habilitam Me guie. O pipeline de vídeo é simulado e não produz arquivo final real. Não há captura desktop ou mascote. Treinamentos antigos preservam seu fluxo original.

A configuração de desenvolvimento exige revisão de CORS, hosts, URLs, HTTPS e acesso à mídia antes de hospedar dados reais. Consulte as limitações na documentação técnica.

## Verificação

Na raiz:

```powershell
back/venv/Scripts/python.exe back/manage.py check
back/venv/Scripts/python.exe back/manage.py test manuals --noinput
node --test front/tests/*.test.cjs
node --test extensao/tests/*.test.cjs
```

Em `front/`, execute `npm run build`. O guia técnico inclui os demais testes, dados de demonstração e roteiro de aceitação.

Repositório: [viituux/octor](https://github.com/viituux/octor).

### Gemini no Manual por URL

Instale as dependências com `python -m pip install -r back/requirements.txt`.
Configure `GEMINI_API_KEY` e `GEMINI_MODEL` em `back/.env`. Use um modelo Gemini
com entrada de imagem e saída JSON e reinicie a API e o worker do manual.
Carregue a extensão atualizada, abra Manual por URL e informe um objetivo.
Para validar a troca de conta, use um perfil de teste no YouTube, confira o
menu e a lista de contas capturados e revise o rascunho antes de criar o guia.
