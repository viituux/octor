from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import UserSettings


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ['updated_at']
        read_only_fields = ['updated_at']

    def validate(self, attrs):
        if self.initial_data:
            raise serializers.ValidationError('As credenciais de IA são gerenciadas pelo servidor.')
        return attrs


class UserSerializer(serializers.ModelSerializer):
    has_password = serializers.SerializerMethodField()
    def get_has_password(self,obj): return obj.has_usable_password()
    google_email = serializers.CharField(source="google_account.email", read_only=True, default=None)
    settings = UserSettingsSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "settings", "google_email", "has_password", "date_joined", "last_login"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=True, max_length=150)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "password"]
        read_only_fields = ["id"]

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado. Entre na sua conta.")
        return value

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], User(username=attrs["username"], email=attrs["email"], first_name=attrs["first_name"]))
        except ValidationError as error:
            raise serializers.ValidationError({"password": error.messages})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls,user):
        from .sessions import version
        token=super().get_token(user);token["session_version"]=version(user);return token
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
