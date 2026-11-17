# Manual por URL — auditoria e implementação de confiabilidade

Base analisada: `viituux/octor`, commit `b2f17daf74aff01f1be92935fcac75811787d1ea`.

## Arquitetura verificada

`manual-bridge.js` recebe as mensagens da interface autorizada. `background.js` instala `installManualCapture` com a fila e a sessão HTTP já existentes. `manual-background.js` abre e supervisiona uma aba, injeta as funções de `manual-observer.js`, consulta `/manuals/<run>/plan/`, salva `/captures/` e solicita a geração. `services.py` contém tanto a decisão de navegação via SDK Gemini quanto a geração final por REST. A geração final lê as capturas privadas já persistidas; `generation.py` reserva a execução na fila PostgreSQL.

A extensão possui também gravador humano e reprodução (`content.js`, `background.js`, `playback*.js`, `live-recorder.js`, `targets.js`, popup, diálogos, tema e configuração de ambiente). Esses caminhos não foram substituídos. A atuação automática continua limitada aos controles que o navegador já permitia: links internos autorizados, menus e campos de busca. Não foi adicionada execução arbitrária de formulários ou transações.

A leitura integral de `services.py` confirmou validação de bytes/dimensões, normalização JPEG, limites de tokens, validação de referências do documento e retries limitados do provedor. A fila de geração já possui reserva persistente e descarte de resposta após cancelamento. Esses mecanismos foram preservados.

## Diagnóstico por prioridade e causa

| Prioridade | Problema encontrado | Causa e correção |
| --- | --- | --- |
| P0 | Gemini podia receber uma observação transitória, ainda não salva | Espera fixa de 550 ms; comparação de URL/viewport e rótulos não comprovava estabilidade. Agora a imagem passa por DOM, geometria e comparação de pixels, é salva privadamente e relida do armazenamento antes do Gemini. |
| P0 | Solicitações simultâneas podiam chamar o Gemini mais de uma vez | A transação original verificava o estado somente depois da chamada. Agora a reserva persistente é feita antes da chamada, sob bloqueio da execução; a rede fica fora da transação. |
| P0 | Resultado desconhecido de clique podia ser repetido na retomada | O histórico de visitados era atualizado somente ao terminar. Agora a intenção é salva localmente e reservada no backend antes do comando; uma retomada observa novamente e não reenvia a etapa antiga. |
| P1 | Animações podiam ficar congeladas em estado intermediário | O CSS injetado pausava animações e removia transições. Agora ele só controla rolagem e cursor; o motor espera as animações finitas terminarem naturalmente. |
| P1 | Digitação revertida por componente controlado era considerada sucesso | O valor era conferido imediatamente após `input`. Agora ele é conferido depois da estabilização e novamente antes da captura de resultado. |
| P1 | Uma alteração não relacionada podia confirmar um clique | A verificação usava qualquer mudança de assinatura. Agora menus exigem evidência específica: expansão, abertura de `details` ou alteração de um menu/diálogo observado. |
| P1 | Imagem idêntica em outra página podia perder a associação correta | A deduplicação de bytes não exigia a mesma URL/viewport. Agora exige o mesmo contexto e os mesmos bytes normalizados; texto igual sozinho não elimina uma imagem com mudança visual. Reutilizar uma chave/etapa com conteúdo ou ordem diferente resulta em 409. |
| P1 | Não havia confirmação persistente da imagem posterior à ação | Foi acrescentado `action-result`: a ação só termina após verificar, capturar e salvar seu resultado. A análise seguinte fica bloqueada enquanto houver uma ação sem confirmação. |
| P2 | Atualizações locais de estado podiam sobrescrever umas às outras | Operações assíncronas faziam leitura/modificação/escrita sem fila própria. Agora as gravações do estado são serializadas e mantêm até 200 eventos de diagnóstico por coleta. |

Os sleeps de backoff do Gemini e do worker de fila permanecem: não são esperas de interface. A extensão conserva polling limitado do estado de carregamento da aba e espaçamento entre capturas para respeitar o limite de duas chamadas por segundo do Chrome. A prontidão da interface depende das verificações, não desses intervalos.

## Implementação

### Intelligent Wait Engine

`manual-wait.js` exporta uma função autocontida, adequada para `chrome.scripting.executeScript`. Ela combina:

- `requestAnimationFrame`, geometria/texto/estado dos elementos visíveis e quatro frames estáveis;
- janela de 450 ms sem alterações relevantes e `MutationObserver` limitado ao conteúdo visível, ignorando os overlays internos do Octor;
- `document.readyState`, imagens pendentes e `aria-busy`;
- animações/transições finitas via `document.getAnimations()`;
- identificação do documento por `performance.timeOrigin`, URL e viewport;
- sinais de recursos concluídos como diagnóstico complementar, sem exigir network-idle.

