# PostgreSQL local do OCTOR

## Configuração aplicada

- Banco: `octor_db`.
- Usuário local: `postgres`.
- Servidor: `localhost:5432`, PostgreSQL 18 instalado no Windows.
- Credenciais: somente em `back/.env`, ignorado pelo Git.
- Django utiliza exclusivamente PostgreSQL, configurado por `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`.
- O Compose não é necessário para este PostgreSQL instalado no Windows.

## Transferência realizada em 05/11/2026

Aplicadas as migrations no banco de destino vazio e importados 162 registros do SQLite. A comparação dos dois exports confirmou os campos e relacionamentos transferidos. Tipos de conteúdo e permissões padrão foram recriados pelas migrations; vínculos a permissões usam chaves naturais.

A base SQLite anterior e seus backups foram arquivados fora do projeto em `D:\OCTOR-BACKUPS\sqlite-legado-20261105/`. Não são usados pela aplicação. Capturas e áudios continuam em `back/media/`; seus caminhos foram mantidos.

A importação desativou temporariamente, apenas no processo de carga, o sinal de criação de preferências do usuário, evitando recriar preferências já presentes no export. Não houve mudança no comportamento de cadastro da aplicação.

## Executar

No PowerShell:

```powershell
Set-Location 'D:\PROJETO OCTOR\back'
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py runserver
```

Reinicie qualquer backend que estivesse aberto antes da troca para carregar o novo ambiente. Frontend e extensão continuam utilizando a mesma API.

## Banco único

O suporte e a seleção de SQLite foram removidos. `DB_ENGINE` não é utilizado. O PostgreSQL precisa estar disponível para executar a aplicação e os testes. Os backups legados são somente um arquivo de segurança e não recebem novas gravações.

## Observação para hospedagem

O usuário `postgres` é usado nesta instalação local. Uma publicação deve configurar uma conta própria da aplicação com permissões adequadas e senha forte; não publicar o arquivo `.env` nem os backups.
