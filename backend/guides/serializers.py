import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from .models import Workspace, Guide, Step


class StepSerializer(serializers.ModelSerializer):
    screenshot_url = serializers.SerializerMethodField()
    screenshot_base64 = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Step
        fields = [
            "id",
            "guide",
            "order",
            "text",
            "screenshot",
            "screenshot_url",
            "screenshot_base64",
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
        read_only_fields = ["id", "created_at", "screenshot_url"]
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


class GuideDetailSerializer(serializers.ModelSerializer):
    steps = StepSerializer(many=True, read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = Guide
        fields = [
            "id",
            "title",
            "description",
            "status",
            "language",
            "owner",
            "owner_username",
            "workspace",
            "steps",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]


class GuideListSerializer(serializers.ModelSerializer):
    step_count = serializers.IntegerField(source="steps.count", read_only=True)
    first_step_screenshot = serializers.SerializerMethodField()

    class Meta:
        model = Guide
        fields = [
            "id",
            "title",
            "description",
            "status",
            "language",
            "step_count",
            "first_step_screenshot",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

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
