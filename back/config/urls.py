# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
from pathlib import Path
# Dependência: infraestrutura do framework para inicializar ou administrar a aplicação.
from django.contrib import admin
# Dependência: registro e composição das rotas HTTP.
from django.urls import path, include
# Dependência: acesso às configurações carregadas no servidor.
from django.conf import settings
# Dependência: acesso às configurações carregadas no servidor.
from django.conf.urls.static import static
from .release import ReleaseInfoView

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path('api/system/version/',ReleaseInfoView.as_view()),
    path("admin/", admin.site.urls),
    path("api/manuals/", include("manuals.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/trainings/", include("trainings.urls")),
    path("api/guides/", include("guides.urls")),
    path("api/workspaces/", include("guides.workspace_urls")),
    path("api/", include("videos.urls")),
    path("api/", include("ai.urls")),
]

if settings.DEBUG:
    # O pipeline de vídeo legado é o único consumidor da rota estática de desenvolvimento.
    urlpatterns += static(settings.MEDIA_URL + 'videos/', document_root=Path(settings.MEDIA_ROOT) / 'videos')
