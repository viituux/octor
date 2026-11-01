# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import GenerateGuideTextView, PrepareNarrationView

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("guides/<int:guide_id>/prepare-narration/", PrepareNarrationView.as_view(), name="prepare_narration"),
    path("guides/<int:guide_id>/steps/<int:step_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_step_text"),
    path("guides/<int:guide_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_guide_text"),
]
