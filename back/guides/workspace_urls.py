# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path, include
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.routers import DefaultRouter
# Dependência: contratos e funções do módulo .teamwork reutilizados neste fluxo.
from .teamwork import WorkspaceViewSet, AcceptInvitationView
router=DefaultRouter()
router.register('',WorkspaceViewSet,basename='workspace')
# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns=[path('invitations/<str:token>/',AcceptInvitationView.as_view()),path('',include(router.urls))]
