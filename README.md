# ⚡ Octo - Plataforma de Tutoriais e Procedimentos com Vídeo & IA

Inspirado no **Tango / Scribe**, o **Octo** grava ações no navegador (cliques, inputs, navegação) e transforma em procedimentos passo a passo com capturas de tela anotadas, descrições geradas por IA e, opcionalmente, vídeos narrados com legendas e avatar.

---

## 🏗️ Arquitetura do Projeto

```text
octo/
├── backend/                # Django REST Framework + Celery
│   ├── accounts/           # Autenticação JWT e usuários
│   ├── guides/             # Guias, Passos (screenshots e hotspots de clique)
│   ├── videos/             # VideoJobs e pipeline assíncrono
│   ├── ai/                 # Tarefas de geração textual automática
│   ├── config/             # Configurações Django, URLs e Celery
│   ├── requirements.txt
│   └── manage.py
├── extension/              # Extensão Chrome Manifest V3
│   ├── manifest.json       # Permissões MV3 (activeTab, tabs, storage)
│   ├── background.js       # Captura de tela (captureVisibleTab) e API
│   ├── content.js          # Captura de cliques, seletores CSS e inputs
│   ├── popup.html          # Interface de gravação
│   └── popup.js            # Controles Gravar, Pausar, Finalizar e Login
├── frontend/               # Single Page Application em Angular 19+
│   ├── src/app/components/ # Login, Lista de Guias e Editor de Procedimentos
│   └── src/app/services/   # AuthService e GuideService
└── docker-compose.yml      # PostgreSQL e Redis
```

---

## 🚀 Como Executar

Repositório: https://github.com/viituux/octo

Em uma instalação nova, execute `pip install -r requirements.txt` dentro do ambiente virtual do backend e copie `backend/.env.example` para `backend/.env`, configurando suas chaves apenas localmente.

Dependências, bancos locais, capturas, credenciais e builds são ignorados pelo Git. A pasta física de instalações existentes pode continuar chamada `autoguide`; os comandos devem ser executados a partir da pasta onde o projeto foi clonado.



### 1. Backend (Django REST Framework)

```powershell
cd backend
.\venv\Scripts\Activate.ps1   # ou crie com: python -m venv venv && pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

Crie seu administrador local com `python manage.py createsuperuser`.

Para rodar o Celery Worker (quando o Redis estiver ativo):
```powershell
celery -A config worker --loglevel=info -P solo
```

---

### 2. Extensão do Google Chrome (MV3)

1. Abra o Google Chrome e acesse `chrome://extensions/`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (Load unpacked).
4. Selecione a pasta `octo/extension`.
5. Fixe a extensão na barra do navegador.
6. Clique no ícone do Octo:
   - Faça login com a conta que você criou.
   - Digite o título do guia e clique em **"🔴 Iniciar Gravação"**.
   - Navegue por qualquer página clicando nos elementos desejados.
   - Clique no ícone da extensão e depois em **"✅ Finalizar"**. O guia será salvo na API e o editor abrirá automaticamente!

---

### 3. Frontend (Editor Angular)

```powershell
cd frontend
npm ci
npm start
```
Acesse `http://localhost:4200` no seu navegador.

## Modo Me guie (primeira versão)

1. Inicie o backend e o frontend conforme as instruções acima.
2. Em `chrome://extensions`, recarregue a extensão Octo (ou carregue a pasta `extension`).
3. Recarregue o editor em `http://localhost:4200` ou `http://127.0.0.1:4200` para instalar a comunicação com a extensão.
4. Abra um guia com passos que tenham URL e seletor, e clique em **Me guie**.
5. Uma nova aba abre o site do primeiro passo. Faça login no site, se necessário.
6. Execute a ação indicada e use **Próximo / Pular**. O tutorial não clica nem preenche campos automaticamente.
7. Use **Voltar**, **Tentar novamente**, **Abrir página** ou **Encerrar** conforme necessário. No último passo, clique em **Concluir**.

O progresso fica salvo na extensão e vinculado à aba do tutorial. Recarregar ou navegar nessa aba mantém a sessão. Fechar a aba encerra a sessão. Apenas um tutorial pode ficar ativo por vez; finalize gravações antes de iniciar.

O painel usa Shadow DOM, acompanha rolagem/redimensionamento e procura novamente elementos renderizados depois. Se o seletor não encontrar um elemento, o painel informa a falha e permite tentar novamente ou pular. Esta versão procura elementos no documento principal; iframes, Shadow DOM dos sites e páginas internas do Chrome não são suportados. Seletores antigos podem precisar de uma nova gravação se o site mudou. O botão do editor está limitado aos dois endereços locais acima.

Testes de regressão (na raiz do projeto):

```powershell
node --test extension/tests/recorder.test.cjs extension/tests/playback.test.cjs
```

### Correção de localização e destaque

