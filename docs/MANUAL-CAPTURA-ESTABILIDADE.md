# Manual por URL — diagnóstico e correção da captura

Atualizado em 17/11/2026.

## Problemas por prioridade

1. Alta — Esperas de 800, 1200 e 1400 ms eram usadas como autorização implícita para avançar. Um componente podia continuar carregando após esse prazo.
2. Alta — A preparação de captura pausava todas as animações e removia transições. Isso podia congelar o componente num estado intermediário.
3. Alta — O alvo era encontrado novamente apenas pelo rótulo depois da resposta da IA. Um nó substituído com o mesmo texto podia receber a ação destinada ao nó anterior.
4. Alta — Menus summary não participavam da assinatura visual. O menu abria, mas a mudança podia ser interpretada como ausência de resultado.
5. Alta — Falha do planejador ainda podia salvar uma imagem sem alvo antes de interromper.
6. Média — Animações do GitHub associadas à rolagem permanecem running mesmo com a tela parada. A espera deve distinguir esse caso das transições finitas no tempo.
7. Média — Os índices dos controles estavam implícitos no contexto da IA. O contexto agora contém alvo_id explícito, correspondente ao índice original. IDs internos do DOM permanecem somente na extensão.

## Caminho auditado

| Etapa | Comportamento anterior e risco | Correção |
| --- | --- | --- |
| Abrir aba | status complete e pausa fixa não garantiam hidratação | Esperar documento, fontes, imagens visíveis, aria-busy, skeletons, layout, DOM e recursos observáveis |
| Observar | Rótulos e print podiam pertencer a momentos diferentes | Espera antes de observar, dois frames de pintura e comparação posterior dos controles/viewport |
| Consultar Gemini | DOM podia ser substituído durante a requisição | Identidade do nó com WeakMap e identificador do documento; alvo_id explícito no contexto |
| Preparar print | Estabilidade por amostras curtas e animação congelada | Janela contínua de estabilidade e término das animações finitas |
| Desenhar contorno | Destaque podia refletir nó substituído | Revalidar identidade, visibilidade, disponibilidade e hit-test no alvo |
| Capturar | Compositor podia ainda não ter desenhado a borda | Dois frames antes da captura; comparação posterior da assinatura e viewport |
| Salvar | Erro da IA podia produzir passo de referência indevido | Erro da decisão interrompe antes do registro; chave/ordem e deduplicação existentes preservadas |
| Executar | Pausa entre print e clique permitia trocar o alvo | Espera e comparação da cena com o print; revalidação de identidade imediatamente antes da ação |
| Próxima tela | Pausa fixa não garantia componente pronto | Espera após ação e novamente antes da próxima consulta |
| Perder foco | Frames podem ficar suspensos em aba oculta | Falha explícita em aba oculta ou compositor sem resposta; estado exige retomada |

A captura do passo continua ocorrendo ANTES da ação, com o contorno no alvo que será acionado. Depois da ação, a nova tela precisa estabilizar antes da próxima observação. O limite existente é de seis capturas por coleta.

## Esperas e alcance

manual-ready.js exige 700 ms contínuos de estabilidade, consulta as condições a cada 60 ms e interrompe após 15 s sem ficar pronto. Os 60 ms são intervalo de verificação; o decurso do prazo não autoriza o print. Imagens pendentes, fontes em carregamento, aria-busy, skeletons e transições finitas bloqueiam a captura. Animações decorativas infinitas e timelines de rolagem não exigem término.

Performance Resource Timing informa recursos concluídos. Não representa uma garantia de zero requisições pendentes em aplicações que não sinalizam carregamento no DOM. Iframes de outra origem e shadow roots fechados continuam fora da inspeção interna existente. A extensão não ganhou permissão para monitorar tráfego.

Os intervalos de consulta de status da aba e o intervalo entre dois prints de depuração permanecem como polling e controle da cota da API de screenshots. Não substituem a condição de prontidão.

## Logs e arquivos

No service worker, procure [OCTOR manual]. Os eventos initial, before-planner, decision, before-screenshot, save, before-action, execute e after-action contêm horário, ordem, ação/alvo, seletor quando disponível, tempo de espera e estado observado.

No painel da extensão, marque Salvar depuração da captura localmente e conceda a permissão opcional de downloads já existente. Cada passo gera raw.jpg, outlined.jpg e observation.json em Downloads/OCTOR-debug. O JSON inclui controles, URL, título, DPR, viewport, scroll, zoom, horário, prontidão e motivo da captura. Desmarque depois da validação.

## Verificações realizadas

- 73 testes unitários da extensão aprovados.
- 34 testes do backend Manual por URL aprovados.
- Dois testes Chromium aprovados para menus/contorno/alvo substituído e retomada com recusa de outro domínio.
- Extensão carregada em Chromium, cinco ações sequenciais com respostas de planejamento simuladas, seis prints salvos. O servidor atrasou cada componente e aplicou transições. Nenhum print contém a mensagem de carregamento e o sexto contém a conclusão.
- Gemini real em páginas públicas do GitHub, tarefa consultar issues de microsoft/vscode. Escolheu o link Issues, foi gerado o print com contorno e a próxima tela levou à conclusão correta.
- O teste real do GitHub usa as funções da extensão injetadas no Chromium e o serviço Gemini local. Não equivale a uma sessão autenticada completa do OCTOR criando um repositório.

