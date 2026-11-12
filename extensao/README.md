# Extensão — captura e Me guie do OCTOR

Referência consolidada em 06/11/2026: [documentação técnica](../docs/DOCUMENTACAO-TECNICA.md) e [Manual por URL](../docs/MANUAL-POR-URL.md). A extensão 1.2.0 inclui leitor de página e ponte para coleta; isso não constitui navegação autônoma. Carregue a pasta `extensao` e recarregue as páginas após atualizar.

Extensão **OCTOR — Gravador de Procedimentos** para navegador Chromium. Registra ações e capturas para criar um guia na API e apresenta instruções sobre o site no modo Me guie. O [frontend](../front/README.md) revisa o material; o [backend](../back/README.md) valida acesso e persiste os dados.

## Tecnologias e versões

- Manifest V3; extensão na versão `1.2.0`, conforme `manifest.json`.
- Chrome mínimo `116`, declarado no manifesto por causa das APIs utilizadas, incluindo painel lateral.
- JavaScript nativo, HTML e CSS; worker ES module com `background.type = module`.
- APIs Chrome: `tabs`, `storage`, `scripting`, `sidePanel`, `activeTab`; APIs web de DOM, mídia, arquivos e HTTP.
- A extensão usa JavaScript nativo e é carregada pelo Chrome a partir do manifesto.

As versões de Chrome realmente instalado e a compatibilidade de outros navegadores não estão fixadas no repositório; Chrome 116 é o mínimo declarado, não uma indicação para usar navegador antigo.

## Estrutura

```text
extensao/
├── manifest.json             # permissões, worker, scripts e origens externas
├── background.js             # sessão, fila de gravação, captura e upload
├── content.js                # eventos confiáveis e contexto dos alvos no site
├── targets.js                # seletor, rótulo, identidade e resolução do elemento
├── playback-background.js    # estado/aba/navegação do Me guie
├── playback.js               # painel e destaque no DOM do site
├── popup.html / .js / .css    # painel lateral de controle
├── live-recorder.html / .js  # contexto dedicado ao microfone
├── theme.css / theme.js      # gerados pelo script da raiz
```

## Instalar e configurar

1. Inicie API em `http://localhost:8000` e frontend em `http://localhost:4200`.
2. Abra `chrome://extensions`, ative Modo do desenvolvedor e escolha **Carregar sem compactação**.
3. Selecione `C:\Users\victo\.gemini\antigravity\scratch\PROJETO OCTOR\extensao` (ou a pasta equivalente do clone).
4. Fixe o ícone e abra o painel lateral. Entre na conta pelo fluxo apresentado ou conecte em Minha conta na aplicação web.
5. Para Me guie, confira o ID da extensão e o pareamento com a mesma conta.

Após a reorganização de pastas, a entrada antiga pode continuar apontando para `extension`. Carregue o novo caminho. O identificador pode mudar quando uma extensão sem chave fixa é carregada de outro local; reconecte em Minha conta se necessário.

### Configuração e .env

A extensão carrega `environment.js`. A configuração local aponta para o frontend na porta 4200 e a API na porta 8000. Para homologação, defina `frontendOrigin` e `appOrigins` com o domínio HTTPS do OCTOR, `apiBase` com a URL HTTPS que termina em `/api` e adicione o padrão do frontend a `externally_connectable.matches` no manifesto. Recarregue a extensão em `chrome://extensions` e reconecte a conta.

Em `playbackTestOrigins`, inclua somente origens HTTPS dedicadas à homologação dos procedimentos. Essa lista autoriza o site onde o procedimento será guiado. O domínio do OCTOR pertence a `appOrigins`.

As origens locais aceitas estão em `manifest.json` (`externally_connectable`) e nas verificações de mensagens de `background.js`, `playback-background.js` e `playback.js`. `popup.js` também contém o endereço de login. Trocar somente uma constante não adapta toda a comunicação a outro domínio.

Nunca embutir chave de IA ou Client Secret na extensão. Credenciais do provedor pertencem ao backend. Os tokens de sessão recebidos da conta são armazenados pelo fluxo atual em `chrome.storage.local`.

## Funcionalidades e fluxo de dados

### Captura

