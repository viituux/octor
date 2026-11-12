"""Resolve a integração ativa sem expor a chave ao navegador."""
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db.models import Q

from .models import AIConnection


class CredentialError(Exception):
    pass


def cipher():
    try:
        return Fernet(settings.OCTOR_AI_ENCRYPTION_KEY.encode('ascii'))
    except (ValueError, UnicodeError):
        raise CredentialError('A proteção de chaves de IA ainda não foi configurada no servidor.') from None


def protect(value):
    return cipher().encrypt(value.encode('utf-8')).decode('ascii') if value else ''


def reveal(value):
    try:
        return cipher().decrypt(value.encode('ascii')).decode('utf-8')
    except (InvalidToken, UnicodeError):
        raise CredentialError('A chave salva não pôde ser aberta. Peça ao responsável para cadastrá-la novamente.') from None


def connection_for(guide, actor=None):
    if guide.workspace_id:
        actor_id = actor.pk if actor is not None else guide.owner_id
        return AIConnection.objects.filter(workspace_id=guide.workspace_id).filter(
            Q(workspace__owner_id=actor_id) | Q(workspace__members__pk=actor_id)
        ).distinct().first()
    return AIConnection.objects.filter(user_id=guide.owner_id).first()
