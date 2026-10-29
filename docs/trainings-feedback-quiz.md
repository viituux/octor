# Treinamentos, quiz e avaliações — Octo

## O que foi implementado

O treinamento referencia um guia existente e preserva uma cópia do conteúdo a cada publicação. O administrador pode cadastrar título, descrição, limite de 1 a 5 tentativas, cinco perguntas com quatro alternativas e exatamente uma correta, explicações e participantes por e-mail. Um guia precisa ter ao menos um passo para publicação. Perguntas sugeridas pela IA são rascunhos; a publicação exige confirmação explícita de revisão, inclusive na API.

O destinatário encontra os treinamentos em **Meus treinamentos**, inicia o conteúdo, acompanha os passos ou usa **Me guie**, conclui o conteúdo e responde ao quiz. Cada resposta é salva e corrigida imediatamente pelo servidor. Uma resposta confirmada não muda; requisições repetidas com a mesma escolha são idempotentes. Uma tentativa interrompida é retomada na próxima pergunta. Depois do resultado, o participante avalia de 1 a 5 estrelas e pode comentar até 500 caracteres. Não existe nota mínima para liberar a avaliação.

A pontuação é 100 por acerto, máximo de 500; o percentual é acertos × 20. O tempo é medido no servidor entre início e fim da tentativa, incluindo interrupções. Não há limite de tempo nem bônus de rapidez. Uma tentativa é permitida por padrão; o administrador pode alterar o limite. Novas versões não apagam o limite nem liberam tentativas extras automaticamente.

O dashboard apresenta indicadores, barras de média por treinamento, evolução mensal de conclusões com tabela acessível, top 10 de usuários, ranking de treinamentos e últimos comentários. A melhor tentativa de cada usuário em cada treinamento conta uma vez. Empates compartilham posição. A taxa de conclusão é conclusões de conteúdo / participantes atribuídos; concluir o conteúdo não comprova domínio das ações e é separado de terminar quiz e avaliação. Os filtros de período consideram a data do evento de cada indicador; estrelas filtram avaliações e notas filtram resultados.

## Papéis e permissões

- Proprietários de guias podem criar e administrar seus próprios treinamentos.
- O proprietário do espaço também administra os treinamentos daquele espaço e pode utilizar guias publicados nele. Rascunhos privados de outras pessoas não podem ser copiados.
- Participantes acessam somente treinamentos atribuídos a eles. Atribuir por e-mail exige uma conta cadastrada; em espaços, também exige associação ao espaço.
- Sair ou ser removido de um espaço revoga o acesso ao treinamento daquele espaço, mantendo o histórico administrativo.
- Não há envio automático de e-mail de convite/atribuição.
- O mesmo usuário pode administrar seus treinamentos e participar de outros. Não é preciso tornar a pessoa superusuária do Django.
- Arquivar preserva histórico e bloqueia novas atividades. Restaurar a disponibilidade ocorre por uma nova publicação revisada.
- O guia de origem não pode ser excluído definitivamente enquanto estiver referenciado por treinamento. Isso preserva a origem do histórico.

## Modelos e migração

Novo app `backend/trainings`: Training, Participation, QuizVersion, QuizQuestion, QuizAlternative, QuizResult, QuizAnswer e Feedback. Migração: `trainings.0001_initial`.

Há unicidade no banco para participação, versão, número de tentativa, resposta por pergunta e avaliação por usuário/treinamento. Transações e bloqueio da participação coordenam respostas e limites de tentativa. Conflitos de gravação retornam 409 para repetição segura.

A versão publicada guarda conteúdo e questões imutáveis. A participação fixa a versão ao iniciar; edições posteriores não alteram os resultados nem o conteúdo daquela participação. O administrador pode continuar editando o rascunho e publicar uma nova versão para novos participantes.

## Rotas do portal

- `/trainings`: treinamentos recebidos.
- `/trainings/:id`: conteúdo, quiz, resultado e avaliação.
- `/training-admin`: lista administrativa.
- `/training-admin/new`: criação.
- `/training-admin/:id`: edição, perguntas, atribuição e consulta dos participantes.
- `/training-dashboard`: indicadores e rankings.

A biblioteca tem um acesso a Meus treinamentos. O editor oferece Criar treinamento com o guia pré-selecionado. As páginas do módulo oferecem Administrar e Dashboard apenas quando a API concede a capacidade administrativa.

## API REST autenticada

