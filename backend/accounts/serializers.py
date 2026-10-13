from rest_framework import serializers
from django.contrib.auth.models import User
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import UserSettings


class UserSettingsSerializer(serializers.ModelSerializer):
    llm_api_key_masked = serializers.SerializerMethodField()
    tts_api_key_masked = serializers.SerializerMethodField()

    class Meta:
        model = UserSettings
        fields = [
            "llm_provider",
            "llm_api_key",
            "llm_api_key_masked",
            "tts_provider",
            "tts_api_key",
            "tts_api_key_masked",
            "updated_at",
        ]
        extra_kwargs = {
            "llm_api_key": {"write_only": True, "required": False},
            "tts_api_key": {"write_only": True, "required": False},
        }

    def get_llm_api_key_masked(self, obj):
        if not obj.llm_api_key:
            return ""
        if len(obj.llm_api_key) <= 8:
            return "••••••••"
        return f"{obj.llm_api_key[:4]}••••••••{obj.llm_api_key[-4:]}"

    def get_tts_api_key_masked(self, obj):
        if not obj.tts_api_key:
            return ""
        if len(obj.tts_api_key) <= 8:
            return "••••••••"
        return f"{obj.tts_api_key[:4]}••••••••{obj.tts_api_key[-4:]}"


class UserSerializer(serializers.ModelSerializer):
    settings = UserSettingsSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "settings"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
        }
        return data