Timeout padrão: 15 segundos por espera. `timeoutMs`, `quietMs` e `frames` são configuráveis na função. O coordenador usa `session.waitTimeoutMs` quando configurado no estado local da coleta. Não há dependências de produção novas.

O comparador de imagens decodifica o screenshot, rejeita imagens corrompidas, pequenas ou uniformes e compara duas capturas em uma grade de 96×96 pixels. A maior diferença média entre blocos de 8×8 detecta alterações locais; o limiar atual é 0,025. A verificação complementa o DOM. A captura é rejeitada se o documento ou a assinatura mudar durante a operação.

### Ações, estados e persistência

Uma etapa com ação segue, em termos de fases:

`PENDING → WAITING → ANALYZING → ACTION_READY → WAITING → CAPTURING → VALIDATING → SAVING → SAVED → EXECUTING → WAITING → VALIDATING → CAPTURING → VALIDATING → SAVING → COMPLETED`.

`SAVED` confirma a imagem de origem, ainda sem concluir a ação. Uma etapa sem ação termina depois de salvar sua captura. Falhas registram `FAILED` e a fase em que ocorreram. A tabela de transições impede completar uma etapa sem confirmação de armazenamento; entrar em `EXECUTING` invalida essa confirmação até que o resultado seja salvo.

A imagem enviada ao Gemini fica em `ManualObservation.screenshot`, com UUIDs de execução/etapa, hash da solicitação e decisão. As imagens destacadas do manual continuam em `ManualCapture`, preservando a apresentação existente. O vínculo `ManualObservation.capture` liga a observação à captura aceita, inclusive quando o backend deduplica uma imagem. A imagem posterior à ação fica em `result_screenshot`. `status` acompanha a análise; `action_status` acompanha o comando e seu resultado.

Antes do comando, `/action-intent/` exige a observação concluída e a imagem de origem salva. Repetir essa reserva resulta em 409. Depois da ação, `/action-result/` exige verificação e estabilidade, valida os bytes e salva o resultado antes de confirmar conclusão. Não há retry automático do clique. Capturas podem ser tentadas novamente: até quatro observações antes da análise, três capturas de origem e três capturas de resultado. Erros de comunicação interrompem a coleta; não são convertidos silenciosamente em uma decisão da IA.

Na retomada explícita, a interface é observada novamente, o rótulo da ação incerta entra no histórico de visitados e a reserva anterior fica `INTERRUPTED`. Uma resposta tardia não pode confirmar essa reserva. Uma análise expirada também não é reexecutada com o mesmo identificador.

O último espaço de captura pode confirmar uma conclusão, mas não dispara outra ação sem espaço para documentar a tela seguinte.

### Logs

Eventos incluem UUIDs, timestamp ISO, estado, fase da falha, ação por tipo, tempo de espera, frames, tentativa, ID da captura e confirmação de armazenamento. O worker escreve no console e mantém os últimos 200 eventos em `manualCapture.stepLog`. O backend registra reserva/análise e checkpoints de ação. Rótulos, valores de campos, seletores, URLs completas, screenshots e respostas brutas do Gemini não são incluídos nos novos logs.

## Arquivos alterados

- `back/manuals/services.py`: rejeição adicional de imagem uniforme e tratamento de entrada inválida.
- `back/manuals/models.py`: observações privadas, correlação, reserva e resultado de ação.
- `back/manuals/migrations/0003_manualobservation.py`: criação da tabela.
- `back/manuals/serializers.py`: UUIDs opcionais nas capturas.
- `back/manuals/views.py`: uso da reserva, checkpoints, associação/deduplicação e exclusão dos arquivos privados adicionais.
- `back/manuals/reliability.py`: coordenação persistente da análise e da execução.
- `extensao/manual-background.js`: espera, validação, transições, intenção persistente e retomada sem replay.
- `extensao/manual-observer.js`: preservação de animações e verificação de busca/menu.
- `extensao/manual-wait.js`: motor de prontidão e verificação de imagem.
- `extensao/manual-step.js`: transições e diagnóstico sem conteúdo sensível.
- `back/manuals/reliability_tests.py` e `tests/manual-browser.cjs`: testes reproduzíveis.
- Este documento.

## Testes e resultados

Os testes de navegador usam Chromium headless e Playwright como ferramenta de desenvolvimento. Os testes Django usam PostgreSQL real; somente as respostas do Gemini são simuladas. O teste de concorrência usa conexões separadas e confirma que só uma solicitação chega ao provedor.

Comandos:

