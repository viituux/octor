# Inicialização do Celery a partir das configurações Django e descoberta das tarefas dos aplicativos instalados.
# Dependência: leitura de variáveis e configuração do processo.
import os
# Dependência: registro e execução das tarefas assíncronas.
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("octor")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
