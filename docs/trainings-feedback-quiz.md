# Treinamentos e avaliações — OCTOR

## Fluxo atual

O treinamento referencia um guia e preserva uma cópia de seus passos a cada publicação. O responsável define título, descrição e participantes por e-mail. Publicar exige um guia acessível, fora da lixeira e com pelo menos um passo; não exige perguntas, limite de tentativas, revisão de gabarito ou geração de sugestões.

O participante encontra o treinamento em **Meus treinamentos**, inicia e percorre o conteúdo ou utiliza **Me guie**. Ao concluir, segue diretamente para **Avaliação**: 1 a 5 estrelas e comentário opcional com até 500 caracteres. A confirmação distingue envio com ou sem comentário. Reabrir o treinamento mantém a conclusão e a avaliação já gravadas.

O envio exige participação autorizada e conteúdo concluído. Avaliação idêntica repetida retorna o registro existente; uma alteração conflitante retorna 409. A restrição única por treinamento/usuário continua no banco. Falha ao concluir não libera a avaliação, e falha ao avaliar preserva o formulário para tentar novamente.

## Administração e dashboard

- Criar, editar, publicar, atribuir e arquivar treinamentos.
- Listar participantes, realização, avaliação, comentário, estrelas e data.
- Inspecionar datas e comentário completo de um participante autorizado.
- Exibir total de conclusões, média de estrelas, total de comentários, ranking de treinamentos por avaliação e evolução mensal de conclusões.
- Filtrar por período, estrelas e treinamento no dashboard.

Não há cadastro de perguntas, respostas, nota, acertos, tentativas ou ranking de participantes por pontuação na interface/API de leitura atual.

Os filtros de data consideram a conclusão para conclusões e a data de envio para avaliações. Estrelas filtram avaliações; a base de participantes atribuídos é mantida no cálculo da taxa de conclusão. Concluir registra o acompanhamento declarado do procedimento, não comprova domínio das ações no sistema real.

## Dados anteriores e compatibilidade

A remoção não apaga perguntas, resultados, respostas nem versões anteriores do banco. Os modelos antigos e campos legados continuam definidos somente para preservar esses dados; nenhuma migração destrutiva é necessária. `QuizVersion` mantém seu nome histórico de tabela/modelo, mas novas publicações guardam somente o snapshot do procedimento, sem criar questões. Participantes que já iniciaram mantêm seu snapshot original.

Resultados antigos não são lidos para liberar avaliação nem retornados em detalhes de participante ou analytics. Tentativa antiga incompleta não bloqueia a avaliação quando o conteúdo já foi concluído. Um resultado antigo também não substitui a exigência de conclusão do conteúdo.

Chamadas autenticadas/autorizadas aos antigos `quiz-start`, `answer` e `suggestions` retornam **410 — recurso removido**, sem criar dados ou chamar IA. Campos `draft_questions` e `max_attempts` são rejeitados no cadastro/edição para avisar clientes antigos. A autorização permanece anterior à operação: usuários alheios não ganham acesso ao histórico por esses caminhos.

O nome deste arquivo conserva `quiz` apenas para não quebrar links existentes na documentação; o módulo ativo não possui mais essa etapa.

## Endpoints principais

Todos os caminhos abaixo partem de `/api/trainings/` e exigem Bearer:

| Método/caminho | Finalidade |
| --- | --- |
| `GET capabilities/` | Capacidade administrativa |
| `GET /`, `GET <id>/` | Treinamentos atribuídos, snapshot e progresso |
| `POST <id>/start/` | Iniciar ou retomar, sem duplicar participação |
| `POST <id>/complete/` | Concluir conteúdo iniciado |
| `POST <id>/feedback/` | Avaliar conteúdo concluído |
| `GET/POST admin/` | Listar/criar treinamentos administráveis |
| `GET/PATCH admin/<id>/` | Detalhes, participantes e edição |
| `POST admin/<id>/publish/` | Publicar snapshot do procedimento |
| `POST admin/<id>/assign/` | Atribuir contas existentes por e-mail |
| `POST admin/<id>/archive/` | Preservar histórico e bloquear novas atividades |
| `GET admin/<id>/participants/<user_id>/` | Datas e avaliação individual |
| `GET admin/dashboard/` | Indicadores, ranking de avaliações e comentários |

O cadastro/edição aceita `guide`, `title` e `description`. Não pode trocar o guia de um treinamento existente. Publicação não precisa de corpo de perguntas/revisão. A atribuição recebe `emails`; feedback recebe `stars` e `comment` opcional. Consulte serializers/views para limites. Filtros atuais: `start`, `end`, `rating` e, no dashboard, `training`.

## Me guie

O participante pode iniciar a orientação pela extensão. A URL de retorno fica restrita à rota de treinamento da aplicação confiável. Ao concluir a orientação, o portal solicita a conclusão autenticada e apresenta a avaliação; cancelar a orientação não conclui o conteúdo. O usuário também pode acompanhar os passos no próprio portal, sem extensão.

O Me guie continua atuando sobre o site real e permite pular etapas; não é simulação isolada e não executa ações do site automaticamente. A remoção do quiz não altera esse comportamento.

## Executar e testar

Use os READMEs de [back](../back/README.md), [front](../front/README.md) e [extensão](../extensao/README.md) para instalar/iniciar. Nenhuma migration nova é exigida por esta remoção. Recarregue a aplicação web depois de atualizar o frontend/backend.

Na pasta `back`:

```powershell
.\venv\Scripts\python.exe manage.py test --noinput
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Na raiz:

```powershell
node --test extensao/tests/*.test.cjs front/tests/*.test.cjs
```

No `front`: `npm run build`.

Seed opcional, somente em desenvolvimento: `python manage.py seed_trainings --password "SUA-SENHA-LOCAL"`, usando o interpretador do venv. Agora cria demonstrações de conteúdo e avaliações, sem questões ou resultados. Reexecução preserva contas, senhas e dados existentes. Não execute na base real para testar a remoção.

Roteiro manual:

1. Criar treinamento a partir de um guia com passos, publicar sem perguntas e atribuir uma conta.
2. Entrar como participante, iniciar, navegar e concluir; deve abrir diretamente a avaliação.
3. Recarregar antes de avaliar; deve permanecer na etapa liberada.
4. Enviar estrelas/comentário; recarregar e verificar confirmação, sem formulário duplicado.
5. Revisar o conteúdo e voltar à avaliação registrada.
6. Conferir lista, detalhes e dashboard, sem pontuação ou ranking de participantes.
7. Simular falha de rede na conclusão e no feedback; não deve haver avanço antecipado nem perda do formulário.
8. Validar também largura de celular e um treinamento arquivado (consulta permitida, novas atividades bloqueadas).
