from django.db.models import Q
from .models import Training, Participation
from rest_framework.exceptions import PermissionDenied


def managed(user):
    return Training.objects.filter(Q(owner=user)|Q(workspace__owner=user)).distinct()


def require_manager(user,training):
    if training.owner_id!=user.id and (not training.workspace_id or training.workspace.owner_id!=user.id):
        raise PermissionDenied('Somente os responsáveis por este treinamento podem administrar seus dados.')


def available(user):
    return Training.objects.filter(status='published',participations__user=user).distinct()
