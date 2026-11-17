"""Política compartilhada de autorização de teste e atribuição do treinamento."""
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied

def is_test_authorized(guide):
    """Retorna bool; só vale o aceite explícito do proprietário atual."""
    return bool(guide.valido_para_teste and guide.test_authorized_at and guide.test_authorized_by_id == guide.owner_id and guide.playback_environment == 'test' and not guide.trashed_at)

def require_test_authorization(guide):
    """Rejeita com 403 o conteúdo/atividade sem autorização persistida."""
    if not is_test_authorized(guide):
        raise PermissionDenied('Aguarde o criador marcar o procedimento como Válido para Teste.')

def assigned_training(guide, user):
    """Treinamento publicado atribuído ao usuário, respeitando o espaço atual."""
    from trainings.models import Participation
    return Participation.objects.filter(
        Q(training__workspace__isnull=True) | Q(training__workspace__members=user)
        | Q(training__owner=user) | Q(training__workspace__owner=user),
        training__guide=guide, training__status='published', user=user,
    ).order_by('-assigned_at', '-pk').first()
