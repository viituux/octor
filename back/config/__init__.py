# Exporta a aplicação Celery para sua inicialização junto ao pacote de configuração.
# Dependência: contratos e funções do módulo .celery reutilizados neste fluxo.
from .celery import app as celery_app

__all__ = ("celery_app",)
