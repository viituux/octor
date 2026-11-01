# Configuração Django carregada do ambiente local: aplicações, banco, autenticação, permissões de origem e provedores de IA.
# Dependência: datas e intervalos usados por expiração e filtros.
from datetime import timedelta
# Dependência: composição de caminhos de arquivos independente de concatenação manual.
from pathlib import Path
# Dependência: leitura de variáveis e configuração do processo.
import os
# Dependência: carregamento do arquivo local de variáveis sem embutir chaves no código.
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# str: segredo de assinatura obtido do ambiente; o fallback existente é de desenvolvimento.
SECRET_KEY = os.getenv("SECRET_KEY", "django-insecure-autoguide-default-key")
# bool: habilita o modo de desenvolvimento conforme a variável de ambiente.
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1")
# list[str]: hosts aceitos pelo Django conforme a configuração atual.
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")

# list[str]: aplicações registradas para modelos, rotas e tarefas.
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Aplicações de terceiros integradas ao Django.
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    # Aplicações próprias do projeto.
    "accounts",
    "guides",
    "trainings",
    "videos",
    "ai",
]

# list[str]: ordem de processamento das requisições e respostas Django.
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# PostgreSQL é selecionado pelo ambiente; SQLite mantém a execução local quando essa configuração não existe.
DB_ENGINE = os.getenv("DB_ENGINE", "sqlite3")
if DB_ENGINE == "postgresql":
    # dict: conexão selecionada entre PostgreSQL configurado e SQLite local.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "autoguide_db"),
            "USER": os.getenv("DB_USER", "autoguide_user"),
            "PASSWORD": os.getenv("DB_PASSWORD", "autoguide_password"),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
        }
    }
else:
    # dict: conexão selecionada entre PostgreSQL configurado e SQLite local.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
# Path: diretório persistente de capturas, voz e outros arquivos enviados ao backend.
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS settings (Angular & Chrome Extension support)
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^chrome-extension://.*$",
    r"^http://localhost:[0-9]+$",
    r"^http://127.0.0.1:[0-9]+$",
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "authorization",
    "content-type",
    "x-requested-with",
    "accept",
    "origin",
    "user-agent",
]

# REST Framework
# dict: autenticação, permissões e limites padrão da API.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.AccountJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

# Prazos e comportamento dos tokens JWT de acesso e renovação.
# dict: prazos e comportamento de emissão/renovação dos JWTs.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=7),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Transporte e serialização JSON das tarefas Celery; o worker é um processo separado.
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

# Suporte para envio de múltiplos screenshots em base64 (50 MB)
# int: limite de bytes do corpo recebido, incluindo a sobrecarga das imagens codificadas em base64.
DATA_UPLOAD_MAX_MEMORY_SIZE = 52428800
FILE_UPLOAD_MAX_MEMORY_SIZE = 52428800
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000


# Identificador público OAuth Web do Google; o fluxo atual valida ID token sem Client Secret.
# str: identificação pública do cliente Google configurado para esta aplicação.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"auth": "30/min"}

# Credenciais de IA pertencem ao ambiente do servidor; as APIs da conta não as devolvem.
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'gemini').strip()
# str: credencial lida somente no servidor; não pertence às preferências retornadas ao cliente.
LLM_API_KEY = os.getenv('LLM_API_KEY', os.getenv('GEMINI_API_KEY', '')).strip()
LLM_MODEL = os.getenv('LLM_MODEL', '').strip()
