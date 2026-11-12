# Manual de usuário a partir de URL — piloto de leitura

## Escopo entregue

O menu **Manual por URL** aceita endereços HTTP/HTTPS de páginas acessíveis pelo navegador. A extensão abre a URL, lê elementos visíveis e rola até seis regiões identificadas por títulos. Não executa cliques, não preenche campos nem envia formulários. O provedor configurado recebe os textos e prints autorizados e gera um documento estruturado em seções e passos. O criador revisa, edita e aprova antes da conversão em guia rascunho.

## OpenRouter e Qwen somente para o manual

Configure no arquivo local `back/.env` (não versionado):

```dotenv
MANUAL_LLM_PROVIDER=openrouter
MANUAL_LLM_MODEL=qwen/qwen3-vl-30b-a3b-instruct
OPENROUTER_API_KEY=
```

Preencha a chave somente no servidor e reinicie o backend. As variáveis `LLM_PROVIDER`, `LLM_MODEL` e `LLM_API_KEY` continuam controlando as demais funções. Com `MANUAL_LLM_PROVIDER` vazio, o manual mantém o provedor anterior. Nenhuma migration ou dependência nova é necessária.

O adaptador envia as capturas JPEG e o contexto da interface para `https://openrouter.ai/api/v1/chat/completions`, com JSON Schema estrito. O roteamento está restrito ao DeepInfra, sem fallback para outro provedor ou Gemini. O provedor precisa suportar todos os parâmetros exigidos. Alterar modelo pode exigir revisar essa compatibilidade.

O backend continua validando IDs de capturas, índices dos controles e limites do documento. Rejeita respostas truncadas e referências inexistentes; permite somente uma nova tentativa para formato inválido. Falhas de crédito (402), autenticação (401/403), limite (429) e rede preservam as capturas. A troca não acrescenta navegação autônoma entre páginas.

Validação: `back/venv/Scripts/python.exe back/manage.py test manuals --noinput`. Os testes simulam o transporte e cobrem imagens, contrato, isolamento de configuração, ausência de fallback e falhas do provedor. Testes reais usam apenas imagens sintéticas; não há envio de prints privados nos testes automatizados.

Esta versão documenta uma página por coleta. Para outra tela, informe sua URL em uma nova coleta. Não há exploração autônoma de todas as páginas, automação de cadastros, compras, login ou comprovação de resultados de botões. O modo Me guie fica desabilitado para os passos de referência, inclusive quando usados em treinamentos.

## Como usar

Em outro terminal, execute `back/venv/Scripts/python.exe back/manage.py process_manual_queue`
a partir da raiz do projeto. O worker usa o mesmo PostgreSQL da API.
Gerações aguardam na fila se o worker estiver desligado. Você pode fechar a página e
reabri-la para acompanhar, cancelar ou tentar novamente após uma falha.

1. Reinicie o backend se necessário; a migration `manuals.0001_initial` deve estar aplicada.
2. Recarregue a extensão em `chrome://extensions`, reconecte sua conta pelo fluxo existente e atualize o OCTOR.
3. Na biblioteca, abra **Manual por URL**. Informe URL e objetivo e autorize a coleta e o uso das evidências pelo provedor de IA.
4. A geração automática fica desmarcada por padrão. Se você marcar a opção, o OCTOR enviará as capturas à IA assim que a coleta terminar.
5. Mantenha a aba e a janela da coleta ativas. A leitura registra até seis prints. Ao terminar, retorna ao OCTOR quando a aba de origem ainda está disponível e o usuário não mudou de janela.
6. Se precisar fazer login, resolver uma verificação do site ou retomar após perda de foco, use a própria página e depois **Continuar coleta** no painel da extensão. Se a URL tiver mudado, crie outra coleta com a URL final. Não há bypass de autenticação, CAPTCHA ou bloqueios do navegador.
7. No fluxo padrão, confira todas as capturas, confirme que elas podem ser enviadas e clique em **Enviar à IA e gerar manual**. Depois da geração, revise títulos, seções, textos e referências. É possível remover passos e trocar seu print de referência.
8. Confirme a revisão e clique em **Aprovar e criar guia rascunho**. O editor existente preserva as seções e permite impressão/PDF. O guia pode ser usado no módulo de treinamento existente, com publicação posterior pelo criador.

## Arquitetura

- `back/manuals`: modelos ManualRun/ManualCapture, validação, geração e endpoints privados por criador.
- `front/src/app/components/manuals`: coleta, progresso, prévia e revisão responsiva.
- `front/src/app/services/manual.service.ts`: API autenticada e ponte de mensagens sem envio de credenciais ao site de destino.
- `extensao/manual-observer.js`: leitura reduzida e máscaras para campos de formulário.
- `extensao/manual-background.js`: exclusão mútua com gravação/Me guie, vínculo da aba, verificação de foco/URL e captura.
- `extensao/manual-bridge.js`: aceita comandos apenas das origens locais do OCTOR já utilizadas pelo projeto.

