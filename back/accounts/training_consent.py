"""Termo exibido antes do aceite. Mudanças no texto exigem uma nova versão."""
from hashlib import sha256

from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TrainingDataConsent


TERM_VERSION = '1.0'
TERM_TITLE = 'Termo sobre dados do treinamento'
TERM_TEXT = (
    'O OCTOR usa sua identificação e registra seu progresso, horários, respostas do quiz, '
    'pontuação e avaliação para executar o treinamento e comprovar sua participação. '
    'Responsáveis autorizados podem consultar esses registros. Seu nome, pontuação e tempo '
    'podem aparecer no ranking para participantes do mesmo treinamento. '
    'Não informe dados sensíveis em campos de comentário. Se tiver dúvidas sobre o tratamento '
    'desses dados, procure o responsável pelo treinamento.'
)
TERM_SHA256 = sha256(TERM_TEXT.encode('utf-8')).hexdigest()


def require_current_version(version):
    if version != TERM_VERSION:
        raise serializers.ValidationError({
            'detail': 'Leia e aceite o termo vigente sobre os dados do treinamento antes de continuar.'
        })


def has_current_consent(user):
    return TrainingDataConsent.objects.filter(user=user, version=TERM_VERSION, term_sha256=TERM_SHA256).exists()


def accept_training_consent(user, version, source):
    require_current_version(version)
    receipt, _ = TrainingDataConsent.objects.get_or_create(
        user=user, version=TERM_VERSION,
        defaults={'term_sha256': TERM_SHA256, 'source': source},
    )
    if receipt.term_sha256 != TERM_SHA256:
        raise serializers.ValidationError({'detail': 'O texto do termo mudou. Contate o responsável para revisar a versão.'})
    return receipt


class TrainingConsentView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            'version': TERM_VERSION,
            'title': TERM_TITLE,
            'text': TERM_TEXT,
            'accepted': request.user.is_authenticated and has_current_consent(request.user),
        }, headers={'Cache-Control': 'private, no-store'})
