# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: infraestrutura do framework para inicializar ou administrar a aplicação.
from django.contrib import admin
# Dependência: registro e composição das rotas HTTP.
from django.urls import path, include
# Dependência: acesso às configurações carregadas no servidor.
from django.conf import settings
# Dependência: acesso às configurações carregadas no servidor.
from django.conf.urls.static import static

# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/trainings/", include("trainings.urls")),
    path("api/guides/", include("guides.urls")),
    path("api/workspaces/", include("guides.workspace_urls")),
    path("api/", include("videos.urls")),
    path("api/", include("ai.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
