# Documentação do OCTOR

Base revisada em **6 de novembro de 2026**. Comece pela documentação consolidada para distinguir funcionalidades atuais de planos e registros históricos.

## Documentos principais

- [Documentação técnica consolidada](DOCUMENTACAO-TECNICA.md): arquitetura, stack, instalação, ambiente, entidades, API, fluxos, testes, operação e limitações.
- [Manual do usuário](MANUAL-DO-USUARIO.md): conta, extensão, gravação, voz, editor, Manual por URL, Me guie, equipes, treinamentos e PDF.
- [Frontend](../front/README.md), [backend](../back/README.md) e [extensão](../extensao/README.md): referências por módulo.
- [Stack e arquitetura](STACK.md): características e comparações das tecnologias.

Atualização funcional: [Quiz obrigatório e ranking](QUIZ-OBRIGATORIO.md), com preservação das versões antigas. O PDF anteriormente entregue é uma fotografia do estado anterior a esta atualização.

Consulte também [Versionamento e auditoria](VERSIONAMENTO-E-AUDITORIA.md) e [novidades do produto](CHANGELOG.md).

## Referências por funcionalidade

| Documento | Assunto |
| --- | --- |
| [Manual por URL](MANUAL-POR-URL.md) | Leitura de página, capturas privadas, Qwen/OpenRouter, revisão e limites |
| [PostgreSQL local](POSTGRESQL-LOCAL.md) | Banco obrigatório e conexão de desenvolvimento |
| [Membros e notificações](NOTIFICACOES-E-MEMBROS.md) | Busca, membros e avisos internos |
| [Conta](account-settings.md) | Perfil, senha e sessões |
| [Biblioteca e equipes](library-and-workspaces.md) | Organização, compartilhamentos e convites |
| [Treinamentos](trainings-feedback-quiz.md) | Treinamentos e feedback; nome de arquivo histórico, complementado pelo documento do quiz obrigatório |
| [Diálogos](DIALOGOS.md) | Componentes de confirmação e mensagens |
| [Design system](design-system.md) | Tokens e tema compartilhado |

## Planos e registros históricos

[Reorganização](REORGANIZACAO-ETAPA-1.md), [comentários](COMENTARIOS-ETAPA-2.md), [identidade visual anterior](ocean-pixel-identity.md) e [plano Google Cloud](GOOGLE-CLOUD-TESTES.md) registram decisões/etapas específicas. Sua presença não significa que mascote, hospedagem, recursos planejados estejam ativos. O diretório `entregas/` contém artefatos de entregas anteriores.

## Como manter a documentação

Ao modificar uma funcionalidade, atualize seu documento específico, o resumo técnico e os exemplos necessários. Separe comportamento implementado de possibilidade futura, confirme nomes de rotas e variáveis nos fontes e nunca copie segredos ou dados reais para os documentos. Comandos devem informar a pasta de execução. Testes simulados e testes reais devem ser identificados separadamente.
