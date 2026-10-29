# Configurações da conta

A rota `/account` oferece Perfil, Segurança e acesso, e Conexões, seguindo a identidade visual do Octo e com layout adaptado ao celular.

## Perfil e identidade

- Nome, sobrenome e nome de usuário podem ser atualizados pela própria pessoa.
- O e-mail de contato pode ser atualizado em Segurança e acesso. A mudança não altera a identidade Google vinculada.
- Usuário e e-mail possuem validação de duplicidade sem diferenciar maiúsculas e minúsculas. Campos de privilégios e identificadores não são gravados pelo formulário de perfil.
- Alterar usuário ou e-mail exige senha atual; contas sem senha exigem uma nova confirmação da identidade Google vinculada, com challenge e nonce de uso único.
- O e-mail informado é validado em formato e duplicidade. Esta versão não envia confirmação por e-mail nem oferece recuperação de senha por e-mail.

## Senha e acessos

A nova senha é confirmada no formulário e validada no Django quanto a tamanho mínimo, similaridade aos dados pessoais, senhas comuns e conteúdo apenas numérico. A senha precisa diferir da atual. Contas Google sem senha podem criar a primeira senha após confirmar a identidade Google.

Cada conta possui `UserSettings.session_version`. A autenticação e a renovação JWT verificam essa versão. Trocar a senha ou desconectar outros acessos incrementa a versão e emite um novo par de tokens para o navegador atual. Os tokens anteriores, inclusive de renovação e da extensão, deixam de funcionar. A extensão deve ser reconectada após essas ações.

Tokens legados sem a versão continuam funcionando enquanto a versão da conta for zero. O número da versão e as senhas não são retornados na representação pública da conta.

## Endpoints autenticados

- `GET /api/auth/me/`: dados atuais, vínculo Google, existência de senha, data de criação e último login disponível.
- `PATCH /api/auth/profile/`: nome, sobrenome, usuário e e-mail. `current_password` confirma mudanças sensíveis para contas com senha; `credential` e `challenge` confirmam a identidade para contas Google sem senha.
- `POST /api/auth/password/`: `new_password`, `confirmation` e confirmação de identidade. Retorna `access`, `refresh` e `user`.
- `POST /api/auth/sessions/revoke/`: confirmação de identidade; retorna uma nova sessão para o navegador atual.
- `POST /api/auth/refresh/`: usa o mesmo endereço anterior, agora verificando a versão da sessão.

Os endpoints de alteração utilizam o limite de requisições de autenticação. A migração `accounts.0003_usersettings_session_version` deve ser aplicada antes de servir a versão atualizada.

Os testes cobrem isolamento entre contas, privilégios, duplicidades, validação de senha, confirmação de identidade Google, tokens antigos, renovação, revogação e entradas inválidas. A revisão de navegador usa respostas controladas para validar os formulários; o Google real depende do Client ID configurado no servidor.
