# Contratos de entrada e saída da conta: validação de credenciais, criação de usuário e emissão de sessão.
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import serializers
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.password_validation import validate_password
# Dependência: exceções, validações, cache ou utilitários de comandos do Django.
from django.core.exceptions import ValidationError
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import UserSettings


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ['updated_at']
        read_only_fields = ['updated_at']

    # Aplica as validações combinadas de UserSettingsSerializer antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — attrs: atributos de entrada do serializer.
    # Retorno: attrs.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate(self, attrs):
        if self.initial_data:
            raise serializers.ValidationError('As credenciais de IA são gerenciadas pelo servidor.')
        return attrs


class UserSerializer(serializers.ModelSerializer):
    has_password = serializers.SerializerMethodField()
    # Calcula o campo `has_password` de UserSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de obj.has_usable_password(...).
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

    # Valida o campo `username` antes de aceitá-lo no contrato de entrada de RegisterSerializer.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return value

    # Valida o campo `email` antes de aceitá-lo no contrato de entrada de RegisterSerializer.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado. Entre na sua conta.")
        return value

    # Aplica as validações combinadas de RegisterSerializer antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — attrs: atributos de entrada do serializer.
    # Retorno: attrs.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate(self, attrs):
        try:
            validate_password(attrs["password"], User(username=attrs["username"], email=attrs["email"], first_name=attrs["first_name"]))
        except ValidationError as error:
            raise serializers.ValidationError({"password": error.messages})
        return attrs

    # Cria o recurso de RegisterSerializer usando os dados e vínculos definidos neste fluxo.
    # Parâmetros — validated_data: dicionário após a validação do serializer.
    # Retorno: resultado de User.objects.create_user(...).
    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    # Calcula o campo `token` de CustomTokenObtainPairSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — user: instância do usuário Django.
    # Retorno: token.
    @classmethod
    def get_token(cls,user):
        # Dependência: contratos e funções do módulo .sessions reutilizados neste fluxo.
        from .sessions import version
        token=super().get_token(user);token["session_version"]=version(user);return token
    # Aplica as validações combinadas de CustomTokenObtainPairSerializer antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — attrs: atributos de entrada do serializer.
    # Retorno: data.
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
