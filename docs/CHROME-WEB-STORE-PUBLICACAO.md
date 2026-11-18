# Publicação da extensão OCTOR na Chrome Web Store

Documento de preparação, não comprovação de aprovação. Revisar as declarações contra o código e o comportamento em produção.

## Dados do item
- Nome: OCTOR — Gravador de Procedimentos
- Idioma: Português (Brasil)
- Categoria sugerida: Produtividade
- Site: https://octor.app.br
- Versão observada no manifesto: 1.2.5

## Descrição detalhada sugerida
O OCTOR ajuda a transformar procedimentos realizados no navegador em guias visuais e treinamentos. Ao iniciar uma gravação, a extensão registra interações e contexto das etapas, permite capturas de tela e, quando habilitado pelo usuário, narração por microfone. Os procedimentos são enviados à plataforma OCTOR para revisão e organização. O recurso Me guie apresenta instruções e destaca elementos nas páginas compatíveis, enquanto o próprio usuário executa as ações. É necessária uma conta OCTOR para utilizar recursos conectados.

## Finalidade única
Registrar procedimentos do navegador e orientar sua execução por meio de guias interativos integrados à plataforma OCTOR.

## Justificativas de permissões — confirmar contra o código
- storage: guardar estado de gravação, passos pendentes, configurações, progresso e tokens de sessão/renovação para continuidade do fluxo. Os tokens são dados sensíveis: revisar segurança e ciclo de vida.
- activeTab: interagir com a aba escolhida pelo usuário ao iniciar gravação ou orientação.
- tabs: acompanhar abas, URLs e navegação para associar passos e controlar o Me guie.
- scripting: executar scripts necessários à captura e ao destaque de elementos nas páginas elegíveis.
- sidePanel: apresentar controles de gravação e orientação no painel lateral.
- declarativeNetRequestWithHostAccess: aplicar restrições de requisições na aba de teste durante o Me guie. Revisar necessidade e impacto.
- downloads (opcional): confirmar no código o recurso que solicita esta permissão; remover se não utilizada.
- host_permissions <all_urls> e content_scripts <all_urls>: permitir gravação e orientação em sites variados selecionados pelo usuário. É uma permissão ampla: justificar necessidade e avaliar escopo menor antes de enviar.

## Práticas de privacidade
A extensão pode tratar dados de autenticação, URLs, seletores, texto/contexto de interações, imagens e áudio opcional. O manifesto por si só não comprova todas as categorias efetivamente coletadas. Auditar background.js, content.js, popup.js, live-recorder.js, endpoints Django, armazenamento e fornecedores de IA. Não marcar declarações como verdadeiras sem validação.

## Checklist do desenvolvedor
- [ ] Preencher descrição detalhada.
- [ ] Selecionar idioma e categoria.
- [ ] Inserir e verificar e-mail de contato nas configurações do publisher.
- [ ] Conferir todas as permissões e suas justificativas.
- [ ] Auditar coleta, transmissão, retenção, exclusão, segurança e terceiros.
- [ ] Publicar Política de Privacidade verdadeira e acessível por HTTPS.
- [ ] Informar URL pública da política na guia Práticas de privacidade.
- [ ] Declarar categorias de dados e confirmar conformidade somente após auditoria.
- [ ] Testar gravação, pausa, finalização, login, voz e Me guie em ambiente de homologação.
- [ ] Preparar credenciais de teste e instruções de avaliação sem dados reais, se necessário.
- [ ] Criar ZIP com manifest.json na raiz e arquivos de runtime; não incluir .env nem segredos.
- [ ] Enviar para revisão e acompanhar eventuais solicitações.

## Atenção
O painel da Chrome Web Store exige ações na conta do publisher que não podem ser concluídas por commits no GitHub. Esta documentação não altera produção nem publica a extensão.
