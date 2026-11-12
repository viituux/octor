# Google Cloud — preparação do ambiente de testes OCTOR

## Situação

O objetivo é testar a aplicação hospedada, buscando permanecer nas franquias gratuitas. O usuário informou que ainda não tem projeto Google Cloud nem domínio. Nenhuma VM, conta de faturamento ou serviço foi criado, e nenhuma aplicação foi publicada durante esta preparação.

Este é um plano de implantação, não um pacote de deploy já validado. A configuração pública, as credenciais e o acesso à conta Google ainda precisam ser definidos.

## Limites e custos a conferir antes de criar a VM

Segundo o [Free Tier do Google Cloud](https://docs.cloud.google.com/free/docs/free-cloud-features), o Compute Engine oferece uso mensal equivalente a uma VM não preemptiva `e2-micro` nas regiões `us-west1`, `us-central1` ou `us-east1`, com 30 GB-mês de disco persistente **padrão** e franquia de 1 GB/mês de saída de dados nas condições documentadas. A região de São Paulo não está nessa franquia de VM. O limite é compartilhado conforme as regras da conta; não criar várias VMs supondo que cada uma tenha uma franquia independente.

**VM elegível não significa hospedagem pública integralmente gratuita.** A tabela de [preços de rede/IPv4](https://cloud.google.com/vpc/pricing) cobra US$ 0,005/h por IPv4 externo em uso em uma VM padrão. Isso equivale a aproximadamente US$ 3,65 em 730 horas, antes de câmbio, tributos e outros itens. Disco de outro tipo, tráfego excedente, snapshots, serviços gerenciados e chamadas de IA podem gerar custos separados.

Novas contas elegíveis podem ter [US$ 300 em créditos por 90 dias de avaliação](https://cloud.google.com/signup-faqs). A avaliação é temporária e não garante hospedagem gratuita permanente. Não converter a conta para modalidade paga nem ativar novos serviços supondo que os créditos nunca acabem.

[Alertas de orçamento](https://docs.cloud.google.com/billing/docs/how-to/budgets) do tipo alerts-only avisam, mas não bloqueiam automaticamente gastos. O plano não deve depender desses alertas como um limite rígido de cobrança.

## Primeiro passo do usuário

1. Entrar no [Console Google Cloud](https://console.cloud.google.com/) com sua conta.
2. Criar um projeto chamado **OCTOR-Testes**. O nome de exibição e o ID são campos diferentes; anotar o ID público gerado pelo Google.
3. Se for necessário ativar a avaliação/faturamento, ler as condições apresentadas à própria conta antes de confirmar. Dados de pagamento devem ser preenchidos apenas no Google.
4. Compartilhar na conversa somente o **ID do projeto**, nunca senha, cartão, chave privada, token ou arquivo de service account.
5. Aguardar a definição/revisão da configuração e da estimativa antes de criar uma máquina ou habilitar recursos com cobrança.

Não é necessário comprar domínio para criar o projeto ou preparar testes privados. Um acesso público estável, com HTTPS e login Google, terá sua forma de endereço definida na etapa de publicação. O client ID OAuth do login é uma configuração separada da hospedagem.

## Configuração inicial proposta para revisão

- Uma `e2-micro`, em uma das regiões elegíveis, sem GPU e sem balanceador.
- Disco persistente padrão de até 30 GB no total elegível.
- Frontend compilado fora da VM: 1 GiB de memória torna inadequado presumir que todo build Angular caberá junto aos processos da aplicação.
- Backend com servidor WSGI e quantidade reduzida de processos; parâmetros finais precisam ser testados.
- PostgreSQL e mídia persistente para este piloto pequeno, com dados fictícios e backup separado. Dimensionar a instância e revisar os custos antes de hospedar. Não migrar o banco pessoal automaticamente para a nuvem.
- Sem Cloud SQL, Kubernetes, Redis gerenciado ou worker de vídeo na configuração mínima. O vídeo atual é simulado; não é parte necessária deste piloto.
- IA e Google login só quando suas configurações forem fornecidas e verificadas. Custos de IA não estão automaticamente cobertos pela franquia de VM.
- Priorizar primeiro acesso privado de teste. Domínio, HTTPS e exposição pública devem ser definidos antes de transmitir credenciais reais a um endereço público.

## Adequações ainda necessárias

O código atual mantém URLs locais em serviços Angular, extensão e verificações de origem. Um endereço público exige ajustar essas referências em conjunto. DEBUG, hosts, CORS/CSRF, cookies, proxy HTTPS, acesso às mídias e serviço WSGI também precisam de configuração própria. O Compose atual inicia apenas PostgreSQL e Redis; não publica a aplicação.

A aplicação não deve ser descrita como pronta para deploy apenas porque seu build e seus testes locais passaram. Depois de confirmar o projeto e o modo de acesso, preparar a configuração, testar o pacote e revisar o custo antes de executar a criação dos recursos.

## Critérios para liberar o piloto

- Identidade e faturamento do projeto conferidos, com estimativa de todos os recursos.
- Configuração de acesso e HTTPS ou túnel privado definida.
- Cadastro/login, guias, capturas, voz, treinamentos e avaliações funcionando no ambiente escolhido.
- Dados pessoais e credenciais locais fora do pacote.
- Persistência e restauração de banco/mídias verificadas.
- Procedimento para desligar/remover os recursos e conferir cobranças residuais documentado.

Esta preparação não altera o comportamento do OCTOR nem publica novos arquivos no GitHub automaticamente.
