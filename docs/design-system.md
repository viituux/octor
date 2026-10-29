# Padrão visual do Octo

O produto usa superfícies claras, roxo como ação principal, texto escuro e mensagens semânticas: verde para sucesso, vermelho para erro e âmbar para pausa/atenção. O contorno laranja identifica o elemento nas capturas.

## Fonte compartilhada

Edite `design-tokens.json` e execute `node scripts/build-theme.cjs` na raiz. O script gera `frontend/src/theme.css`, `extension/theme.css` e `extension/theme.js`. Não edite esses arquivos gerados diretamente. A página web importa o tema por `frontend/src/styles.css`; a extensão importa o CSS e o Me guie recebe as variáveis no Shadow DOM.

## Controles

- Ações primárias: roxo com texto branco.
- Ações secundárias: superfície branca e borda suave.
- Ações destrutivas: texto vermelho e identificação explícita.
- Campos: borda suave, rótulo visível e foco roxo.
- Botões desabilitados: opacidade reduzida e sem indicação de clique.
- Cartões: borda, cantos de 12–18px e sombra discreta.
- Formulários e controles: cantos de 8px.
- Mensagens: informações e erros em texto, além da cor.

Use `ui-button`, `ui-button primary`, `ui-alert`, `ui-alert error` e `ui-alert success` nas telas web. Os controles da extensão usam as mesmas variáveis. Mantenha o comportamento de foco visível, navegação por teclado e adaptação a telas pequenas.
