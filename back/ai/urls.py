from .usage_views import MyAIUsageView, MasterAIOverviewView
# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import GenerateGuideTextView, PrepareNarrationView
from .connections import AIConnectionView, GenerateSpeechView

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("ai/usage/me/", MyAIUsageView.as_view()),
    path("ai/master/overview/", MasterAIOverviewView.as_view()),
    path("ai/connections/", AIConnectionView.as_view()),
    path("ai/connections/workspaces/<int:workspace_id>/", AIConnectionView.as_view()),
    path("guides/<int:guide_id>/steps/<int:step_id>/generate-speech/", GenerateSpeechView.as_view()),
    path("guides/<int:guide_id>/prepare-narration/", PrepareNarrationView.as_view(), name="prepare_narration"),
    path("guides/<int:guide_id>/steps/<int:step_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_step_text"),
    path("guides/<int:guide_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_guide_text"),
]
