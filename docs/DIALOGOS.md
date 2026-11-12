# Diálogos do OCTOR

Os alertas e confirmações nativos foram substituídos por diálogos no padrão visual do projeto.

## Aplicação Angular

- `front/src/app/services/dialog.service.ts`: `confirm(message, options)` retorna uma Promise booleana; `alert(message, title)` apresenta um aviso com ação única.
- `front/src/app/components/shared/app-dialog.component.*`: host único no componente raiz, com HTML dialog modal, fundo inerte, título/descrição acessíveis, foco inicial em Cancelar, Tab/Shift+Tab contidos e restauração do foco.
- Cancelar, Esc, fechar ou clicar fora retornam false. A troca de rota cancela pedidos pendentes. Apenas um diálogo pode ficar ativo; pedidos repetidos são recusados e não autorizam outra operação.
- Rótulos das ações são explícitos; operações destrutivas usam botão vermelho. Mensagens são texto, sem renderização de HTML.

Fluxos cobertos: adicionar/remover membro, mover/excluir guia, excluir passo, gerar todas as instruções, arquivar treinamento e aviso de processamento concluído.

Uso:

```typescript
if (await this.dialogs.confirm('Excluir este item?', {
  title: 'Excluir item', confirmText: 'Excluir', danger: true
})) {
  // Executar a operação somente após a confirmação.
}
```

## Extensão

`extensao/dialogs.js` fornece `OctorDialogs.confirm`, carregado antes de popup.js. O diálogo de finalizar sem narração usa a mesma interação, foco e cores. O painel lateral existente continua sendo a interface de captura.

## Validação

- `node --test tests/*.test.cjs` em front: 26 testes aprovados, incluindo cancelamento, navegação, cliques repetidos e proteção das chamadas de API em todos os fluxos de confirmação web.
- Build de produção Angular aprovado.
- Navegador com API Django/PostgreSQL descartável: adição de membro somente após confirmar; Cancelar/Esc não alteram dados; Tab/Shift+Tab permanecem no diálogo; foco restaurado; layout móvel validado.
- Diálogo da extensão verificado no navegador, incluindo duplicidade, confirmação e cancelamento, além de checagem sintática dos scripts.

Para visualizar, atualize o site e recarregue a extensão em chrome://extensions.
