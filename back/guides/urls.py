# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path, include
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.routers import DefaultRouter, SimpleRouter
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import GuideViewSet, StepViewSet

router = DefaultRouter()
router.register(r"", GuideViewSet, basename="guide")

step_router = SimpleRouter()
step_router.register(r"steps", StepViewSet, basename="step")

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("", include(step_router.urls)),
    path("", include(router.urls)),
]
