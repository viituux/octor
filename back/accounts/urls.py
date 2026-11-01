# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: contratos e funções do módulo .account_settings reutilizados neste fluxo.
from .account_settings import ProfileView, SecurityView, RevokeOtherSessionsView
# Dependência: contratos e funções do módulo .sessions reutilizados neste fluxo.
from .sessions import AccountRefreshView
# Dependência: contratos e funções do módulo .google_auth reutilizados neste fluxo.
from .google_auth import GoogleConfigView, GoogleChallengeView, GoogleLoginView, GoogleLinkView
# Dependência: registro e composição das rotas HTTP.
from django.urls import path
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.views import TokenRefreshView
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import CustomLoginView, RegisterView, MeView, UserSettingsView

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("profile/", ProfileView.as_view()),
    path("password/", SecurityView.as_view()),
    path("sessions/revoke/", RevokeOtherSessionsView.as_view()),
    path("google/config/", GoogleConfigView.as_view()),
    path("google/challenge/", GoogleChallengeView.as_view()),
    path("google/login/", GoogleLoginView.as_view()),
    path("google/link/", GoogleLinkView.as_view()),
    path("login/", CustomLoginView.as_view(), name="token_obtain_pair"),
    path("refresh/", AccountRefreshView.as_view(), name="token_refresh"),
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("me/", MeView.as_view(), name="auth_me"),
    path("settings/", UserSettingsView.as_view(), name="user_settings"),
]