Não foram adicionadas dependências ou permissões de navegador. Esta versão não utiliza debugger, Playwright no servidor, Redis ou Celery para a execução. A geração é uma chamada HTTP ao Gemini, com timeout e resposta estruturada validada.

## API

Prefixo `/api/manuals/`, sempre com JWT e filtro pelo criador:

| Método | Caminho | Função |
| --- | --- | --- |
| GET/POST | `/` | Histórico de até 30 coletas / nova coleta autorizada |
| GET | `/{id}/` | Progresso, referências e documento |
| POST | `/{id}/captures/` | Upload validado e idempotente por chave |
| GET | `/{id}/captures/{capture_id}/image/` | Print bruto privado, sem cache compartilhado |
| POST | `/{id}/captured/` | Finaliza coleta com imagens |
| POST | `/{id}/attention/` | Sinaliza intervenção necessária |
| POST | `/{id}/generate/` | Gera JSON fundamentado nos prints |
| POST | `/{id}/cancel/` | Interrompe; resultado tardio de IA não aprova o manual |
| POST | `/{id}/approve/` | Recebe document + reviewed=true; conversão idempotente em guia rascunho |

A conversão preserva `manual_section` e `manual_evidence` nas annotations. Os passos usam `action_type=reference`, sem seletor ou alegação de interação executada.

## Privacidade, limites e observações

- O backend não baixa URLs informadas: a leitura ocorre na aba autorizada da extensão. A única requisição externa do backend nesta funcionalidade é para a API fixa do Gemini.
- Não são coletados cookies, senhas nem valores de campos nos metadados. Os prints recebem máscaras nos campos de formulário; isso não garante ocultação de dados pessoais presentes em tabelas, textos ou imagens. A revisão permanece obrigatória.
- Capturas brutas ficam em `back/private_manuals`, fora de MEDIA_ROOT, ignoradas pelo Git e acessíveis somente pelo endpoint autenticado do criador. Faça backup e gestão de retenção conforme sua política; esta versão não implementa expiração automática dos arquivos.
- Após aprovação, as cópias incorporadas ao guia seguem o armazenamento de imagens existente do OCTOR. A configuração atual de mídia pública precisa de revisão própria antes de uma hospedagem com conteúdo confidencial.
- Limites: 6 prints por coleta, 40 controles e 5.000 caracteres de evidência por print, imagem original de até 4 MiB / 16 milhões de pixels e normalização até 1600 px; documento de até 6 seções / 30 passos. Chamadas administrativas de manuais têm limite de 12/min por usuário.
- URLs com credenciais ou fragmentos são rejeitadas. Mudança de URL exige uma nova autorização/coleta. Eventos de gravação humana continuam filtrando isTrusted; esta coleta não reaproveita eventos sintéticos.
- Só uma coleta da extensão pode executar por vez; fechar a aba, perder foco ou reiniciar a extensão não deve produzir prints silenciosos de outra página.
- Gemini precisa estar configurado em back/.env. Falhas preservam as capturas para tentativa explícita posterior.

## Verificação realizada

- 12 testes novos de backend: isolamento por criador, privacidade de imagens, consentimento/URL, idempotência, limites, cancelamento, falha/retry, JSON estruturado, evidências inexistentes e revisão obrigatória.
- 46 testes de backend ao incluir regressões de biblioteca e treinamentos.
- 26 testes existentes de frontend e diálogos.
- 6 testes do controlador da extensão: origem, aba/janela, redirect, mutex com gravador e interrupção.
- Fluxo em navegador com API Django real, PostgreSQL descartável e IA simulada: URL genérica, leitor real, máscaras, prints, revisão, conversão, seções no editor/PDF e celular. Nenhum registro de teste foi adicionado ao banco de uso.
- Uma chamada real ao Gemini com tela sintética confirmou geração estruturada válida. Não foram enviados dados de usuários reais nesse teste.
- A página pública https://www.ingresso.com/ abriu com HTTP 200 no teste de leitura e apresentou regiões reconhecidas pelo observador. Isso não comprova cobertura de todas as telas ou execução de compra.

Comandos: no backend, `python manage.py test manuals guides.test_library trainings --noinput`; em front, `npm run build` e `node --test tests/*.test.cjs`; na raiz, `node --test extensao/tests/manual-background.test.cjs`.


## Correção do leitor — extensão 1.1.1

A conexão verifica capacidade e sessão antes de criar uma coleta. Usa o canal externo direto quando a conta já conhece o ID da extensão e mantém a ponte da aba como alternativa de descoberta. Um comando de início é enviado por apenas um canal, evitando duplicação de abas em caso de falha de resposta.

O leitor aguarda o carregamento e conteúdo útil, publica progresso no backend e encaminha o motivo detalhado de falhas à interface. As requisições da extensão à API têm prazo de 10 segundos.

