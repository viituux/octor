# Continuidade para outro agente — OCTOR

Atualizado em 16/11/2026. Leia este arquivo e docs/MANUAL-POR-URL-HANDOFF.md antes de alterar o fluxo de captura. Este documento registra decisões e verificações; confirme o estado atual do código antes de agir.

## Projeto e prioridades

- Repositório: https://github.com/viituux/octor, branch master. Aplicação: https://octor.app.br.
- Frontend Angular 19 em front/; Django/DRF em back/; PostgreSQL; extensão Chrome Manifest V3 em extensao/.
- O Me guie orienta o participante, que executa as ações. Não confundir com o agente do Manual por URL.
- Manual por URL usa Gemini, sem Qwen; chaves ficam no backend. A captura e navegação reais ainda precisam de validação. O usuário decidiu deixar seu aprimoramento para depois e preparar a apresentação da Amostratech.
- Preserve funcionalidades, dados e controles de acesso. Não confunda publicação com aprovação de testes de ponta a ponta.

## Correção mais recente: autorização do Pulsus no Me guie

Sintoma: passo em https://app.pulsus.mobi bloqueado como não autorizado para testes.
Causa: extensao/environment.js autorizava apenas https://github.com em playbackTestOrigins. Localhost é aceito separadamente por playback-background.js.
O usuário confirmou explicitamente que app.pulsus.mobi é um ambiente separado de testes. Foi adicionada somente essa origem HTTPS exata, mantendo github.com. Não foi liberado wildcard, HTTP ou outro subdomínio.

Arquivos relevantes:
- extensao/environment.js: configuração das origens.
- extensao/playback-background.js: isTestDestination, START_PLAYBACK, proteção de navegação por aba e validação dos passos.
- front/src/app/components/guide-editor/guide-editor.component.ts: classificação do ambiente do guia; essa classificação não substitui a lista da extensão.

Verificações feitas nesta alteração:
- node --check extensao/environment.js: passou.
- node --test extensao/tests/playback.test.cjs: 16 testes passaram. A mensagem API indisponível é provocada pelo teste de falha de proteção; não é falha da suíte.
- Verificação da configuração real: HTTPS app.pulsus.mobi autorizado; HTTP e outro.pulsus.mobi não autorizados.
- Ainda não foi executado um procedimento real no Pulsus após a atualização. Validar abertura, recursos da página, destaque e avanço no Chrome. Serviços/CDNs de outras origens podem continuar bloqueados; investigar os destinos necessários antes de liberar qualquer um.

## Publicação realizada

Em 16/11/2026, foi atualizado somente environment.js dentro do ZIP que já estava publicado na AWS Lightsail. Não houve migração, alteração de backend ou rebuild de frontend nesta correção.
- Download: https://octor.app.br/assets/octor-extensao.zip
- Arquivo servido: /srv/octor/front/dist/octor/browser/assets/octor-extensao.zip
- Backup do pacote anterior no servidor: /home/ubuntu/octor-extensao-before-pulsus.zip
- SHA256 do pacote publicado e conferido por download HTTPS: d925686359cc1f9a9a6a700974a64ed18d0d8bbec3be996ee37bbbca7dacebb5
- Publicar o ZIP não atualiza extensões instaladas. Baixar, extrair na pasta carregada, recarregar em chrome://extensions e atualizar a página do OCTOR. Na máquina do autor, o código está em D:\PROJETO OCTOR.
- Não publique a aplicação inteira para resolver uma atualização exclusiva da extensão.

## Pendências e testes em um clone novo

O .gitignore existente exclui extensao/tests, front/tests e testes Python, por decisão anterior do usuário. Os 16 testes citados existem localmente, mas não estarão em um clone novo. Não anuncie reprodução desses resultados sem os arquivos de teste. A verificação recente não equivale à suíte completa do backend ou a uma auditoria de segurança.
Credenciais, .env, bancos, capturas privadas, dependências e artefatos temporários não devem ser adicionados ao Git. Solicite acesso por configuração local segura quando necessário; não copie segredos do histórico de conversa.

## Apresentação Amostratech

São duas horas no estande, com falas curtas para os jurados. Equipe: usuário, Daniel e Gustavo. Foram criados 12 slides com notas: problema, público, fluxo, criação de guias, demonstração, Me guie, treinamento, arquitetura, segurança, validação e conclusão.
Slides: https://docs.google.com/presentation/d/12qKwN80JLf-bks6CqnbiXQk52pTRBy2DL509wR6RFq8/edit
Materiais locais: C:\Users\victo\Documents\Codex\OCTOR-Amostratech (roteiro e diagrama Excalidraw/PNG/SVG/PDF); não fazem parte deste repositório.
Próximo passo sugerido: validar guia de demonstração de 3 a 5 passos e gravar vídeo de reserva. Apresentar Manual por URL como em validação. Não prometer conformidade legal, risco zero ou ganhos quantitativos não medidos.
## Diagnóstico da geração e atualização da credencial em 16/11/2026

- A demora relatada na geração de instruções foi investigada no servidor. A AWS estava com carga baixa e memória disponível; o provedor Gemini retornou HTTP 429 RESOURCE_EXHAUSTED.
- A cota reportada para a credencial anterior era de 20 requisições diárias por projeto/modelo no nível gratuito. Modelo de instruções ativo: gemini-3-flash-preview. Esse limite descreve a resposta observada naquele momento, não uma garantia de limite atual de todas as contas.
- O guia investigado tinha 12 passos. O frontend gera um passo por chamada, sequencialmente. O backend converte erros do provedor em HTTP 503 e o frontend continua o lote após falhas. Isso ainda precisa ser melhorado para interromper ao atingir a cota e informar o motivo claramente. Nenhuma correção desse comportamento foi implementada nesta atualização.
- A pedido do usuário, uma nova credencial foi validada com uma solicitação mínima ao Gemini (HTTP 200) e aplicada somente em LLM_API_KEY e GEMINI_API_KEY no ambiente privado da AWS. Não houve troca de modelo, alteração da credencial de voz ou migração de banco.
- Serviços octor e octor-manual-worker reiniciados e confirmados ativos; página pública respondeu HTTP 200. O teste não gerou nem substituiu instruções de guias e não comprova disponibilidade de cota para um lote inteiro.
- A credencial e o arquivo .env não pertencem ao Git. Um clone novo exige configuração privada própria. Chaves pessoais ou de equipe podem ter precedência sobre a chave padrão; verificar o resolvedor em back/ai/credentials.py ao diagnosticar um usuário específico.