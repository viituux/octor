# Quiz obrigatório de avaliação do treinamento

## Fluxo entregue

Novas publicações exigem cinco perguntas revisadas pelo responsável. Cada pergunta possui quatro alternativas diferentes, uma correta e explicação opcional. O usuário percorre **procedimento → quiz → avaliação → conclusão**. Não existe nota mínima eliminatória nesta versão.

O administrador pode salvar perguntas incompletas no rascunho, mas não publicar. Antes de publicar, precisa marcar a confirmação da revisão. As perguntas são cadastradas manualmente nesta entrega; não há geração automática de sugestões por IA.

## Regras de participação

- O servidor registra início do conteúdo e fim do conteúdo separadamente da conclusão definitiva.
- O quiz só é liberado após o fim do conteúdo e apresenta uma pergunta por vez.
- Cada acerto vale 20 pontos; o total varia entre 0 e 100. Não há bônus por rapidez.
- A primeira chamada de início registra o relógio no servidor. Reabrir ou recarregar retoma a mesma tentativa; o tempo continua contando fora da página.
- Cada resposta confirmada é persistida e não pode ser alterada. Reenvio idêntico é idempotente.
- As alternativas corretas e explicações não são enviadas durante a tentativa. Ao confirmar a quinta resposta, o servidor finaliza, calcula nota/duração e libera a revisão.
- A conclusão definitiva acontece após o envio das estrelas obrigatórias. O comentário é opcional e tem limite de 500 caracteres. Avaliações duplicadas são bloqueadas; repetição idêntica não cria outro registro.

O tempo do conteúdo representa tempo decorrido, não comprovação de atenção. O mecanismo não é um sistema de fiscalização de provas.

## Ranking

O ranking compara o mesmo treinamento e a mesma versão. Ordena por mais pontos e depois por menor duração do quiz, medida em milissegundos pelo servidor. Empates exatos compartilham posição (por exemplo, 1, 2, 2, 4). Datas, versões e tentativas anteriores permanecem no histórico.

Todos que finalizaram o quiz entram na classificação, mesmo enquanto a avaliação por estrelas estiver pendente. Pessoas sem quiz finalizado não recebem nota zero. Participantes veem a classificação da versão cursada; responsáveis podem escolher versões na gestão e consultar listas separadas no dashboard. O ranking não expõe e-mails ou respostas de outros participantes.

Por padrão há uma tentativa. O responsável pode liberar outra, até cinco no total, depois da tentativa finalizada e antes da conclusão/avaliação definitiva. A liberação repetida não acumula permissões. Ao iniciar a nova tentativa, a anterior deixa de valer para o ranking; volta à classificação ao terminar. O histórico não é apagado. Depois da conclusão, use outro treinamento para uma nova avaliação.

## Compatibilidade e migração

`trainings.0002_required_quiz` adiciona:

- `QuizVersion.requires_quiz`, inicialmente falso nas versões existentes.
- `Participation.content_completed_at` e `quiz_attempt_limit`.
- `QuizResult.duration_ms`.

A migração copia o fim dos treinamentos antigos para o fim do conteúdo, preservando os registros. Quem já iniciou permanece vinculado à versão original. Treinamentos antigos não passam a exigir quiz retroativamente; o responsável precisa cadastrar as perguntas e publicar uma nova versão para novos inícios. Nenhuma pergunta ou resposta histórica é excluída.

## Endpoints

Todos exigem JWT; o backend valida participação ou responsabilidade administrativa.

| Endpoint | Contrato |
| --- | --- |
| POST/PATCH `/api/trainings/admin/…` | Aceita `draft_questions`: cinco objetos com `statement`, `explanation` e `alternatives[{text, correct}]` |
| POST `/api/trainings/admin/{id}/publish/` | Exige `quiz_reviewed: true`, cinco perguntas completas e guia válido |
| POST `/api/trainings/{id}/start/` | Registra início e fixa a versão |
| POST `/api/trainings/{id}/complete/` | Registra apenas fim do conteúdo nas versões com quiz |
| POST `/api/trainings/{id}/quiz-start/` | Inicia ou retoma tentativa autorizada |
| POST `/api/trainings/{id}/quiz-state/` | Retorna tentativa e próxima pergunta sem revelar gabarito pendente |
| POST `/api/trainings/{id}/answer/` | Recebe `result_id`, `question_id`, `alternative_id`; quinta resposta finaliza |
| POST `/api/trainings/{id}/feedback/` | Recebe `stars`, `comment`; exige quiz finalizado e registra conclusão |
| GET `/api/trainings/{id}/` | Conteúdo, progresso próprio e ranking da versão cursada |
| GET `/api/trainings/admin/{id}/` | Participantes, média do quiz e ranking; aceita `version` e `min_score` além dos filtros existentes |
| GET `/api/trainings/admin/{id}/participants/{user_id}/` | Datas, avaliação e tentativas com respostas finalizadas |
| POST `/api/trainings/admin/{id}/allow-retry/` | Recebe `user_id`; libera individualmente outra tentativa |
| GET `/api/trainings/admin/dashboard/` | Inclui `quiz_rankings`, separados por treinamento/versão |

Horários, nota e acerto enviados pelo navegador não são usados para decidir resultados. Bloqueio transacional da participação e unicidade de respostas impedem duplicação em abas simultâneas. O endpoint de sugestões antigo continua desativado (410).

## Como usar e verificar

Na raiz do projeto:

```powershell
back/venv/Scripts/python.exe back/manage.py migrate
back/venv/Scripts/python.exe back/manage.py test trainings --noinput
node --test front/tests/training-feedback.test.cjs
```

Em `front/`, execute `npm run build` ou reinicie `npm start`. Reinicie o backend após a atualização. Não é necessário alterar a extensão para o quiz: o retorno do Me guie agora libera o quiz antes da avaliação nas versões novas.

Para demonstração em banco de desenvolvimento, use `seed_trainings --password "SENHA-LOCAL-FORTE"` com DEBUG ativo. O seed atualizado cria perguntas e resultados apenas para novos treinamentos de demonstração e não reescreve registros existentes. Não execute o seed para modificar treinamentos reais.

Testes cobrem publicação revisada, perguntas inválidas, persistência, retomada, gabarito oculto, respostas fora de ordem, alternativas estrangeiras, adulteração de dados, relógio do servidor, acertos, empates, versões, autorização, preservação do legado e concorrência real no PostgreSQL. Testes de componente verificam transições e preservação do formulário em falhas. A QA em navegador usa API real e banco temporário, sem gravar dados de teste na base local do usuário.
