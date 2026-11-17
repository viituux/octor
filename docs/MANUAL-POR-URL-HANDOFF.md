# Continuidade do Manual por URL

O OCTOR usa Angular no frontend, Django REST Framework no backend e uma extensão Chrome para coletar capturas. O fluxo Manual por URL começa em /manuals. A pessoa fornece a URL e o objetivo. A extensão abre a página, coleta evidências e envia capturas à API. O backend consulta o Gemini para planejar a navegação e gerar o rascunho. A publicação do guia depende da revisão humana.

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

## Estado em 16/11/2026

- Manual por URL: planejamento e geração com Gemini; configure GEMINI_API_KEY e GEMINI_MODEL apenas no backend.
- Estado persistido em ManualRun.agent_state; migração 0002_manualrun_agent_state. Planos e perguntas usam PENDENCIA_TTL_HORAS (padrão 24). Pendências bloqueiam ações até revisão/retomada.
- Captura: suporte a menus aria-haspopup=true ou menu; observação inclui cabeçalho e menus fora do main. Contorno permanece até a captura, com limpeza posterior. Mudanças nos controles durante a observação causam nova tentativa limitada, sem salvar a tela transitória como passo.
- Depuração opcional da extensão: salva imagens e metadados em Downloads/OCTOR-debug mediante permissão downloads. Essas evidências não devem entrar no Git.
- A última correção do pacote da extensão foi publicada na AWS; publicar o ZIP não atualiza instalações locais automaticamente. Extraia o pacote atualizado na pasta carregada e recarregue em chrome://extensions.
- Teste real com o pedido de criar repositório no GitHub abriu a página inicial e parou como incompleto. Foi adicionada nova observação em caso de mudança dos controles. A repetição final do teste real foi interrompida pelo usuário e permanece pendente; não considerar esse fluxo aprovado.
- Testes locais: 73 testes da extensão passaram. Dois testes Chromium passaram anteriormente (navegação controlada com contorno e retomada com recusa de outro domínio). Os testes continuam ignorados pelo Git conforme a organização existente; não estarão disponíveis em um clone novo.
- Próxima validação: Chrome autenticado, extensão atualizada, objetivo informado pelo usuário, verificar menu +, New repository e formulário. Não enviar o formulário nem criar repositório real durante a validação. Confirmar prints e contornos de cada alvo e vínculo no rascunho.
## Atualização de continuidade — 17/11/2026, extensão 1.2.5

Esta seção substitui as pendências antigas do teste GitHub descritas acima. O teste real no Chrome com a extensão 1.2.4 abriu Criar novo, Novo repositório e chegou ao formulário, com três imagens distintas persistidas; o formulário não foi preenchido nem enviado. A classificação foi específico e o procedimento terminou concluído. Isso valida esse caminho observado, sem garantir outros sistemas.

A versão 1.2.5 corrige a faixa clara sobre o menu: a máscara antiga cobria inclusive campos vazios. Agora a proteção oculta os valores preenchidos no próprio campo e preserva o empilhamento da página. Blocos data-private permanecem ocultos. Propriedades CSS originais são restauradas ao limpar/reaplicar a máscara. Ver docs/MANUAL-CAPTURA-ESTABILIDADE.md para causas, limites e validação.

Arquivos principais: extensao/manual-ready.js (esperas), manual-background.js (orquestração), manual-observer.js (alvos, contorno e privacidade), back/manuals/services.py (Gemini e validação de alvo/rótulo). O pacote front/public/assets/octor-extensao.zip está na versão 1.2.5 e foi publicado na AWS; atualizar o pacote não recarrega automaticamente a extensão do Chrome. O backend não foi alterado no deploy específico da máscara.

Também entram neste envio as alterações locais anteriores de autorização de teste e aprovação de treinamentos, incluindo migrações guides 0008/0009 e trainings 0006. Consultar docs/AUTORIZACAO-TESTE.md e o código para o estado atual. Não executar migrações ou deploy automaticamente só por clonar o repositório.

Os testes da extensão e várias suítes de backend continuam fora do versionamento pelas regras existentes do .gitignore. Não presumir que um clone novo contém essas suítes. Credenciais de AWS, variáveis .env, bancos locais, prints autenticados e evidências de depuração não fazem parte deste envio.
