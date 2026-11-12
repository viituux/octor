# Fundo decorativo de tentáculo e Light/Dark Mode

## Entrega e arquivos de origem

Foram encontrados somente `tentaculo-light.png` e `tentaculo-dark.png` em Downloads. Ambos foram copiados sem alteração para `front/public/assets/img/bg/`, publicado pelo Angular em `/assets/img/bg/`.

Os SVGs citados no pedido não estavam na pasta informada e não foram anexados. Portanto a cópia dos quatro arquivos e a otimização SVG com SVGO ficam pendentes dos originais. Não foram criados SVGs artificiais, convertidos desenhos ou adicionadas URLs de arquivos inexistentes. A implementação funcional utiliza diretamente os PNGs fornecidos.

| Verificação | Resultado |
| --- | --- |
| Dimensões dos dois PNGs | 4128 x 2304, mesma proporção de 1376 x 768 |
| Cores | Traço preto no Light; traço branco no Dark |
| Fundo | RGBA com transparência real |
| Alinhamento | Canais alpha idênticos, pixel a pixel |
| Preservação | Hashes SHA-256 iguais aos originais, sem otimização destrutiva |
| Tamanho | Light: 527.709 bytes; Dark: 641.868 bytes |

## Arquivos criados ou alterados nesta entrega

Infraestrutura visual:

- `front/public/assets/img/bg/tentaculo-light.png`
- `front/public/assets/img/bg/tentaculo-dark.png`
- `front/src/appearance.css`
- `front/src/styles.css`
- `front/src/index.html`
- `front/src/app/app.component.ts`
- `front/src/app/components/shared/theme-toggle.component.ts`

Somente cores substituídas por variáveis nos estilos existentes, sem alterar medidas, conteúdo ou lógica:

- `front/src/app/components/guide-editor/guide-editor.component.css`
- `front/src/app/components/guide-editor/step-narration.component.ts` (estilos inline)
- `front/src/app/components/guide-list/guide-list.component.css`
- `front/src/app/components/login/account.component.css`
- `front/src/app/components/login/login.component.css`
- `front/src/app/components/manuals/manuals.component.css`
- `front/src/app/components/notifications/notification-bell.component.ts` (estilos inline)
- `front/src/app/components/notifications/notifications.component.css`
- `front/src/app/components/shared/app-dialog.component.css`
- `front/src/app/components/shared/app-release.component.ts` (estilos inline)
- `front/src/app/components/trainings/trainings.css`

Documentação: este arquivo. Nenhum arquivo do backend, extensão, desenho original ou configuração de build foi alterado por esta integração.

## HTML final no componente raiz

```html
<div class="bg-tentacle" aria-hidden="true"></div>
<router-outlet></router-outlet>
@if (!themeInHeader) {
  <app-theme-toggle></app-theme-toggle>
}
<app-dialog></app-dialog>
```

Estilo do host raiz:

```css
:host { display: block; isolation: isolate; }
```

## CSS do elemento e escolha da imagem

As regras abaixo estão em `front/src/appearance.css`, junto da paleta dos temas:

```css
:root {
  --bg-tentacle: url('/assets/img/bg/tentaculo-light.png');
}

:root[data-theme="dark"] {
  --bg-tentacle: url('/assets/img/bg/tentaculo-dark.png');
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]) {
    --bg-tentacle: url('/assets/img/bg/tentaculo-dark.png');
  }
}

.bg-tentacle {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: var(--bg-tentacle);
  background-repeat: no-repeat;
  background-position: right -8% center;
  background-size: min(95vw, 1500px) auto;
  opacity: .10;
}

@media (max-width: 768px) {
  .bg-tentacle {
    background-size: 160vw auto;
    background-position: right -40% bottom 10%;
    opacity: .08;
  }
}

@media print {
  .bg-tentacle { display: none !important; }
}
```

## Tema automático e carregamento

O botão Modo claro/Modo escuro fica ao lado do menu no cabeçalho da biblioteca e permanece flutuante nas demais telas, acessível por teclado. A barra lateral é retrátil: no desktop salva o recolhimento; no celular abre como painel, fecha com Escape e mantém o foco dentro do menu enquanto aberto. Sem escolha salva, o site segue o sistema operacional. Ao clicar, a preferência é salva no navegador em `octor_theme` e aplicada por `data-theme="light"` ou `data-theme="dark"`. O head restaura essa escolha antes da renderização; a troca é sincronizada entre abas. O botão não aparece na impressão.

O script inline no head sincroniza `color-scheme` antes da renderização e acompanha mudanças do sistema ou do atributo. `meta color-scheme` e preload dos dois PNGs complementam a inicialização. Apenas a URL/cor muda entre temas: as regras de posição, dimensão e opacidade são as mesmas.

## Ajustes além do elemento decorativo

1. Cores fixas de componentes foram convertidas em variáveis de aparência, pois o projeto era claro e somente trocar a arte deixaria superfícies/textos incompatíveis no Dark Mode.
2. Superfícies gerais de página (`library`, `auth-shell`, `form-area`, `account-shell`, `editor-shell` e `paper`) ficam transparentes somente em tela. Cartões, formulários, campos, cabeçalhos e diálogos preservam suas superfícies para leitura.
3. O azul de ação no Light ficou mais escuro (`#0369a1`) e textos secundários usam `#526176`, mantendo contraste sobre a arte. Dark usa superfícies azul-marinho, texto claro e azul de ação `#38bdf8` com texto escuro.
4. A decoração é ocultada na impressão e as cores impressas retornam à paleta clara, inclusive quando o sistema está em Dark Mode.
5. A paleta fica em um arquivo web separado. O gerador compartilhado de tema e a aparência da extensão não foram modificados.

Não houve alteração de layout, navegação, textos de produto, medidas, ações, cadastro, API, treinamentos ou posição dos controles. A arte é estática; não foi reintroduzido um mascote animado.

## Verificações em navegador

SPA real com API e PostgreSQL temporários de testes; nenhuma conta ou registro real foi modificado.

| Largura | Light | Dark | Rolagem horizontal | Troca sem deslocar/redimensionar |
| --- | --- | --- | --- | --- |
| 1440 px | Correto | Correto | Ausente | Confirmado |
| 1024 px | Correto | Correto | Ausente | Confirmado |
| 768 px | Correto | Correto | Ausente | Confirmado |
| 390 px | Correto | Correto | Ausente | Confirmado |

Também foram verificados: apenas um elemento decorativo, `aria-hidden`, ausência de filhos, PNG correto carregado em cada tema, posição fixa durante rolagem, cliques em botões/formulários, seleção de texto e ocultação na impressão. Os dois assets foram pré-carregados; alternar o tema mantém a mesma geometria.

Na biblioteca, o menor contraste medido nas amostras visíveis foi 4,81:1 no Light e 5,85:1 no Dark. O cálculo considera o pior caso do traço preto/branco sob superfícies transparentes. As amostras atendem ao limiar AA usado para texto; essa medição e a revisão visual não constituem uma auditoria completa de conformidade WCAG de toda a aplicação.

Conta, Manual por URL, treinamentos, gestão, dashboard, notificações e login também foram verificados em desktop/mobile nos dois temas. Build Angular e os 42 testes de regressão do frontend passaram.

## Executar

Em `front/`, use `npm start` para desenvolvimento ou `npm run build` para produção local. Atualize a página e use o botão de tema ao lado do menu na biblioteca para alternar. A escolha fica salva neste navegador. Não é necessário alterar a extensão ou o banco de dados.
