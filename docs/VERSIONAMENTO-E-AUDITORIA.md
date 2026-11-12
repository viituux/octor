# Versionamento de treinamentos e rastreabilidade

## Duas numerações independentes

**Treinamento:** cada publicação cria uma versão imutável. A sequência inicial é `0.1.0.0`, `0.1.1.0`, `0.1.2.0` e assim por diante. Os quatro componentes são uma convenção do OCTOR, não uma afirmação de compatibilidade com SemVer. Salvar o rascunho não gera versão publicada. A data e hora vêm do servidor; datas de exemplo não são usadas para retroagir publicações.

**Sistema:** `back/config/release.json` identifica a release do produto, atualmente `0.0.1.1`. `0.0.1.0` é a referência de numeração anterior adotada nesta entrega; não foi reconstruído um histórico de releases que antes não era registrado. O número da extensão e a versão técnica do pacote Angular são independentes.

Atualizar o OCTOR não altera automaticamente a versão dos treinamentos. O aviso de release e o botão de novidades aparecem no topo da aplicação. O aviso é dispensável e a identificação do produto permanece visível. A web verifica o endpoint de versão ao abrir e a cada cinco minutos; falhas nessa consulta não bloqueiam a navegação.

## Publicação e preservação

1. O responsável altera o rascunho e as perguntas, informa um resumo da mudança e confirma a revisão.
2. **Publicar** cria outro registro com número, rótulo, data/hora, responsável e release do OCTOR.
3. Conteúdo, instruções, metadados de captura e quiz ficam congelados.
4. Imagens e áudios locais são copiados para `back/private_trainings/`. Trocar ou apagar a mídia original do guia não apaga essas cópias.
5. Um hash SHA-256 representa conteúdo, questões, metadados da publicação e manifesto dos arquivos.
6. Triggers PostgreSQL impedem alterar/excluir uma versão selada, suas questões, alternativas ou referências a arquivos pelas operações normais de escrita.

Se um arquivo obrigatório do guia não puder ser copiado, a nova publicação é rejeitada e a versão anterior continua disponível. A API de arquivos exige autenticação e verifica acesso administrativo ou a versão autorizada do participante. A web carrega os arquivos privados como URLs temporárias de blob e as libera ao sair.

As cópias não são armazenamento WORM nem assinatura digital. Um operador com privilégios de administração do banco/sistema operacional pode desabilitar controles ou alterar arquivos. O diagnóstico de auditoria verifica os hashes dos arquivos disponíveis, mas backups externos e proteção das credenciais administrativas continuam necessários.

## Participação vinculada à versão

Ao iniciar, a participação fixa sua versão. Publicações seguintes não trocam o título, descrição, passos, perguntas ou arquivos que essa pessoa cursou. Pessoas que ainda não iniciaram recebem a versão atual ao iniciar.

São mantidos:

- Identificador da conta e nome, usuário e e-mail registrados no início.
- Data de atribuição, início e fim do conteúdo.
- Início/fim de cada tentativa do quiz, respostas, acertos, pontuação e duração.
- Estrelas, comentário, data da avaliação e conclusão definitiva.
- Identificação da versão, data da publicação e hash do snapshot.

Alterar o perfil posteriormente não reescreve a identificação já registrada. Contas com participações/resultados ficam protegidas contra exclusão física via ORM; a desativação continua possível. Remover um membro da equipe não remove seu registro administrativo de treinamento, embora possa encerrar seu acesso e tirá-lo do ranking ativo.

Esta entrega não implementa uma nova matrícula obrigatória para a mesma pessoa em cada atualização. A participação original permanece única por usuário e treinamento. Para uma reciclagem separada, crie outro treinamento; a versão nova não deve sobrescrever a conclusão antiga.

## Consulta administrativa

Na edição do treinamento, **Histórico de versões publicadas** mostra todas as publicações. **Consultar versão** abre o conteúdo e o quiz daquele snapshot, somente para leitura, incluindo publicação, arquivamento e diagnóstico de consistência.

Ao abrir um participante, o responsável vê identificação registrada, versão cursada, horários e tentativas. **Exportar registro de auditoria (JSON)** reúne os dados de execução, avaliação, snapshot, manifesto de arquivos e eventos. Os arquivos de mídia continuam no armazenamento privado; o JSON contém referências e hashes, não incorpora todos os bytes e não constitui um pacote offline completo.

Horários são armazenados em UTC e transmitidos em ISO 8601 com fuso. A interface usa o horário local do navegador e o identifica como tal; o JSON preserva a referência de fuso para comparação entre ambientes.

