# OCTOR — manual do usuário

Atualizado em 6 de novembro de 2026. As instruções abaixo descrevem o ambiente web e a extensão atuais.

## 1. Acessar sua conta

1. Abra o OCTOR em `http://localhost:4200` no ambiente local.
2. Entre com usuário e senha ou use **Cadastrar** para criar uma conta.
3. Em **Minha conta**, atualize nome, usuário e e-mail. Alterações sensíveis podem exigir a confirmação da identidade.
4. Utilize a configuração de senha para criar uma nova senha e o controle de sessões para revogar outros acessos.

O botão Google depende da configuração OAuth feita pelo responsável pelo ambiente. Para vincular uma conta Google a uma conta local existente, entre primeiro com sua senha. Não existe recuperação de senha por e-mail descrita no fluxo atual.

## 2. Preparar a extensão

Instale a extensão pela pasta `extensao`, conforme o [guia técnico](DOCUMENTACAO-TECNICA.md). Abra o painel lateral pelo ícone do OCTOR e conecte sua conta. Quando usar a opção de conexão pelo navegador, confirme a conta que será enviada à extensão.

Depois de atualizar o projeto, recarregue a extensão em `chrome://extensions` e atualize a página do site. Finalize qualquer captura ou tutorial antes de trocar de conta.

## 3. Criar um procedimento gravando ações

1. Abra o sistema que será documentado, preferencialmente em homologação e com dados de exemplo.
2. Abra o painel do OCTOR, informe o título e inicie a gravação.
3. Execute o procedimento em ritmo que permita conferir cada ação. Evite cliques em sequência muito rápida.
4. Use pausa quando precisar sair do contexto do procedimento.
5. Finalize a gravação e abra o guia no editor.
6. Confira a ordem, os textos e as imagens de todos os passos. Corrija ou remova informações pessoais.

O OCTOR pode preservar um passo sem imagem quando não consegue associar uma captura confiável à ação. Prints ausentes não são recuperados automaticamente de uma gravação antiga.

## 4. Narrar durante a gravação

1. Antes de iniciar, marque a opção de gravar com microfone.
2. Na aba auxiliar, autorize o acesso e use **Ativar microfone e começar**.
3. Mantenha essa aba aberta e narre enquanto executa as ações no site.
4. Finalize pelo painel e confira o áudio no editor.
5. Revise os intervalos associados aos passos e as instruções geradas.

A fala é processada depois da gravação. A associação inicial usa os tempos dos cliques e pode precisar de ajustes. Fechar a aba auxiliar antes do envio pode perder o áudio em memória. Se o envio falhar, confira a sessão e tente finalizar novamente; há opção de finalizar sem narração.

Também é possível selecionar um passo no editor e gravar uma narração individual, ouvir a prévia e salvar.

## 5. Revisar e gerar instruções

No editor, ajuste o título e a descrição do guia, revise o texto de cada passo e confira o destaque e o enquadramento do print. Use a geração de instrução do passo ou de todas as instruções conforme a necessidade. Confirme antes de substituir textos e revise o conteúdo devolvido pela IA.

O modelo pode interpretar incorretamente uma tela ou uma fala. Uma instrução bem escrita não comprova que a ação foi executada nem que o resultado foi alcançado.

## 6. Criar manual a partir de uma URL

1. Na biblioteca, abra **Manual por URL**.
2. Informe a URL da página e um objetivo específico, por exemplo: “Documentar a busca e os filtros visíveis”.
3. Autorize a coleta e o processamento das evidências pela IA.
4. Mantenha a aba/janela da coleta em primeiro plano. Se precisar de login, autentique-se no próprio site e siga a mensagem apresentada pelo OCTOR.
5. Confira as capturas e os avisos de conteúdo incompleto. A coleta reúne até seis regiões da mesma página.
6. Gere o manual ou aguarde a geração, caso tenha escolhido a opção automática.
7. Revise seções, passos, imagens e controles destacados. Se um elemento não estiver identificado, deixe o passo sem destaque.
8. Confirme a revisão e aprove para criar um guia em rascunho.