Redirecionamentos que apenas acrescentam/retiram www ou fazem upgrade HTTP para HTTPS são confirmados pelo backend somente quando host equivalente, porta, rota e query permanecem compatíveis e não há capturas anteriores. Mudanças de domínio, rota, query ou downgrade não são autorizadas automaticamente.

Endpoints adicionais, sempre autenticados pelo criador: `POST /{id}/canonical/` com url e `POST /{id}/progress/` com message. Progresso/atenção/canonical têm limite próprio de 120/min; geração e demais ações mantêm limite de 12/min.

Validação da correção: 14 testes de backend, 34 de frontend, 7 do controlador da extensão e fluxo no navegador com URL canônica, capturas, revisão e guia. Para carregar o leitor corrigido, recarregue OCTOR em chrome://extensions e confira a versão 1.1.1.


## Robustez da geração estruturada

O schema do Gemini limita até 6 seções e até 5 passos gerados por seção (máximo 30), e capture_id é uma enumeração dos IDs reais fornecidos como strings. O backend normaliza esses IDs para inteiros e continua validando a pertença à coleta. Títulos, resumo e instruções recebem limites explícitos no prompt. Documentos antigos válidos continuam aceitos; não são reescritos automaticamente.

Respostas vazias, JSON inválido, truncamento e inconsistências do documento podem gerar uma única nova tentativa, mais concisa. Não há adivinhação de IDs nem aceitação de JSON parcial. Falhas de autenticação, quota, bloqueio e rede têm mensagens específicas e não disparam repetição automática. O prazo global planejado para as tentativas é de 70 segundos; cada chamada tem timeout próprio limitado pelo saldo de tempo. Cancelamento entre respostas impede outro envio.

A API devolve um código de diagnóstico junto de detail quando a geração falha. Os logs registram somente ID da coleta, tentativa, categoria e caminhos dos campos rejeitados, sem prints, prompts, chaves ou resposta bruta da IA. A interface remove uma mensagem antiga de geração quando confirma que o documento já está disponível para revisão ou foi aprovado.

Validação desta correção: 19 testes de backend e 34 de frontend, build de produção, recuperação no navegador após perda simulada da resposta e teste real do contrato Gemini usando apenas uma imagem sintética. Nenhum manual já revisado foi substituído.


## Qualidade de captura e análise — extensão 1.2.0

- O plano prioriza a área principal, títulos, formulários e tabelas. Posições são limitadas ao fim real da rolagem e regiões próximas são combinadas para reduzir prints repetidos. O limite continua sendo seis regiões por página.
- Antes de salvar, o controlador compara texto, geometria, viewport e estado das imagens; repete a observação para estabilização e tenta novamente se o layout mudar durante a imagem. Instabilidade persistente exige intervenção em vez de salvar um print declarado confiável.
- Animações CSS/transições são pausadas apenas durante a coleta, com estilo e máscaras removidos no fim. Vídeos/canvas não são executados e recebem observação de captura estática; iframes são sinalizados porque seus controles internos não foram inspecionados.
- Textos de rodapés e laterais são evitados, rótulos acessíveis e controles encobertos são tratados. Valores dos formulários continuam ocultados. Estas máscaras não garantem anonimização de dados presentes em tabelas, textos ou imagens.
- As imagens usam JPEG de maior qualidade e normalização até 2400 px, mantendo os limites de upload e de pixels de entrada. O backend calcula hashes de conteúdo/imagem para evitar duplicidade. Similaridade textual não descarta mudanças em conteúdo visual, como gráficos.
- Evidências novas incluem geometria dos controles e alertas de qualidade. O Gemini é instruído a agrupar por funcionalidade, considerar os alertas e evitar passos genéricos ou repetições de menus. Instruções do conteúdo do site são separadas das instruções de sistema.
- Cada passo pode referenciar o índice de um controle real da captura. O backend valida a referência e as coordenadas. A revisão permite escolher/remover destaque e classificar o texto como descrição de interface ou orientação a verificar. Destaques são preservados no guia e no PDF, com tela inteira por padrão.
- Os campos novos ficam nos metadados existentes; nenhuma migration foi necessária. Manuais antigos permanecem compatíveis; para aproveitar resolução e geometria novas, faça uma nova coleta.

Validação: 25 testes de backend, 34 de frontend e 10 do controlador (69 no total), build, fluxo real de navegador/API em banco descartável com IA simulada, geometria e destaque no editor/PDF/celular. A página pública do ingresso.com também foi lida pelo novo observador, que encontrou regiões e controles com geometria válida. O teste real de geração Gemini nesta etapa encontrou limite de uso HTTP 429; por isso o novo contrato de destaques não teve validação de ponta a ponta com o provedor real nesta rodada. Não houve repetição automática desse erro de quota.

Carregue a versão 1.2.0 em chrome://extensions e atualize o OCTOR antes de uma nova coleta.