## Eventos de rastreabilidade

Publicação, atribuição, início, fim do conteúdo, início de tentativa, confirmação de resposta, fim do quiz, liberação de tentativa e conclusão geram eventos quando a operação efetivamente acontece. Reenvios idempotentes não duplicam os eventos correspondentes.

Há uma cadeia por treinamento para publicações e outra por participação. Cada evento contém horário do servidor, ator, sequência, dados relevantes, hash anterior e seu próprio hash. O PostgreSQL rejeita atualização/exclusão dessas linhas. O responsável pode verificar a consistência da cadeia na inspeção.

Essa verificação local não comprova, isoladamente, quem estava fisicamente usando a conta, quanto tempo a pessoa prestou atenção ou a aceitação de um documento por terceiros. O relógio do servidor, a autenticação da conta e os controles administrativos precisam ser confiáveis. Não há assinatura digital, carimbo de tempo externo ou garantia jurídica implementados.

## Registros anteriores à atualização

As migrations preservam os números e as datas existentes e acrescentam rótulos à sequência já publicada. Responsável e release não registrados anteriormente permanecem desconhecidos, sem atribuição inventada.

Para participações antigas já iniciadas, a identificação recuperada do perfil atual recebe a origem `legacy_current_profile`. Isso é diferente da identificação capturada no início pelo fluxo novo. A importação não permite afirmar quais eram os dados cadastrais originais.

O comando `freeze_training_archives` copia os arquivos locais ainda disponíveis nos snapshots não selados. Registra o horário atual do arquivamento e eventos explícitos de importação, sem simular novos inícios/conclusões no passado. Arquivos ausentes ficam sinalizados. Não é possível recuperar automaticamente mídia apagada antes dessa preservação nem comprovar sua integridade retroativamente.

## API

| Método e rota | Uso |
| --- | --- |
| GET `/api/system/version/` | Versão pública do produto e novidades, sem dados de usuários |
| POST `/api/trainings/admin/{id}/publish/` | Aceita `quiz_reviewed: true` e `release_notes` opcional, limitado a 1.000 caracteres |
| GET `/api/trainings/admin/{id}/` | Inclui `version_history`; rascunho permanece separado |
| GET `/api/trainings/admin/{id}/versions/{number}/` | Snapshot e gabarito para o responsável autorizado |
| GET `/api/trainings/{id}/versions/{number}/assets/{uuid}/` | Arquivo privado da versão autorizada |
| GET `/api/trainings/admin/{id}/participants/{user_id}/` | Inclui `audit`, identidade, eventos, snapshot e manifesto |
| GET `/api/trainings/{id}/` | Título, conteúdo e versão fixados na participação iniciada |

O número inteiro de versão continua na API para compatibilidade; o campo `label` é o rótulo de quatro componentes. `snapshot_schema=1` identifica o formato persistido do conteúdo, separadamente da release do sistema.

## Instalar e testar

Na raiz do projeto:

```powershell
back/venv/Scripts/python.exe back/manage.py migrate
back/venv/Scripts/python.exe back/manage.py freeze_training_archives
back/venv/Scripts/python.exe back/manage.py test trainings --noinput
node --test front/tests/*.test.cjs
```

Em `front/`: `npm run build` ou reinicie o servidor Angular. Reinicie o Django após atualizar. Nenhuma alteração na extensão é necessária para esta funcionalidade.

As migrations `0003_participation_identity_snapshot_and_more` e `0004_audit_guards` acrescentam metadados, armazenamento privado e eventos, preservam o legado e instalam os controles PostgreSQL. O comando de arquivamento é idempotente e informa quantos registros foram preservados e quantos arquivos faltam.

## Regras para futuras atualizações do OCTOR

- Não reescrever snapshots publicados para refletir o guia atual.
- Preservar suporte ao schema dos snapshots existentes; novos formatos exigem leitores compatíveis e testes com versões anteriores.
- Não remover registros de quiz, participações ou diretórios de arquivos em scripts de release.
- Manter `private_trainings/` fora da área de mídia pública e em armazenamento persistente.
- Incluir PostgreSQL, `private_trainings/`, `private_manuals/` e `media/` em backups com acesso controlado e testar a restauração conjunta.
- Atualizar `release.json` e as notas do produto somente ao preparar uma nova release efetiva.

As permissões do diretório, backups, sincronização do relógio, política de retenção e publicação em infraestrutura persistente precisam ser configurados no ambiente de produção. O aviso de versão não instala atualizações automaticamente.
