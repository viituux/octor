# Escopos administrativos e de participação em treinamentos, vinculados à autoria e à associação à equipe.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models import Q
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Training, Participation
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.exceptions import PermissionDenied


# Restringe os treinamentos aos que o usuário pode administrar.
# Parâmetros — user: instância do usuário Django.
# Retorno: resultado de Training.objects.filter(Q(owner=user) | Q(workspace__owner=user)).distinct(...).
def managed(user):
    return Training.objects.filter(Q(owner=user)|Q(workspace__owner=user)).distinct()


# Verifica a capacidade de administrar o treinamento antes de permitir a operação.
# Parâmetros — user: instância do usuário Django.
# Parâmetros — training: instância do treinamento.
# Retorno: None; o efeito está nas operações do corpo.
# Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
def require_manager(user,training):
    if training.owner_id!=user.id and (not training.workspace_id or training.workspace.owner_id!=user.id):
        raise PermissionDenied('Somente os responsáveis por este treinamento podem administrar seus dados.')


# Obtém os treinamentos acessíveis ao participante conforme os vínculos atuais.
# Parâmetros — user: instância do usuário Django.
# Retorno: resultado de Training.objects.filter(status='published', participations__user=user).distinct(...).
def available(user):
    return Training.objects.filter(status='published',participations__user=user).distinct()
