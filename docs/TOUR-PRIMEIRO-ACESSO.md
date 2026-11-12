# Mini tour de primeiro acesso

## Experiência

Ao abrir a biblioteca pela primeira vez, uma conta nova recebe uma apresentação de seis etapas: boas-vindas, menu retrátil, criação de guia, Manual por URL, treinamentos e tema claro/escuro. O tour destaca o controle correspondente e permite começar, avançar, voltar, pular ou concluir.

O tour é somente uma apresentação. Não cria guias, não inicia treinamentos, não grava ações e não faz requisições de IA. A interface fica inerte enquanto o diálogo está aberto; o usuário controla o avanço. No celular, o menu abre temporariamente para mostrar seus itens e retorna ao estado anterior quando a apresentação termina. A preferência persistida de recolhimento não é alterada pelo tour.

**Rever:** abra o menu lateral e use **Ver tour do OCTOR**, abaixo de Como capturar. Contas que já existiam na implantação não são interrompidas automaticamente, mas também podem rever a apresentação por esse botão.

## Persistência

O estado fica em `UserSettings`:

- `onboarding_status`: `pending` para novas contas, `completed` ao concluir, `skipped` ao pular e `legacy` para configurações anteriores à entrega.
- `onboarding_finished_at`: horário do servidor ao concluir ou pular. Contas legadas não recebem uma data de conclusão inventada.

Reenvios idênticos preservam a data. Rever e pular não desfaz uma conclusão já registrada. Uma conta que pulou pode rever e concluir posteriormente. Alterar o perfil não sobrescreve esse estado.

Se houver falha ao salvar, o diálogo fecha, informa a limitação e registra o encerramento localmente com uma chave por usuário. Isso evita repetir o tour naquele navegador, mas não substitui a sincronização com o servidor: em outro navegador a apresentação pode reaparecer enquanto a conta continuar pendente. Falhas de consulta não bloqueiam a biblioteca; o botão manual continua disponível.

## API e migração

`GET /api/auth/onboarding/` devolve `user_id`, `status` e `finished_at`. `POST` no mesmo endereço aceita somente `{"status":"completed"}` ou `{"status":"skipped"}`. Exige JWT, opera exclusivamente sobre a conta autenticada e não aceita IDs ou horários enviados pelo cliente. Respostas não ficam em cache público.

Migração: `accounts.0005_usersettings_onboarding_finished_at_and_more`. Configurações existentes são marcadas `legacy`; novas configurações usam `pending`. A API antiga de settings/credenciais não foi ampliada para permitir chaves no frontend.

## Arquivos

- `back/accounts/models.py`, `onboarding.py`, `urls.py`, `test_onboarding.py` e a migration `0005`.
- `front/src/app/components/shared/onboarding-tour.component.ts` e `.css`.
- Componente, template e CSS da biblioteca, com âncoras estáveis para os controles e botão de repetição.
- Stub de metadados Angular em `front/tests/dialogs.test.cjs`, para manter as regressões existentes do controlador de confirmação.

O diálogo nativo possui identificação acessível, foco contido, cancelamento por Escape e restauração de foco. O posicionamento considera o viewport e acompanha redimensionamento/rolagem, com limpeza de listeners e frames ao encerrar ou destruir o componente. Se um alvo não estiver visível, o cartão usa uma posição central segura. Não há biblioteca externa ou mascote novo.

## Executar e verificar

Na raiz:

```powershell
back/venv/Scripts/python.exe back/manage.py migrate
back/venv/Scripts/python.exe back/manage.py test accounts.test_onboarding --noinput
node --test front/tests/*.test.cjs
```

Em `front/`, execute `npm run build` ou use o servidor de desenvolvimento. Atualize a página. Para testar o início automático, cadastre uma conta nova; para a conta atual, use **Ver tour do OCTOR**.

Foram verificados no navegador servido em localhost, com API real e banco temporário: todas as etapas, Voltar, conclusão, repetição, pular por Escape, persistência por conta, isolamento entre usuários, falha de rede, foco modal, ausência de ações de negócio e posicionamento no celular em Dark Mode.