Evidências locais fora do Git:
C:/Users/victo/Documents/Codex/manual-capture-final
C:/Users/victo/Documents/Codex/manual-github-validation

## Repetir

No PowerShell, no projeto:

    node --test (Get-ChildItem extensao/tests -Filter '*.test.cjs').FullName
    back/venv/Scripts/python.exe back/manage.py test manuals.tests --noinput

Para os testes de navegador, disponibilize Playwright e Chromium. O script aceita PLAYWRIGHT_MODULE, OCTOR_TEST_CHROMIUM e OCTOR_CAPTURE_ARTIFACTS:

    node extensao/tests/manual-smart.browser.cjs

No Chrome, carregue a extensão atualizada, conecte a conta e execute uma coleta de cinco ações. Confira cada imagem antes da ação, a borda no alvo, a próxima tela totalmente pronta e a ausência de prints repetidos ou intermediários. Para criar repositório no GitHub, entre com uma conta de teste e pare antes do envio final. Esse cenário autenticado ainda precisa de validação.

A revisão automática rejeitou a abordagem inicial que adicionava webRequest. A implementação entregue usa as permissões existentes.

## Publicação

Publicado na AWS após os testes descritos acima. Backend e worker ativos, Django check aprovado. Backup /srv/octor/backups/manual-ready-20261117T042329Z. O pacote público da extensão é a versão 1.2.1.

Baixe https://octor.app.br/assets/octor-extensao.zip, extraia e recarregue a extensão em chrome://extensions. Atualize a página do OCTOR. Publicar o ZIP não substitui automaticamente uma instalação carregada manualmente.

## Validação real no Chrome — versão 1.2.4

O teste autenticado no Chrome foi concluído com o pedido de criar um repositório no GitHub e parar no formulário. Execução 3ea32bc2-cad9-460f-bda7-d4d368b5137a, classificada como especifico e procedimento concluido.

Foram confirmadas três capturas com hashes de imagem distintos:
1. Página inicial de github.com com o alvo Criar novo.
2. Menu aberto com o contorno no item Novo repositório.
3. Formulário em github.com/new.

As imagens persistidas no backend foram baixadas e inspecionadas localmente em C:/Users/victo/Documents/Codex/manual-github-real-verified. O formulário permaneceu sem preenchimento.

Causas adicionais confirmadas durante o teste:
- Criar novo era visível na imagem, mas não aparecia entre os candidatos do executor porque o botão não tinha aria-haspopup ou usava aria-labelledby. Agora botões de navegação/cabeçalho fora de formulários são inspecionados, com resolução de aria-labelledby e manutenção dos filtros de ações perigosas.
- Conteúdo principal saturava o limite de controles/texto antes dos menus. Menus abertos e cabeçalhos são priorizados na leitura.
- A retomada comum com prints anteriores podia pular a única posição conhecida. Agora começa por observação nova e ordem posterior aos prints existentes.
- Rejeitar duplicata de imagem não pode pular o processamento de uma decisão pendente ou final.
- Durante a chamada ao Gemini, uma chamada Chrome limitada à execução ativa mantém o worker acordado. São exibidas mensagens específicas de espera, análise e execução.
- O contexto exige índice e rótulo coerentes. Quando um rótulo explicitamente pedido está visível e é único, uma escolha de outro controle recebe correção antes de executar.

Validações desta sequência: 73 testes da extensão, teste Chromium do botão de cabeçalho sem aria-haspopup e 35 testes backend aprovados. A versão 1.2.4 foi carregada no Chrome para o teste real. O sucesso descrito corresponde ao fluxo testado do GitHub.
## Máscara de privacidade sem barra sobreposta — 1.2.5

A faixa clara sobre o menu era gerada pela máscara opaca de todos os campos, inclusive o textarea vazio do Copilot. A captura agora oculta o texto de campos preenchidos dentro do próprio elemento, sem inserir um retângulo fixo acima dos menus. Blocos explicitamente data-private continuam ocultos, inclusive seus descendentes. As propriedades originais e prioridades CSS são restauradas na limpeza e antes de reaplicar a proteção; os valores dos campos não são alterados.

Validação: 73 testes existentes da extensão; regressão Chromium da privacidade (campo vazio, menu sobreposto, estilo inline important, bloco privado, restauração e captura repetida); teste Chromium de navegação e contorno; extensão carregada com cinco ações assíncronas e seis prints sem tela de carregamento. Evidências locais: C:/Users/victo/Documents/Codex/manual-privacy-fixed e manual-privacy-flow.

A correção vale para capturas novas. Screenshots já persistidos não são modificados. O pacote 1.2.5 precisa ser recarregado no Chrome para substituir a versão em execução.
