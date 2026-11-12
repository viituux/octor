"""Chave própria para instruções e narração gerada com a integração do servidor."""
import base64
import io
import json
import wave
from hashlib import sha256
from uuid import uuid4

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from guides.models import Guide, Step, Workspace
from guides.serializers import StepSerializer

from .credentials import CredentialError, protect
from .models import AIConnection


class ConnectionInput(serializers.Serializer):
    gemini_key = serializers.CharField(max_length=512, required=False, allow_null=True, write_only=True)

    def to_internal_value(self, data):
        if isinstance(data, dict) and data.keys() - {'gemini_key'}:
            raise serializers.ValidationError({'detail': 'Somente a chave Gemini de instruções pode ser alterada.'})
        return super().to_internal_value(data)


class AIConnectionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def scope(self, request, workspace_id):
        if workspace_id is None:
            return {'user': request.user}
        return {'workspace': get_object_or_404(Workspace, pk=workspace_id, owner=request.user)}

    def status(self, item):
        return Response(
            {'gemini_configured': bool(item and item.gemini_secret)},
            headers={'Cache-Control': 'private, no-store'},
        )

    def get(self, request, workspace_id=None):
        return self.status(AIConnection.objects.filter(**self.scope(request, workspace_id)).first())

    @transaction.atomic
    def patch(self, request, workspace_id=None):
        scope = self.scope(request, workspace_id)
        form = ConnectionInput(data=request.data)
        form.is_valid(raise_exception=True)
        if 'gemini_key' not in form.validated_data:
            return self.status(AIConnection.objects.filter(**scope).first())
        try:
            secret = protect(form.validated_data['gemini_key'])
        except CredentialError as exc:
            return Response({'detail': str(exc)}, status=503)
        item, _ = AIConnection.objects.update_or_create(**scope, defaults={'gemini_secret': secret})
        return self.status(item)


class SpeechThrottle(UserRateThrottle):
    scope = 'gemini_speech'
    rate = '12/min'


class SpeechInput(serializers.Serializer):
    text = serializers.CharField(max_length=5000)
    replace = serializers.BooleanField(default=False)
    preserve_live = serializers.BooleanField(default=False)


def synthesize(text):
    """Pede ao Gemini TTS um WAV, usando exclusivamente a credencial do servidor."""
    key = settings.GEMINI_TTS_API_KEY or (settings.LLM_API_KEY if settings.LLM_PROVIDER == 'gemini' else '')
    if not key:
        raise CredentialError('A narração Gemini ainda não está configurada no servidor.')

    max_audio = 10 * 1024 * 1024
    try:
        with requests.post(
            'https://generativelanguage.googleapis.com/v1beta/interactions',
            headers={'x-goog-api-key': key, 'Accept': 'application/json'},
            json={
                'model': settings.GEMINI_TTS_MODEL,
                'store': False,
                'input': [{'type': 'user_input', 'content': [{
                    'type': 'text', 'text': text,
                    'annotations': [{'type': 'speech_metadata',
                                     'style': 'Leia em português do Brasil, com voz clara, ritmo calmo e tom instrucional.'}],
                }]}],
                'response_format': {'type': 'audio', 'mime_type': 'audio/wav'},
                'generation_config': {'speech_config': [{'voice': settings.GEMINI_TTS_VOICE}]},
            },
            timeout=(8, 90), stream=True, allow_redirects=False,
        ) as response:
            if response.status_code in (401, 403):
                raise CredentialError('O Gemini recusou o acesso à narração. O responsável pelo servidor deve verificar a chave e o modelo.')
            if response.status_code in (402, 429):
                raise CredentialError('O Gemini atingiu o limite de uso para gerar áudio. Tente novamente mais tarde.')
            if response.status_code != 200:
                raise CredentialError('O Gemini não conseguiu gerar a narração. Confira a configuração do servidor e tente novamente.')
            body = bytearray()
            for chunk in response.iter_content(chunk_size=65536):
                body.extend(chunk)
                if len(body) > (max_audio * 4 // 3) + 65536:
                    raise CredentialError('O áudio gerado ultrapassou o limite de 10 MB.')

        interaction = json.loads(body)
        encoded = next(
            block['data']
            for step in interaction['steps'] if step['type'] == 'model_output'
            for block in step['content'] if block['type'] == 'audio'
        )
        audio = base64.b64decode(encoded, validate=True)
        if len(audio) > max_audio:
            raise CredentialError('O áudio gerado ultrapassou o limite de 10 MB.')
        with wave.open(io.BytesIO(audio), 'rb') as wav:
            frame_bytes = wav.getnchannels() * wav.getsampwidth()
            frames = wav.getnframes()
            if not frames or len(wav.readframes(frames)) != frames * frame_bytes:
                raise ValueError('WAV incompleto')
        return audio
    except requests.exceptions.RequestException:
        raise CredentialError('Não foi possível concluir a narração com o Gemini. Tente novamente.') from None
    except (ValueError, KeyError, TypeError, StopIteration, EOFError, wave.Error):
        raise CredentialError('O Gemini não devolveu um arquivo de áudio válido. Tente novamente.') from None


def has_live_narration(step):
    return bool(step.guide.capture_audio and any(
        isinstance(item, dict) and item.get('type') == 'live_narration'
        for item in step.annotations
    ))


class GenerateSpeechView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SpeechThrottle]

    def post(self, request, guide_id, step_id):
        guide = get_object_or_404(Guide, pk=guide_id, owner=request.user, trashed_at__isnull=True)
        step = get_object_or_404(guide.steps, pk=step_id)
        form = SpeechInput(data=request.data)
        form.is_valid(raise_exception=True)
        text = form.validated_data['text']
        if step.text.strip() != text:
            return Response({'detail': 'Aguarde o salvamento da instrução antes de gerar a narração.'}, status=409)
        preserve_live = form.validated_data['preserve_live']
        if preserve_live and has_live_narration(step):
            return Response({'detail': 'Este passo já tem voz gravada. O trecho foi preservado.'}, status=409)
        previous = step.narration.name
        if previous and not form.validated_data['replace']:
            return Response({'detail': 'Confirme a substituição da narração existente.'}, status=409)

        try:
            audio = synthesize(text)
        except CredentialError as exc:
            return Response({'detail': str(exc)}, status=503)

        with transaction.atomic():
            current = get_object_or_404(Step.objects.select_for_update(), pk=step_id, guide=guide)
            if (current.text.strip() != text or current.narration.name != previous
                    or (preserve_live and has_live_narration(current))):
                return Response({'detail': 'O passo mudou durante a geração. A narração anterior foi preservada.'}, status=409)
            serializer = StepSerializer(
                current, data={'narration': ContentFile(audio, name=f'{uuid4().hex}.wav')},
                partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            saved = serializer.save()
            annotations = [
                item for item in saved.annotations
                if not isinstance(item, dict) or item.get('type') != 'synthetic_narration'
            ]
            file_hash = sha256(saved.narration.name.encode('utf-8')).hexdigest()
            annotations.append({'type': 'synthetic_narration', 'file_hash': file_hash})
            saved.annotations = annotations
            saved.save(update_fields=['annotations'])
        return Response(serializer.data)
