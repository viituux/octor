# Configuração Django carregada do ambiente local: aplicações, banco, autenticação, permissões de origem e provedores de IA.
# Dependência: datas e intervalos usados por expiração e filtros.
from datetime import timedelta
# Dependência: composição de caminhos de arquivos independente de concatenação manual.
from pathlib import Path
# Dependência: leitura de variáveis e configuração do processo.
import os
from django.core.exceptions import ImproperlyConfigured
# Dependência: carregamento do arquivo local de variáveis sem embutir chaves no código.
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def env_list(name, default=""):
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]


def production_key(name):
    value = os.getenv(name, "").strip()
    if len(value) < 50 or len(set(value)) < 5 or value.lower().startswith(("django-insecure-", "replace-")):
        raise ImproperlyConfigured(f"Configure {name} com um segredo forte antes de iniciar a produção.")
    return value


DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1")
if DEBUG:
    SECRET_KEY = os.getenv("SECRET_KEY", "django-insecure-autoguide-default-key")
    JWT_SIGNING_KEY = SECRET_KEY
    ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
else:
    SECRET_KEY = production_key("SECRET_KEY")
    JWT_SIGNING_KEY = production_key("JWT_SIGNING_KEY")
    if JWT_SIGNING_KEY == SECRET_KEY:
        raise ImproperlyConfigured("JWT_SIGNING_KEY e SECRET_KEY precisam ser diferentes.")
    ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
    if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("Defina ALLOWED_HOSTS explicitamente em produção.")

    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Ative apenas se o proxy remover cabeçalhos encaminhados enviados pelo cliente.
    if os.getenv("TRUST_HTTPS_PROXY", "").lower() in ("true", "1"):
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


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
    "rest_framework_simplejwt.token_blacklist",
    # Aplicações próprias do projeto.
    "accounts",
    "guides",
    "trainings",
    "videos",
    "ai",
    "manuals",
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

# PostgreSQL é o único banco da aplicação; credenciais permanecem no ambiente.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "octor_db"),
        "USER": os.getenv("DB_USER", "octor_user"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
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
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^chrome-extension://.*$",
    r"^http://localhost:[0-9]+$",
    r"^http://127.0.0.1:[0-9]+$",
] if DEBUG else []
CORS_ALLOW_CREDENTIALS = DEBUG
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
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
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

SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "suporte@octor.app.br").strip()
EMAIL_HOST = os.getenv("EMAIL_HOST", "").strip()
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "").lower() in ("true", "1")
EMAIL_USE_TLS = not EMAIL_USE_SSL and os.getenv("EMAIL_USE_TLS", "true").lower() in ("true", "1")
EMAIL_TIMEOUT = 5
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER).strip()
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"auth": "30/min"}

# Credenciais de IA pertencem ao ambiente do servidor; as APIs da conta não as devolvem.
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'gemini').strip()
# str: credencial lida somente no servidor; não pertence às preferências retornadas ao cliente.
LLM_API_KEY = os.getenv('LLM_API_KEY', os.getenv('GEMINI_API_KEY', '')).strip()
LLM_MODEL = os.getenv('LLM_MODEL', '').strip()

# Configuração independente: somente o Manual por URL usa este provedor.
# Sem override, preserva a integração Gemini existente.


# Chaves próprias são cifradas com uma chave Fernet exclusiva do servidor.
OCTOR_AI_ENCRYPTION_KEY = os.getenv("OCTOR_AI_ENCRYPTION_KEY", "")
GEMINI_TTS_API_KEY = os.getenv("GEMINI_TTS_API_KEY", "")
GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
GEMINI_TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Kore")

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite').strip()
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '').strip()
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini').strip()

PENDENCIA_TTL_HORAS = int(os.getenv('PENDENCIA_TTL_HORAS', '24'))

# Controles de consumo: políticas/preços são administrados no banco, não no navegador.
AI_CIRCUIT_FAILURES = int(os.getenv('AI_CIRCUIT_FAILURES', '3'))
AI_CIRCUIT_SECONDS = int(os.getenv('AI_CIRCUIT_SECONDS', '60'))
AI_CONNECT_RETRY_SECONDS = float(os.getenv('AI_CONNECT_RETRY_SECONDS', '0.5'))
AI_SPEECH_MAX_OUTPUT_TOKENS = int(os.getenv('AI_SPEECH_MAX_OUTPUT_TOKENS', '8192'))
