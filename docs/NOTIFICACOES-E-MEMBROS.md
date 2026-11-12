# Busca de membros e notificações internas

## Uso

1. Na biblioteca, selecione um espaço de equipe.
2. Abra **Configurações e membros** com a conta administradora desse espaço.
3. Em **Adicionar por nome de usuário**, digite pelo menos dois caracteres e clique em **Buscar usuário**.
4. Selecione a conta pelo username, clique em **Adicionar** e confirme. A pessoa passa a acessar os guias publicados da equipe; rascunhos continuam privados conforme as permissões existentes.
5. A pessoa adicionada recebe uma notificação interna. Os convites por e-mail/link existentes continuam disponíveis para o fluxo anterior.

A busca retorna até 20 contas ativas, exclui membros existentes e não revela seus e-mails. Refine o termo se necessário. Somente o proprietário do espaço pode pesquisar ou adicionar pessoas. A adição direta não é um convite pendente: ela concede acesso após a confirmação do administrador.

## Central de notificações

Acesse pelo sino no cabeçalho da biblioteca ou pelo item **Notificações** no menu. A central apresenta todas/não lidas, paginação, leitura individual, leitura em lote, estados vazios e recuperação de erro. O contador é consultado ao abrir a biblioteca e a cada 60 segundos; o botão Atualizar consulta imediatamente.

Novos eventos suportados:

- Adição direta a um espaço: avisa a pessoa adicionada.
- Remoção de um espaço: avisa a pessoa removida.
- Compartilhamento direto de um guia: avisa o destinatário.
- Atribuição de um treinamento: avisa o participante.

Os avisos são persistidos no PostgreSQL e não são recriados ao repetir a mesma operação sem mudança de acesso/atribuição. São gerados somente para novos eventos, sem preencher retroativamente operações antigas. Cada usuário consulta e marca somente seus próprios avisos. O caminho de destino não substitui as verificações de acesso do recurso: permissões revogadas continuam sendo respeitadas.

São notificações dentro do OCTOR. Não há envio de e-mail, push do navegador ou WebSocket nesta implementação.

## API

| Método | Endpoint | Acesso |
| --- | --- | --- |
| GET | `/api/workspaces/{id}/user-search/?q=nome` | Proprietário do espaço; mínimo 2 caracteres, limite 20 resultados, 30 consultas/minuto por usuário |
| POST | `/api/workspaces/{id}/members/` | Proprietário; corpo `{"user_id": 123}`; retorna os membros |
| GET | `/api/auth/notifications/?page=1&unread=true` | Destinatário autenticado; 20 itens/página e `unread_count` |
| POST | `/api/auth/notifications/{id}/read/` | Destinatário do aviso |
| POST | `/api/auth/notifications/read-all/` | Marca somente avisos do usuário autenticado |

Modelo: `accounts.Notification`, migration `accounts.0004_notification`. Campos: destinatário, tipo, título, mensagem, destino interno, data de leitura e data de criação. Índice por destinatário/leitura. Os avisos são salvos na mesma transação que as alterações de acesso ou atribuição.

## Executar e verificar

No backend, execute `python manage.py migrate` e reinicie o servidor se necessário. No frontend, execute `npm start` para desenvolvimento ou `npm run build` para gerar a versão distribuível.

Testes de integração novos: `python manage.py test accounts.test_notifications`.
Regressões relacionadas: `python manage.py test accounts.tests guides.test_library trainings`.

Validados 54 testes de backend e build Angular, além de fluxo desktop/celular com API Django real sobre banco PostgreSQL descartável: busca, adição, restrição de administrador, sino, contador, leitura persistente e navegação. Nenhuma conta ou equipe de demonstração foi adicionada ao banco de uso local.