A extensão agora grava o botão/link pai ao clicar em ícones, gera seletores únicos (incluindo a posição do primeiro irmão) e guarda identificação por rótulo, tag e atributos. A reprodução usa o seletor e tenta localizar por identificação quando ele mudou, ignorando elementos ocultos. Se houver mais de um alvo equivalente, pede intervenção em vez de destacar um alvo arbitrário.

O destaque acompanha alterações de layout durante a reprodução, tenta rolar até elementos que aparecem depois e usa a camada superior do navegador quando disponível para evitar deslocamentos por transformações CSS da página. Recarregue a extensão e as páginas abertas. Guias antigos usam o texto já salvo como alternativa; para capturar toda a identificação nova, grave novamente os passos problemáticos.

```powershell
node --test extension/tests/targets.test.cjs extension/tests/playback.test.cjs extension/tests/recorder.test.cjs
```

### Confiabilidade das imagens gravadas

A gravação tenta preparar a imagem no `pointerdown`, sem bloquear a ação do usuário. Cada tentativa compara o documento, interação, URL, alterações do DOM, rolagem, tamanho da janela e posição do alvo antes e depois da captura. Tentativas antigas, mudanças de página/aba e imagens fora do orçamento de captura são rejeitadas; o passo é preservado sem imagem e o editor informa a necessidade de revisão. O limite local usa um intervalo mínimo de 550 ms entre chamadas de captura. Não há garantia de imagem para todos os cliques rápidos. Alterações puramente visuais (por exemplo, animações sem mutação do DOM) ainda podem escapar da validação. Não há mascaramento automático de dados sensíveis nas imagens.

Recarregue a extensão e as páginas abertas antes de gravar um guia novo. Os guias existentes não têm suas imagens corrigidas automaticamente.


## Narração por passo

No editor, selecione um passo e use **Narração deste passo > Gravar voz**. Autorize o microfone, fale e clique em **Parar**. Ouça a prévia e use **Salvar áudio** para persistir. É possível regravar, descartar a prévia ou excluir o áudio salvo. O limite é de 2 minutos de gravação e 15 MB por arquivo. Mudar de passo encerra a gravação e descarta a prévia não salva.

O campo de narração é criado pela migração `guides.0003_step_narration` (`python manage.py migrate`). O áudio é salvo no backend em `media/narrations/`. Esta versão não inclui transcrição, narração durante a captura, reprodução no Me guie ou montagem de vídeo.

Testes: `node --test frontend/tests/narration.test.cjs` e `python manage.py test guides.test_narration`.


## Narrar enquanto captura

1. Recarregue a extensão em chrome://extensions e a página do site.
2. No popup, marque **Gravar com microfone** e clique em **Iniciar Gravação**.
3. A aba auxiliar solicita acesso ao microfone quando você clica em **Ativar microfone e começar**. Ela retorna ao site após iniciar. Mantenha a aba auxiliar aberta.
4. Fale enquanto executa o procedimento. A pausa da extensão pausa também o áudio.
5. Clique em **Finalizar** no popup para salvar os passos e enviar o áudio. Limite: 30 minutos/60 MB.
6. No editor, a seção **Narração deste passo** permite ouvir e ajustar o início/fim em segundos e salvar o trecho.

A associação inicial usa os momentos dos cliques: cada passo recebe o intervalo desde o clique anterior; o primeiro começa no início do áudio e o último termina no fim da gravação. É uma sugestão temporal, sem reconhecimento semântico ou transcrição. O áudio integral fica salvo uma vez no guia; os passos guardam os intervalos editáveis. Uma narração individual gravada depois tem prioridade sobre o trecho da captura.

Se o envio falhar, tente finalizar novamente mantendo a aba auxiliar aberta. Os passos já enviados não são reenviados. **Finalizar sem narração** permite salvar somente o guia. Fechar a aba auxiliar antes do envio perde o áudio que estava na memória, mas preserva os passos. A atualização exige a migração guides.0004_guide_capture_audio. Não inclui exportação de vídeo nem voz no Me guie.


## Painel lateral fixo

O ícone do Octo agora abre o painel lateral nativo do navegador, com login, título, captura, pausa, finalização e opção de microfone. O painel continua aberto ao clicar no site e navegar entre páginas. Ele pode ser fechado pelo botão do próprio navegador. Após atualizar os arquivos, recarregue a extensão em chrome://extensions e clique no ícone novamente. Requer Chrome 116 ou superior. A posição esquerda/direita é controlada pelas preferências do navegador. Não foi adicionada uma lista de tutoriais por site.


## Editor em documento e apresentação do Me guie