```sh
# Na raiz, com as dependências do backend e PostgreSQL de teste disponíveis:
python back/manage.py test manuals.reliability_tests --noinput -v 1

# Playwright é ferramenta de teste, não dependência da extensão:
# Instale-o no ambiente de desenvolvimento se necessário.
node --test tests/manual-browser.cjs
# CHROMIUM_PATH permite selecionar outro binário; padrão /usr/bin/chromium.

python back/manage.py makemigrations --check --dry-run
python back/manage.py check
git diff --check
```

Cobertura: página rápida, carregamento lento, elemento tardio/JavaScript, modal animado, menu suspenso, formulário controlado, navegação, requisições contínuas, timeout de alterações relevantes, elemento coberto/desabilitado, imagem inválida/vazia, diferença visual local, transição inválida, falha temporária de captura, resposta tardia com tela alterada, início duplicado e resposta perdida após clique com retomada sem repetição.

No backend: imagem salva antes do Gemini, replay de decisão, colisão de identificador, isolamento por dono, contratos legados, concorrência, cancelamento, reserva expirada, associação de captura, deduplicação por contexto, conflito de ordem, falha de armazenamento, intenção de ação única e conclusão condicionada ao salvamento do resultado.

Resultado: **15 testes de navegador e 17 testes com PostgreSQL aprovados**. Verificações de migração, configuração Django, sintaxe JavaScript e `git diff --check` também aprovadas. Não foi feita chamada real ao Gemini nem execução no site de produção.

## Migração e teste manual

1. Publique primeiro o backend e execute `python manage.py migrate`. A nova tabela é aditiva; não reescreve manuais existentes.
2. Recarregue a extensão em `chrome://extensions` e recarregue a interface do Octor. O backend continua aceitando os payloads anteriores sem UUIDs; as garantias novas de execução exigem a extensão atualizada. A extensão atualizada exige o novo backend e falha de forma explícita se faltarem os identificadores na resposta.
3. Com o backend, frontend e worker `process_manual_queue` ativos, crie um Manual por URL para uma página de teste autorizada, com objetivo específico para abrir um menu ou preencher uma busca.
4. Mantenha a aba e a janela em primeiro plano. Confira que a imagem de origem é salva antes do clique e que a próxima análise só ocorre depois da confirmação da imagem de resultado.
5. Use uma página com modal/transição e depois uma página com carregamento tardio e `aria-busy`. Confira os tempos registrados e a ausência de capturas intermediárias aceitas.
6. Reverta o valor de uma busca em um handler assíncrono: a coleta deve pedir atenção, sem repetir a digitação. Para testar captura, provoque uma falha temporária no mock da suíte; a nova tentativa deve repetir a imagem, sem repetir o comando.
7. Interrompa a comunicação após o clique ou reinicie o worker. Ao usar Continuar coleta, confira que o estado atual é observado e o clique anterior não é repetido. Esse cenário também está automatizado.
8. Simule resposta atrasada da IA e altere a página enquanto ela processa: a decisão deve ser descartada, sem clique. Clique em Iniciar duas vezes: a segunda tentativa deve ser rejeitada.
9. Confira os prints, a ordem e a geração/revisão final. Inspecione `manualCapture.stepLog` no DevTools do service worker e os logs do backend, filtrando pelos UUIDs.

## Limites conhecidos

Estabilidade é uma verificação observacional, não uma garantia sobre requisições futuras que o site não sinaliza. Não há permissão nova de `webRequest` nem interceptação do JavaScript do site: requisições em andamento sem loader/DOM/`aria-busy` observável podem não ser conhecidas. A atividade contínua de rede, por si só, não bloqueia a coleta.

Conteúdo dentro de iframe de outra origem, shadow DOM fechado, canvas e vídeo não oferece a mesma evidência semântica. Conteúdo continuamente animado pode levar a timeout ou rejeição visual; a coleta pede atenção. Animações infinitas não são aguardadas pelo término, mas continuam sujeitas às verificações de geometria e pixels.

A seleção automática continua restrita ao mecanismo existente. Não foram acrescentados preenchimento genérico, seleção de contas, pagamento ou envio de formulários. A restrição existente de diálogos grandes e o limite de seis capturas foram preservados.

Os testes do coordenador simulam as APIs `chrome.*` e usam imagens reais renderizadas pelo Chromium. Eles não substituem a homologação da extensão instalada, autenticação, UI Angular e Gemini real em conjunto. As heurísticas visuais devem ser ajustadas com páginas representativas do produto, sem relaxar o bloqueio por armazenamento ou os identificadores. Observações e resultados adicionais consomem armazenamento privado e são excluídos ao excluir a execução.