| Método | Endpoint em `/api/trainings/` | Finalidade |
|---|---|---|
| GET | `capabilities/` | Capacidade administrativa do usuário |
| GET | vazio | Participações do usuário |
| GET | `:id/` | Conteúdo e progresso próprios |
| POST | `:id/start/` | Iniciar conteúdo; idempotente |
| POST | `:id/complete/` | Concluir conteúdo; idempotente |
| POST | `:id/quiz-start/` | Iniciar/retomar quiz; retorna última tentativa quando o limite acabou |
| POST | `:id/answer/` | `result_id`, `question_id`, `alternative_id` |
| POST | `:id/feedback/` | `stars`, `comment` opcional |
| GET/POST | `admin/` | Listar/criar treinamentos administrados |
| GET/PATCH | `admin/:id/` | Detalhes/rascunho |
| POST | `admin/:id/publish/` | Publicar com `review_approved: true` |
| POST | `admin/:id/archive/` | Arquivar |
| POST | `admin/:id/assign/` | Atribuir lista `emails` |
| POST | `admin/:id/suggestions/` | Sugerir cinco perguntas para revisão |
| GET | `admin/:id/participants/:user_id/` | Histórico, respostas e comentário |
| GET | `admin/dashboard/` | Indicadores e rankings |

Filtros administrativos: `start` e `end` em YYYY-MM-DD, `rating` entre 1 e 5, `min_percent` entre 0 e 100. O dashboard também aceita `training=:id`.

O payload administrativo `draft_questions` tem cinco objetos `{statement, explanation, alternatives: [{text, correct}, ...]}`. `explanation` é opcional. Uma lista vazia pode ser salva antes de cadastrar o quiz, mas não pode ser publicada.

As perguntas do participante não incluem a marcação correta. Após confirmar uma resposta, a API retorna a correção e a explicação daquela pergunta, junto à próxima pergunta sem o gabarito. A consulta administrativa exige permissão sobre o treinamento.

## Me guie

A extensão recebe um destino de retorno limitado à mesma origem autorizada do portal e ao caminho `/trainings/:id`. Ao clicar Concluir no último passo, retorna ao portal. O portal registra a conclusão autenticada e libera o quiz. Cancelar a orientação não conclui o treinamento. Falhar ao abrir o retorno preserva a sessão para repetir.

Recarregar a extensão após atualizar os arquivos. A conclusão também pode ser feita pelos passos do próprio portal, sem extensão. Como o Me guie permite pular etapas, a conclusão registra o acompanhamento declarado, e o quiz verifica compreensão.

## Como rodar

Na pasta do projeto, com as dependências já instaladas:

```powershell
cd C:\Users\victo\.gemini\antigravity\scratch\autoguide\backend
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py seed_trainings
.\venv\Scripts\python.exe manage.py runserver
```

Em outro terminal:

```powershell
cd C:\Users\victo\.gemini\antigravity\scratch\autoguide\frontend
npm start
```

Abra `http://localhost:4200/login`. O seed funciona apenas em desenvolvimento (`DEBUG=True`), cria dados separados com prefixo `[DEMO]` e é repetível. Não redefine senhas nem resultados existentes.

Contas de demonstração:

- Gestor: `octor_demo_admin`.
- Participantes: `octor_demo_ana`, `octor_demo_bruno`, `octor_demo_carla`, `octor_demo_davi`.
- Senha inicial dessas contas novas: `OctorDemo!2026Training`.

É possível escolher outra senha inicial com `manage.py seed_trainings --password "SUA_SENHA_DE_TESTE"`. O seed não altera contas que já existam. A demonstração possui participantes pendentes, conteúdo concluído sem quiz, quizzes e comentários enviados. Não contém capturas reais de sistemas; as URLs de guia usam example.com.

A geração de sugestões usa o provedor já configurado no backend. Em caso de credencial ausente ou erro de IA, é possível cadastrar perguntas manualmente e o rascunho é preservado. Nenhuma chave é exposta ao frontend.

## Roteiro de teste manual

1. Entre como gestor e abra Administrar / Dashboard.
2. Abra um treinamento e consulte um participante com resultado para ver respostas e comentário.
3. Crie um treinamento a partir de um guia seu; revise as cinco perguntas, selecione as corretas e publique.
4. Atribua uma conta por e-mail. Para os participantes demo, os e-mails são `NOME_DE_USUARIO@training.example`.
5. Entre como participante, inicie e conclua o conteúdo, responda ao quiz e confira o resultado.
6. Recarregue durante o quiz e use Continuar quiz. A próxima pergunta e as respostas anteriores devem ser preservadas.
7. Avalie com estrelas, com ou sem comentário. Recarregar deve mostrar a confirmação, sem criar outra avaliação.
8. Volte ao gestor e confira dados, filtros e ranking.
9. Publique uma nova versão e verifique que participantes já iniciados mantêm a anterior.

## Testes automatizados

```powershell
cd C:\Users\victo\.gemini\antigravity\scratch\autoguide\backend
.\venv\Scripts\python.exe manage.py test --noinput
```

```powershell
cd C:\Users\victo\.gemini\antigravity\scratch\autoguide
node --test extension/tests/*.test.cjs frontend/tests/*.test.cjs
cd frontend
npx ng build --configuration development
```

Os testes do módulo cobrem permissões, isolamento, quiz antes da conclusão, gabarito oculto, retomada, ordem, idempotência, imutabilidade, pontuação, limites, avaliações, versões, rankings, filtros, atribuição atômica, remoção de membros, IA inválida e seed repetível. Testes da extensão verificam retorno autorizado, rejeição de destinos externos e preservação da sessão na falha.
