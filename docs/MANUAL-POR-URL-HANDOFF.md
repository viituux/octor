# Continuidade do Manual por URL

O OCTOR usa Angular no frontend, Django REST Framework no backend e uma extensão Chrome para coletar capturas. O fluxo Manual por URL começa em /manuals. A pessoa fornece a URL e o objetivo. A extensão abre a página, coleta evidências e envia capturas à API. O backend consulta o Qwen via OpenRouter para planejar a navegação e gerar o rascunho. A publicação do guia depende da revisão humana.

- front/src/app/components/manuals reúne o formulário, a revisão e o histórico. O objetivo começa vazio. A exclusão remove o manual e os arquivos da coleta após confirmação e preserva o guia criado. Coletas e gerações ativas precisam ser interrompidas primeiro.
- extensao/manual-background.js coordena a aba, a estabilidade da tela, o destaque, o print e a consulta ao planejador. extensao/manual-observer.js identifica controles visíveis. O contorno é desenhado antes do print. A navegação revalida o alvo antes de clicar.
- back/manuals/views.py autentica e restringe coletas ao proprietário. back/manuals/services.py contém os prompts e a integração com o provedor. O planejador recebe objetivo, domínio, título, texto e controles e pode indicar próximo passo, conclusão, dúvida ou falha. A geração exige referências a capturas existentes.

## Onde continuar

No teste anterior com o YouTube, o fluxo chegou à página Você e encontrou o rótulo Mudar de conta, mas a lista de contas não foi confirmada. A extensão ganhou suporte ao rótulo e ao controle clicável interno. Reproduza em um perfil de teste, com o ZIP mais recente carregado. Verifique se o menu chega à lista, se o contorno fica gravado sobre o alvo correto e se o rascunho usa o print correspondente. Pare na lista de contas. Use telas e dados de teste ao compartilhar evidências.

A captura automática segue a aba atual e os destinos admitidos pela validação do backend. Novas abas e outros domínios ainda precisam de implementação e validação. Investigue também a retomada quando a IA pede atenção depois de salvar um print. O loop pula ordens já gravadas, o que pode impedir uma nova decisão naquela região. As lacunas de captura são registradas no resumo do rascunho.

## Verificação

- Backend: python back/manage.py check
- Frontend: npm --prefix front run build
- Extensão, no PowerShell: node --test (Get-ChildItem extensao/tests -Filter '*.test.cjs').FullName
- Em produção: https://octor.app.br/manuals
- Atualização manual da extensão: baixe https://octor.app.br/assets/octor-extensao.zip, extraia e recarregue no Chrome.

O backend, o frontend e o ZIP desta série de mudanças foram publicados na AWS em etapas. O deploy foi feito separadamente do GitHub. Os testes automatizados e verificações de publicação passaram. O fluxo de captura no YouTube e a exclusão em sessão autenticada ainda precisam de validação de ponta a ponta. Use as configurações de ambiente do projeto. Mantenha chaves, tokens, capturas privadas e credenciais fora do repositório.
