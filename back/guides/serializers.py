# Valida e representa guias/passos, incluindo capturas, anotações e áudio; URLs são produzidas no contexto da requisição.
# Dependência: codificação de mídia binária no formato aceito pelo provedor.
import base64
import binascii
import io

from PIL import Image
# Dependência: identificadores para arquivos e recursos sem depender do nome enviado.
import uuid
# Dependência: exceções, validações, cache ou utilitários de comandos do Django.
from django.core.files.base import ContentFile
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import serializers
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Workspace, Guide, Step
from .media import guide_media_url


MAX_CAPTURE_BYTES = 12 * 1024 * 1024
MAX_CAPTURE_PIXELS = 40_000_000
CAPTURE_FORMATS = {
    'PNG': ('data:image/png;base64', 'png'),
    'JPEG': ('data:image/jpeg;base64', 'jpg'),
}


class StepSerializer(serializers.ModelSerializer):
    generation_prompt_suggestion = serializers.SerializerMethodField()
    generation_prompt_mode = serializers.SerializerMethodField()

    # Calcula o campo `generation_prompt_suggestion` de StepSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de build_generation_brief(...).
    def get_generation_prompt_suggestion(self, obj):
        # Dependência: contratos e funções do módulo ai.prompts reutilizados neste fluxo.
        from ai.prompts import build_generation_brief
        return build_generation_brief(obj)

    # Calcula o campo `generation_prompt_mode` de StepSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: str ou str.
    def get_generation_prompt_mode(self, obj):
        # Dependência: contratos e funções do módulo ai.prompts reutilizados neste fluxo.
        from ai.prompts import has_custom_prompt
        return "manual" if has_custom_prompt(obj) else "automatic"

    live_narration_url = serializers.SerializerMethodField()
    narration_url = serializers.SerializerMethodField()
    screenshot_url = serializers.SerializerMethodField()
    screenshot_base64 = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Step
        fields = [
            "id",
            "guide",
            "order",
            "text",
            "generation_prompt",
            "generation_prompt_suggestion",
            "generation_prompt_mode",
            "screenshot",
            "screenshot_url",
            "screenshot_base64",
            "narration",
            "narration_url",
            "live_narration_url",
            "selector",
            "url",
            "click_x",
            "click_y",
            "element_text",
            "action_type",
            "input_value",
            "annotations",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "screenshot_url", "narration_url", "live_narration_url"]
        extra_kwargs = {
            "guide": {"required": False},
            "screenshot": {"required": False, "allow_null": True, "write_only": True},
            "narration": {"write_only": True},
            "selector": {"required": False, "allow_blank": True},
            "url": {"required": False, "allow_blank": True},
            "element_text": {"required": False, "allow_blank": True},
            "input_value": {"required": False, "allow_blank": True, "write_only": True},
            "action_type": {"required": False, "allow_blank": True},
            "text": {"required": False, "allow_blank": True},
            "click_x": {"required": False, "allow_null": True},
            "click_y": {"required": False, "allow_null": True},
        }

    # Valida o campo `guide` antes de aceitá-lo no contrato de entrada de StepSerializer.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_input_value(self, value):
        """Aceita o contrato da extensão antiga sem persistir o conteúdo digitado."""
        return ""

    def validate_guide(self, value):
        request = self.context.get("request")
        if request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Você não tem acesso a este guia.")
        return value

    # Aplica os dados validados ao registro de StepSerializer, preservando o tratamento dos campos auxiliares.
    # Parâmetros — instance: registro persistido a atualizar.
    # Parâmetros — validated_data: dicionário após a validação do serializer.
    # Retorno: result.
    def update(self, instance, validated_data):
        old_name = instance.narration.name if instance.narration else None
        storage = instance.narration.storage
        replacing = "narration" in validated_data
        result = super().update(instance, validated_data)
        if replacing and old_name and old_name != result.narration.name:
            transaction.on_commit(lambda: storage.delete(old_name))
        return result

    # Calcula o campo `live_narration_url` de StepSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: None; resultado de request.build_absolute_uri(...) ou url.
    def get_live_narration_url(self, obj):
        if not obj.guide.capture_audio or not any(isinstance(item, dict) and item.get("type") == "live_narration" for item in obj.annotations):
            return None
        return guide_media_url(obj.guide.capture_audio, self.context.get("request"))

    # Calcula o campo `narration_url` de StepSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: None; resultado de request.build_absolute_uri(...) ou obj.narration.url.
    def get_narration_url(self, obj):
        return guide_media_url(obj.narration, self.context.get("request"))

    # Valida o campo `narration` antes de aceitá-lo no contrato de entrada de StepSerializer.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_narration(self, value):
        if value is None:
            return value
        if value.size > 15 * 1024 * 1024:
            raise serializers.ValidationError("O áudio deve ter no máximo 15 MB.")
        header = value.read(16)
        value.seek(0)
        formats = {"webm": header.startswith(b"\x1aE\xdf\xa3"), "ogg": header.startswith(b"OggS"),
                   "m4a": len(header) >= 8 and header[4:8] == b"ftyp",
                   "wav": header.startswith(b"RIFF") and header[8:12] == b"WAVE",
                   "mp3": header.startswith(b"ID3") or (len(header) >= 2 and header[0] == 255 and header[1] & 224 == 224)}
        extension = next((ext for ext, valid in formats.items() if valid), None)
        if not extension:
            raise serializers.ValidationError("Formato de áudio inválido. Use um áudio WebM, Ogg, MP4, MP3 ou WAV.")
        value.name = f"narration_{uuid.uuid4().hex}.{extension}"
        return value

    # Calcula o campo `screenshot_url` de StepSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de request.build_absolute_uri(...); obj.screenshot.url; None.
    def get_screenshot_url(self, obj):
        return guide_media_url(obj.screenshot, self.context.get("request"))

    def validate(self, attrs):
        """Valida a captura Base64 antes de qualquer gravação do lote."""
        encoded = attrs.pop('screenshot_base64', None)
        if not encoded or attrs.get('screenshot'):
            return attrs

        prefix, separator, payload = encoded.partition(',')
        if not separator:
            prefix, payload = None, encoded
        try:
            if len(payload) > ((MAX_CAPTURE_BYTES + 2) // 3) * 4:
                raise ValueError('Captura acima do limite.')
            raw = base64.b64decode(payload, validate=True)
            if len(raw) > MAX_CAPTURE_BYTES:
                raise ValueError('Captura acima do limite.')
            with Image.open(io.BytesIO(raw)) as image:
                expected_prefix, extension = CAPTURE_FORMATS[image.format]
                if prefix is not None and prefix != expected_prefix:
                    raise ValueError('Tipo declarado incompatível.')
                if image.width * image.height > MAX_CAPTURE_PIXELS:
                    raise ValueError('Dimensões acima do limite.')
                image.load()
        except (binascii.Error, KeyError, OSError, ValueError, Image.DecompressionBombError):
            raise serializers.ValidationError({
                'screenshot_base64': 'Envie uma captura PNG ou JPEG válida, de até 12 MB e 40 megapixels.'
            }) from None

        attrs['screenshot'] = ContentFile(raw, name=f'step_{uuid.uuid4().hex}.{extension}')
        return attrs


class GuideAccessMixin:
    # Calcula o campo `can_edit` de GuideAccessMixin usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de bool(...).
    def get_can_edit(self, obj):
        request = self.context.get('request')
        return bool(request and obj.owner_id == request.user.id)

    # Calcula o campo `is_favorite` de GuideAccessMixin usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de bool(...).
    def get_is_favorite(self, obj):
        request = self.context.get('request')
        return bool(request and any(user.id == request.user.id for user in obj.starred_by.all()))

    # Calcula o campo `shared_directly` de GuideAccessMixin usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de bool(...).
    def get_shared_directly(self, obj):
        request = self.context.get('request')
        return bool(request and any(share.user_id == request.user.id for share in obj.shares.all()))

    # Valida o campo `workspace` antes de aceitá-lo no contrato de entrada de GuideAccessMixin.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_workspace(self, value):
        request = self.context.get('request')
        if value and (not request or not value.members.filter(id=request.user.id).exists()):
            raise serializers.ValidationError('Você não faz parte desse espaço de trabalho.')
        return value


class GuideDetailSerializer(GuideAccessMixin, serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    shared_directly = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True, default=None)
    # Aplica os dados validados ao registro de GuideDetailSerializer, preservando o tratamento dos campos auxiliares.
    # Parâmetros — instance: registro persistido a atualizar.
    # Parâmetros — validated_data: dicionário após a validação do serializer.
    # Retorno: result.
    def update(self, instance, validated_data):
        old_name = instance.capture_audio.name if instance.capture_audio else None
        storage = instance.capture_audio.storage
        replacing = "capture_audio" in validated_data
        result = super().update(instance, validated_data)
        if replacing and old_name and old_name != result.capture_audio.name:
            transaction.on_commit(lambda: storage.delete(old_name))
        return result

    capture_audio_url = serializers.SerializerMethodField()
    # Calcula o campo `capture_audio_url` de GuideDetailSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: None; resultado de request.build_absolute_uri(...) ou obj.capture_audio.url.
    def get_capture_audio_url(self, obj):
        return guide_media_url(obj.capture_audio, self.context.get("request"))

    # Valida o campo `capture_audio` antes de aceitá-lo no contrato de entrada de GuideDetailSerializer.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_capture_audio(self, value):
        if value is None:
            return value
        if value.size > 60 * 1024 * 1024:
            raise serializers.ValidationError("O áudio da captura deve ter no máximo 60 MB.")
        header = value.read(16)
        value.seek(0)
        if not (header.startswith(b"\x1aE\xdf\xa3") or header.startswith(b"OggS") or header[4:8] == b"ftyp"):
            raise serializers.ValidationError("Arquivo de áudio inválido.")
        extension = "webm" if header.startswith(b"\x1aE\xdf\xa3") else "ogg" if header.startswith(b"OggS") else "m4a"
        value.name = f"capture_{uuid.uuid4().hex}.{extension}"
        return value

    steps = StepSerializer(many=True, read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = Guide
        fields = [
            "playback_environment",
            "id",
            "title",
            "description",
            "status",
            "trashed_at",
            "can_edit",
            "is_favorite",
            "shared_directly",
            "workspace_name",
            "language",
            "owner",
            "owner_username",
            "capture_audio",
            "capture_audio_url",
            "workspace",
            "steps",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "trashed_at", "created_at", "updated_at", "capture_audio_url"]
        extra_kwargs = {"capture_audio": {"write_only": True}}


class GuideListSerializer(GuideAccessMixin, serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    shared_directly = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True, default=None)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    step_count = serializers.IntegerField(source="steps.count", read_only=True)
    first_step_screenshot = serializers.SerializerMethodField()
    first_step_title = serializers.SerializerMethodField()

    class Meta:
        model = Guide
        fields = [
            "id",
            "title",
            "description",
            "status",
            "trashed_at", "can_edit", "is_favorite", "shared_directly", "workspace_name",
            "language",
            "workspace",
            "owner_username",
            "step_count",
            "first_step_screenshot",
            "first_step_title",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "trashed_at", "created_at", "updated_at"]

    def get_first_step_title(self, obj):
        for annotation in getattr(obj, 'first_step_annotations', None) or []:
            if isinstance(annotation, dict) and annotation.get('type') == 'editor_step_title':
                title = annotation.get('title')
                if isinstance(title, str) and title.strip():
                    return title.strip()
        text = (getattr(obj, 'first_step_text', None) or '').strip()
        return text.splitlines()[0] if text else None

    # Calcula o campo `first_step_screenshot` de GuideListSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de request.build_absolute_uri(...); first_step.screenshot.url; None.
    def get_first_step_screenshot(self, obj):
        first_step = obj.steps.first()
        if first_step:
            return guide_media_url(first_step.screenshot, self.context.get("request"))
        return None


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "members", "created_at"]
        read_only_fields = ["id", "created_at"]