O editor mostra todos os passos em sequência, com navegação lateral, edição do texto no próprio cartão e controle de enquadramento. Capturas com metadados de posição recebem destaque retangular e zoom inicial de 2x centrado no elemento. Use −/+ ou Tela inteira para ajustar; o zoom é salvo no passo. Capturas antigas usam a proporção real da imagem; passos sem posição do elemento mantêm a visualização inteira ou o marcador de clique disponível. A narração permanece no passo selecionado.

No Me guie, o elemento recebe um contorno e o restante da página fica escurecido. O painel tenta se posicionar ao lado do alvo e mostra progresso. O avanço continua manual, com Próximo/Pular e Concluir. Em telas com pouco espaço, o painel é limitado à área visível. Recarregue o editor, a extensão e as páginas para usar as alterações.


## Contas de usuários e acesso com Google

- Login: http://localhost:4200/login
- Cadastro: http://localhost:4200/register (nome, usuário, e-mail e senha). O cadastro já inicia a sessão.
- Minha conta: http://localhost:4200/account, disponível após entrar.
- Cada usuário vê seus próprios guias. Para gravar pela extensão, entre nela com usuário/senha ou use **Entrar pelo navegador / Google**, faça login e clique em **Conectar esta conta à extensão**. Trocar de conta requer finalizar a gravação/tutorial atual.

### Configurar Google posteriormente

1. No Google Cloud Console, configure o consentimento OAuth e crie um Client ID do tipo **Aplicativo da Web**.
2. Cadastre as origens JavaScript http://localhost:4200 e http://127.0.0.1:4200. Quando hospedar o app, acrescente a origem HTTPS correspondente.
3. Instale as dependências do backend: `venv\Scripts\python.exe -m pip install -r requirements.txt`.
4. Acrescente ao arquivo `backend/.env` a linha `GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com`. Há um exemplo em `backend/.env.google.example`. Não é necessário Client Secret neste fluxo.
5. Reinicie o Django e recarregue a página. O botão oficial Google aparecerá quando a configuração estiver ativa.

O login valida o ID token no backend com google-auth e vincula pela identificação Google (sub), com uma tentativa de uso único e nonce. Contas locais com e-mail igual não são unidas automaticamente: entre com a senha e vincule o Google em Minha conta. O login Google ainda precisa ser validado com credenciais reais após a configuração. Esta entrega não inclui recuperação de senha por e-mail.

Migração: `python manage.py migrate`. Testes: `python manage.py test accounts guides.test_narration`.


## Padrão visual

As telas web, configurações, narração, barra lateral e página do microfone usam o tema claro/roxo compartilhado. As cores e medidas-base ficam em `design-tokens.json`. Após alterar esse arquivo, execute `node scripts/build-theme.cjs`. Consulte `docs/design-system.md`.

## Confiabilidade das capturas

A captura de cliques rápidos respeita a frequência máxima do Chrome por meio de uma fila (intervalo mínimo de 550 ms), com janela de até 5 segundos para ações pendentes. A validação usa o documento, URL, posição da página e o estado/posição do elemento original de cada ação. Alterações de DOM sem relação com esse elemento não descartam a imagem. Falhas de preparação podem ser tentadas novamente no contexto da ação. Troca de aba, navegação, controles encobertos, movidos ou alterados continuam impedindo uma captura incompatível; o passo é preservado com aviso.

Após atualizar a extensão, recarregue-a em chrome://extensions e atualize a página que será gravada. Imagens ausentes em gravações antigas não podem ser reconstruídas pelo capturador.

## Geração do guia inteiro e narração

O botão Gerar todas as instruções processa as capturas sequencialmente, com progresso e aviso antes de substituir textos. Sucessos são salvos por passo; falhas mantêm o texto anterior. O botão Gerar instrução deste passo continua disponível.

Ao finalizar uma captura com microfone, a extensão abre o editor com o sinal de geração automática. O editor transcreve a gravação, associa a fala aos intervalos de cada passo e gera as instruções usando a fala, a captura e a ação. O processamento ocorre após finalizar a captura, não durante a fala. Ao salvar uma narração individual ou alterar seu intervalo, o passo também é regenerado. O usuário deve revisar os resultados.

A transcrição usa o Gemini configurado no servidor e aceita áudio inline de até 14 MB. Arquivos maiores permanecem salvos, mas a geração pela voz informa o limite e preserva os textos. As transcrições são reutilizadas enquanto arquivo e intervalos não mudarem. Falhas não removem áudio ou instruções. A API /api/guides/{id}/prepare-narration/ requer autenticação e propriedade do guia. Referência: https://ai.google.dev/gemini-api/docs/generate-content/audio


## Treinamentos, quiz e avaliações

O módulo inclui participação, quiz de cinco perguntas, avaliação com estrelas e comentário, administração e dashboard. Acesse **Meus treinamentos** na biblioteca. Guia de instalação, contas de demonstração, endpoints e roteiro de testes: [docs/trainings-feedback-quiz.md](docs/trainings-feedback-quiz.md).
