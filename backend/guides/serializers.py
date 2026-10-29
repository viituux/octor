import base64
import uuid
from django.core.files.base import ContentFile
from django.db import transaction
from rest_framework import serializers
from .models import Workspace, Guide, Step


class StepSerializer(serializers.ModelSerializer):
    generation_prompt_suggestion = serializers.SerializerMethodField()
    generation_prompt_mode = serializers.SerializerMethodField()

    def get_generation_prompt_suggestion(self, obj):
        from ai.prompts import build_generation_brief
        return build_generation_brief(obj)

    def get_generation_prompt_mode(self, obj):
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
            "screenshot": {"required": False, "allow_null": True},
            "selector": {"required": False, "allow_blank": True},
            "url": {"required": False, "allow_blank": True},
            "element_text": {"required": False, "allow_blank": True},
            "input_value": {"required": False, "allow_blank": True},
            "action_type": {"required": False, "allow_blank": True},
            "text": {"required": False, "allow_blank": True},
            "click_x": {"required": False, "allow_null": True},
            "click_y": {"required": False, "allow_null": True},
        }

    def validate_guide(self, value):
        request = self.context.get("request")
        if request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Você não tem acesso a este guia.")
        return value

    def update(self, instance, validated_data):
        old_name = instance.narration.name if instance.narration else None
        storage = instance.narration.storage
        replacing = "narration" in validated_data
        result = super().update(instance, validated_data)
        if replacing and old_name and old_name != result.narration.name:
            transaction.on_commit(lambda: storage.delete(old_name))
        return result

    def get_live_narration_url(self, obj):
        if not obj.guide.capture_audio or not any(isinstance(item, dict) and item.get("type") == "live_narration" for item in obj.annotations):
            return None
        request = self.context.get("request")
        url = obj.guide.capture_audio.url
        return request.build_absolute_uri(url) if request else url

    def get_narration_url(self, obj):
        if not obj.narration:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.narration.url) if request else obj.narration.url

    def validate_narration(self, value):
        if value is None:
            return value
        if value.size > 15 * 1024 * 1024:
            raise serializers.ValidationError("O áudio deve ter no máximo 15 MB.")
        header = value.read(16)
        value.seek(0)
        formats = {"webm": header.startswith(b"\x1aE\xdf\xa3"), "ogg": header.startswith(b"OggS"),
                   "m4a": len(header) >= 8 and header[4:8] == b"ftyp"}
        extension = next((ext for ext, valid in formats.items() if valid), None)
        if not extension:
            raise serializers.ValidationError("Formato de áudio inválido. Use uma gravação WebM, Ogg ou MP4.")
        value.name = f"narration_{uuid.uuid4().hex}.{extension}"
        return value

    def get_screenshot_url(self, obj):
        if obj.screenshot:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.screenshot.url)
            return obj.screenshot.url
        return None

    def create(self, validated_data):
        screenshot_base64 = validated_data.pop("screenshot_base64", None)
        if screenshot_base64 and not validated_data.get("screenshot"):
            try:
                format_prefix, imgstr = (
                    screenshot_base64.split(";base64,")
                    if ";base64," in screenshot_base64
                    else ("image/png", screenshot_base64)
                )
                ext = "png" if "png" in format_prefix else "jpg"
                file_name = f"step_{uuid.uuid4().hex[:8]}.{ext}"
                data = ContentFile(base64.b64decode(imgstr), name=file_name)
                validated_data["screenshot"] = data
            except Exception as e:
                print("Erro ao decodificar screenshot base64:", e)

        return super().create(validated_data)


class GuideAccessMixin:
    def get_can_edit(self, obj):
        request = self.context.get('request')
        return bool(request and obj.owner_id == request.user.id)

    def get_is_favorite(self, obj):
        request = self.context.get('request')
        return bool(request and any(user.id == request.user.id for user in obj.starred_by.all()))

    def get_shared_directly(self, obj):
        request = self.context.get('request')
        return bool(request and any(share.user_id == request.user.id for share in obj.shares.all()))

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
    def update(self, instance, validated_data):
        old_name = instance.capture_audio.name if instance.capture_audio else None
        storage = instance.capture_audio.storage
        replacing = "capture_audio" in validated_data
        result = super().update(instance, validated_data)
        if replacing and old_name and old_name != result.capture_audio.name:
            transaction.on_commit(lambda: storage.delete(old_name))
        return result

    capture_audio_url = serializers.SerializerMethodField()
    def get_capture_audio_url(self, obj):
        if not obj.capture_audio:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.capture_audio.url) if request else obj.capture_audio.url

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


class GuideListSerializer(GuideAccessMixin, serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    shared_directly = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True, default=None)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    step_count = serializers.IntegerField(source="steps.count", read_only=True)
    first_step_screenshot = serializers.SerializerMethodField()

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "trashed_at", "created_at", "updated_at"]

    def get_first_step_screenshot(self, obj):
        first_step = obj.steps.first()
        if first_step and first_step.screenshot:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(first_step.screenshot.url)
            return first_step.screenshot.url
        return None


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "members", "created_at"]
        read_only_fields = ["id", "created_at"]