1. O painel envia `START_RECORDING`; o worker verifica o estado e prepara a captura na aba.
2. O content script observa cliques/alterações confiáveis enquanto a gravação está ativa e sem pausa. Registra seletor, identidade do alvo, URL, viewport e tempo; determinados campos sensíveis são excluídos do evento.
3. `PREPARE_CAPTURE` e `CAPTURE_CONTEXT` permitem confrontar a cena com o alvo original. A fila respeita o intervalo de captura; se a imagem não for confiável, o passo recebe aviso em vez de uma imagem arbitrária.
4. A finalização cria o guia e envia o conjunto em `POST /api/guides/<id>/bulk-steps/`. O áudio, quando presente, segue em envio multipart do guia.
5. IDs de envio pendente ajudam a retomar falhas sem recriar o guia a cada tentativa. Ao confirmar o fluxo, o worker limpa a gravação e abre o editor web.

### Voz

O microfone funciona em uma aba/contexto dedicado, com `MediaRecorder`. Pausas são descontadas do relógio e os intervalos são associados aos passos. A aba precisa permanecer disponível até finalizar o envio. Fechá-la antes pode perder áudio ainda não salvo, mesmo que os passos tenham sido preservados.

A extensão grava e envia áudio; a preparação/transcrição e a geração das instruções acontecem pelo backend e pelo fluxo do editor. Uma gravação de voz não representa renderização de vídeo pronta.

### Me guie

O editor solicita `START_PLAYBACK`. O worker mantém sessão e progresso ligados a uma aba, abre o endereço do passo e só aceita comandos da aba correspondente. O script da página resolve o alvo, injeta painel/destaque, rola a tela e espera o usuário executar a ação e avançar.

O Me guie apresenta instruções, destaca elementos e rola a página. O participante decide se executa a ação. Avançar registra o progresso do tutorial sem verificar o resultado da operação.

Por padrão, os passos interativos só podem usar `localhost`, `127.0.0.1` ou `[::1]`. Para liberar um sistema de homologação remoto, o responsável pela extensão deve cadastrar sua origem HTTPS exata (esquema, host e porta) em `PLAYBACK_TEST_ORIGINS`, no `playback-background.js`, e recarregar a extensão. Um passo fora da lista impede a abertura do tutorial. Consulte as capturas no OCTOR para acompanhar procedimentos gravados em produção.

Durante o Me guie, o Chrome bloqueia as requisições de rede atribuídas à aba guiada para origens fora do roteiro, incluindo redirecionamentos e chamadas a APIs. A rota de retorno ao OCTOR é liberada para concluir treinamentos. Serviços em outras abas ou no servidor de homologação ficam fora desse filtro. Use um ambiente com dados e integrações de teste, pois o participante ainda pode acionar os controles desse ambiente. Se uma dependência externa for bloqueada, use as capturas para consultar o passo.

## Mensagens, sessão e API

| Contrato | Origem/destino e finalidade |
| --- | --- |
| `CONNECT_ACCOUNT` | Web → worker: pareamento; verifica tokens consultando `/api/auth/me/`. |
| `RECORDER_READY` | Worker → content script: verifica disponibilidade do capturador. |
| `START_RECORDING`, `PAUSE_RECORDING`, `FINISH_RECORDING` | Painel/contexto de voz → worker: controle da sessão. |
| `PREPARE_CAPTURE`, `ACTION_PERFORMED` | Site → worker: contexto e ação do usuário. |
| `CAPTURE_CONTEXT` | Worker → site: confirma a cena do alvo registrado. |
| `VOICE_FAILED` | Contexto de voz → worker: falha vinculada à sessão/aba esperada. |
| `target: live-narration`, `sessionId`, `command` | Worker → voz: `pause`, `freeze`, `abort` ou `upload`. |
| `START_PLAYBACK`, `GET_PLAYBACK`, `MOVE_PLAYBACK`, `STOP_PLAYBACK` | Editor/aba → worker: ciclo de vida do tutorial. |
| `AUTOGUIDE_START`, `AUTOGUIDE_RESULT` | Ponte entre página local e extensão para solicitação/confirmação do tutorial. |

