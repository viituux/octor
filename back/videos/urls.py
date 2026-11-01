# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import CreateVideoJobView, VideoJobDetailView

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("guides/<int:guide_id>/video/", CreateVideoJobView.as_view(), name="create_video_job"),
    path("video-jobs/<int:pk>/", VideoJobDetailView.as_view(), name="video_job_detail"),
]