Esse modo não visita automaticamente todas as páginas do site nem executa compras, cadastros ou formulários. Para outra página, inicie uma nova coleta com a URL correspondente. Os passos desse manual são referências e não habilitam **Me guie**.

Se a IA atingir um limite ou ficar sem créditos, as capturas permanecem disponíveis para nova tentativa. A configuração das chaves é responsabilidade do servidor; não é necessário inserir chave na tela do usuário.

## 7. Usar Me guie

1. Abra um guia gravado com URLs e elementos identificados e clique em **Me guie**.
2. Aguarde a abertura do sistema e faça login, se necessário.
3. Leia a orientação e execute você mesmo a ação destacada.
4. Use **Próximo**, **Voltar**, **Pular** ou **Tentar novamente**, conforme a situação.
5. Conclua ou encerre o tutorial ao terminar.

Se o site mudou, o elemento pode não ser encontrado. Não execute uma ação sensível apenas porque há um destaque: confira o contexto. O tutorial orienta, mas seus cliques continuam operando no sistema real. Fechar a aba encerra a sessão do tutorial.

## 8. Organizar e compartilhar

Use as áreas da biblioteca para encontrar seus guias, consultar compartilhamentos, marcar favoritos e acessar a lixeira. Publicar um guia e compartilhá-lo são operações distintas; confira quem terá acesso.

Em **Configurações e membros**, o proprietário da equipe pode buscar contas por nome de usuário e adicionar membros, além de gerenciar convites. Os avisos internos ficam na central de notificações e podem ser marcados como lidos. Não presuma que uma notificação interna também será enviada por e-mail.

## 9. Treinamentos

**Como responsável:** crie o treinamento com base em um guia, cadastre cinco perguntas com quatro alternativas e uma correta em cada uma, confirme a revisão, publique e atribua os participantes. Consulte os detalhes e o dashboard para acompanhar conclusão, avaliações e comentários disponíveis no seu escopo.

**Como participante:** abra **Meus treinamentos**, inicie e finalize o conteúdo. Nas versões novas, responda às cinco perguntas obrigatórias, uma por vez. Cada acerto vale 20 pontos e o tempo do quiz desempata o ranking. Fechar a página não pausa o relógio; respostas confirmadas ficam salvas e não podem ser alteradas. Ao terminar, confira o resultado e envie de uma a cinco estrelas e comentário opcional de até 500 caracteres para concluir. Versões antigas já iniciadas preservam o fluxo sem quiz. Consulte [regras e ranking](QUIZ-OBRIGATORIO.md).

Na gestão, consulte o histórico de versões publicadas e abra um participante para ver sua versão cursada e exportar o registro de auditoria em JSON. O número do treinamento é independente da versão do OCTOR, exibida no topo. Veja [versionamento e auditoria](VERSIONAMENTO-E-AUDITORIA.md).

## 10. Salvar um PDF

No editor, use o controle de impressão/exportação. Na janela do navegador, selecione **Salvar como PDF**, confira a prévia e salve o arquivo. Revise seções, instruções, paginação e capturas completas antes de compartilhar. Ajustes de zoom do editor não devem ser confundidos com o enquadramento do documento impresso.

## 11. Resolver problemas

| Problema | O que fazer |
| --- | --- |
| Extensão não respondeu | Recarregar extensão e página, confirmar conta e usar a origem local configurada |
| Sessão expirada | Entrar novamente e reconectar a extensão |
| Coleta parou | Ler a mensagem; manter aba ativa e resolver login/CAPTCHA no próprio site |
| Destaque incorreto | Conferir o alvo, tentar novamente e revisar ou regravar o passo |
| Falha ao gerar instrução | Preservar os prints e informar a mensagem ao responsável pelo servidor |
| Treinamento não aparece | Confirmar a conta, a atribuição e se o responsável publicou o conteúdo |

Ao relatar um problema, informe funcionalidade, página, sequência de ações e mensagem do erro. Não envie senha, token ou chave de API.
