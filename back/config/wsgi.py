# Ponto de entrada WSGI para servidores que hospedam a aplicação Django.
# Dependência: leitura de variáveis e configuração do processo.
import os
# Dependência: exceções, validações, cache ou utilitários de comandos do Django.
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
