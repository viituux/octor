# Biblioteca e espaços de trabalho

A biblioteca do Octo oferece Rascunhos, Publicados, Compartilhados comigo, Favoritos, Biblioteca da equipe e Lixeira, com busca e visualizações em cartões ou lista. A captura da extensão continua criando guias pessoais; o proprietário pode movê-los para um espaço pela opção do cartão.

## Acesso

- O proprietário do guia pode revisar, publicar, compartilhar, mover e excluir.
- Membros de um espaço consultam os guias publicados nele. Rascunhos não são liberados automaticamente à equipe.
- Compartilhamento direto concede leitura a uma conta já cadastrada, inclusive para rascunhos.
- Leitores podem consultar os passos, ouvir áudios, usar Me guie, exportar PDF e manter seus próprios favoritos. A API impede alterações no guia e nos passos.
- Excluir move o guia à lixeira do proprietário e interrompe a consulta dos leitores. Restaurar mantém o conteúdo e os acessos anteriores. A exclusão definitiva exige que o guia esteja na lixeira.

## Equipes e convites

O criador do espaço é seu administrador e pode renomeá-lo, listar membros, remover membros e gerar ou revogar convites. O administrador não pode remover a própria associação. A exclusão de espaços não é oferecida nesta versão.

Convites são links válidos por sete dias, vinculados ao e-mail convidado. O usuário precisa entrar ou cadastrar uma conta com esse e-mail e aceitar o convite em `/join/:token`. O envio do link é manual; não há disparo de e-mail. O token é exibido apenas na criação e armazenado no banco como SHA-256. Gerar outro convite revoga os anteriores pendentes do mesmo endereço. Remover um membro revoga também os seus convites anteriores.

Espaços legados que não possuem administrador continuam disponíveis para consulta dos membros; um administrador deve ser definido explicitamente pelo operador no Django antes de gerenciar convites.

## API

- `GET/POST /api/workspaces/` e `PATCH /api/workspaces/:id/`.
- `GET/DELETE /api/workspaces/:id/members/` (`user_id` na remoção).
- `GET/POST/DELETE /api/workspaces/:id/invitations/` (`email` para criar; `invitation_id` para revogar).
- `GET/POST /api/workspaces/invitations/:token/` para consultar e aceitar.
- `GET /api/guides/?include_trash=1` inclui os guias da lixeira do próprio usuário.
- `POST /api/guides/:id/favorite/` com booleano `favorite`.
- `GET/POST/DELETE /api/guides/:id/share/` (`email` para conceder; `user_id` para revogar).
- `DELETE /api/guides/:id/` move para lixeira; `POST .../restore/` restaura; `POST .../permanent-delete/` exclui definitivamente.

Aplicar `python manage.py migrate` antes de servir a biblioteca atualizada. A migração 0006 adiciona as relações e datas sem apagar os guias existentes. Para produção, servir os arquivos privados por uma camada autenticada; a configuração local de mídia do Django continua destinada ao desenvolvimento.
