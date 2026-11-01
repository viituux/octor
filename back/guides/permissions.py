# Escopo de leitura e edição de guias conforme autoria, equipe, publicação, compartilhamento e lixeira.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models import Q
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.permissions import BasePermission, SAFE_METHODS


# Constrói a consulta dos guias visíveis ao usuário segundo os vínculos de acesso existentes.
# Parâmetros — user: instância do usuário Django.
# Retorno: resultado de Guide.objects.filter(Q(owner=user) | Q(shares__user=user) | Q(workspace__members=user, status='published')).distinct(...).
def accessible_guides(user):
    # Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
    from .models import Guide
    return Guide.objects.filter(Q(owner=user) | Q(shares__user=user) | Q(workspace__members=user, status='published')).distinct()


class OwnerWritesOthersRead(BasePermission):
    # Decide a permissão sobre o objeto conforme a operação HTTP e as regras de propriedade/acesso.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — view: argumento fornecido pelo chamador no contrato desta função.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: condição booleana.
    def has_object_permission(self, request, view, obj):
        guide = getattr(obj, 'guide', obj)
        return request.method in SAFE_METHODS or guide.owner_id == request.user.id
