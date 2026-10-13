# ⚡ AutoGuide - Plataforma de Tutoriais e Procedimentos com Vídeo & IA

Inspirado no **Tango / Scribe**, o **AutoGuide** grava ações no navegador (cliques, inputs, navegação) e transforma em procedimentos passo a passo com capturas de tela anotadas, descrições geradas por IA e, opcionalmente, vídeos narrados com legendas e avatar.

---

## 🏗️ Arquitetura do Projeto

```text
autoguide/
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

### 1. Backend (Django REST Framework)

```powershell
cd backend
.\venv\Scripts\Activate.ps1   # ou crie com: python -m venv venv && pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

> **Credenciais iniciais pré-criadas:**
> - Usuário: `admin`
> - Senha: `admin123`

Para rodar o Celery Worker (quando o Redis estiver ativo):
```powershell
celery -A config worker --loglevel=info -P solo
```

---

### 2. Extensão do Google Chrome (MV3)

1. Abra o Google Chrome e acesse `chrome://extensions/`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (Load unpacked).
4. Selecione a pasta `autoguide/extension`.
5. Fixe a extensão na barra do navegador.
6. Clique no ícone do AutoGuide:
   - Faça login com `admin` / `admin123`.
   - Digite o título do guia e clique em **"🔴 Iniciar Gravação"**.
   - Navegue por qualquer página clicando nos elementos desejados.
   - Clique no ícone da extensão e depois em **"✅ Finalizar"**. O guia será salvo na API e o editor abrirá automaticamente!

---

### 3. Frontend (Editor Angular)

```powershell
cd frontend
npm start
```
Acesse `http://localhost:4200` no seu navegador.