O armazenamento local mantém, entre outros, `authToken`, `refreshToken`, `isRecording`, `isPaused`, `recordedSteps`, `playback` e IDs de upload pendente. A ponte de tutorial recebe conteúdo do guia; o pareamento de credenciais é um contrato externo separado, com origem verificada.

Requisições à API usam Bearer. Ao receber 401 no envio, o worker tenta renovar em `/api/auth/refresh/` e repete a requisição uma vez. Falha de renovação não deve apagar passos pendentes. URLs de backend, tokens e dados não são enviados ao site por meio dos destaques.

### Permissões e dados capturados

O manifesto atual declara `<all_urls>` para hosts e content scripts. Isso permite atuação ampla nos sites elegíveis; não significa que todo clique seja gravado, pois o estado de gravação é verificado. Páginas internas/protegidas pelo navegador podem impedir a captura/injeção.

Ignorar eventos de senha não mascara automaticamente dados pessoais em imagens ou todos os valores de outros campos. Antes de compartilhar um guia, revise capturas, texto, URLs e áudio. A ação que o usuário executar no sistema real continua tendo efeito naquele sistema. Essas limitações são existentes e não foram corrigidas pela documentação.

## Testar

Na raiz `PROJETO OCTOR`:

```powershell
```


Teste manual em ambiente controlado: gravar dois cliques, pausar/retomar, finalizar e verificar quantidade de passos/imagens; repetir com voz mantendo sua aba aberta; iniciar Me guie, conferir elemento/URL, avançar, voltar e encerrar. Use dados fictícios: este teste não é uma simulação do sistema acessado.

Para regenerar tema: `node scripts/build-theme.cjs` na raiz e recarregar a extensão/página. Não editar os arquivos de tema gerados diretamente.

## Distribuição e deploy

A extensão não é hospedada como uma API ou SPA; é carregada/instalada no navegador. Para teste local, a pasta `extensao` é a entrega. Para distribuição pública, preparar pacote, versão, descrição de permissões/privacidade e processo da loja do navegador em uma etapa própria. Não há publicação em loja, empacotamento automatizado, chave fixa de extensão ou atualização própria configurados aqui.

Antes de usar backend/frontend hospedados, ajustar conjuntamente URLs, origens de mensagens/manifesto, HTTPS, configuração Google e CORS do servidor. O ID de uma versão distribuída deve ser pareado corretamente. Não publicar o pacote supondo que os endereços localhost apontem para seu servidor remoto.

Sequência para preparar a distribuição: ajustar as configurações públicas em uma alteração própria, atualizar a versão do manifesto quando for uma nova versão, testar a pasta sem compactação e montar o pacote com `manifest.json` na raiz. Incluir os arquivos executáveis, HTML, CSS e tema referenciados pelo manifesto e seus imports, inclusive `playback-background.js`; testes e README não são necessários ao runtime. O envio à loja e a aprovação são etapas separadas que não foram executadas.

## Problemas comuns

| Sintoma | Conferência/ação |
| --- | --- |
| Painel não abre | Conferir versão mínima declarada, extensão habilitada e erro do service worker em chrome://extensions. |
| Content script indisponível | Atualizar a página após recarregar a extensão; usar página HTTP/HTTPS elegível. |
| Login/Me guie não comunica | Conferir origens locais, mesma conta, ID da extensão e disponibilidade de web/API. |
| Token expirou ao finalizar | Entrar novamente na mesma conta e tentar finalizar; preservar a aba de voz e os passos até confirmar o envio. |
| Passo sem imagem | A cena pode ter mudado antes da captura confiável; revisar o aviso no editor. Capturas antigas ausentes não são reconstruídas pelo script. |
| Destaque não aparece | Conferir URL, menu aberto, visibilidade e ambiguidade do elemento; Tentar novamente ou Encerrar. |
| Voz perdida | Verificar permissão e se a aba do microfone foi fechada antes do envio; áudio não salvo pode ser irrecuperável. |
| Atualização do código não aparece | Recarregar extensão e página do site. Após mudar a pasta, carregar pelo caminho novo. |

Consulte também os [relatórios de organização](../docs/REORGANIZACAO-ETAPA-1.md) e [comentários](../docs/COMENTARIOS-ETAPA-2.md).
