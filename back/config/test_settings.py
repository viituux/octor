import os

os.environ.setdefault("DEBUG", "true")

from .settings import *  # noqa: F401,F403,E402

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
# As migrações de auditoria de treinamentos usam funções específicas do PostgreSQL.
MIGRATION_MODULES = {"trainings": None}
