# Endpoints de cadastro, usuário autenticado e preferências. As permissões e serializers delimitam os dados acessíveis.
# Dependência: contratos e funções do módulo .sessions reutilizados neste fluxo.
from .sessions import session_tokens
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import generics, permissions, status
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.throttling import ScopedRateThrottle
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.tokens import RefreshToken
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.views import TokenObtainPairView
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import UserSettings
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer, UserSettingsSerializer


class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope = "auth"


class RegisterView(generics.CreateAPIView):
    throttle_classes = [ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope = "auth"

    # Cria o recurso de RegisterView usando os dados e vínculos definidos neste fluxo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — *args: argumentos posicionais adicionais.
    # Parâmetros — **kwargs: argumentos nomeados adicionais.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        tokens = session_tokens(user)
        return Response({**tokens, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]

    # Seleciona o objeto no contexto do usuário autenticado em vez de aceitar outro usuário informado pelo cliente.
    # Retorno: self.request.user.
    def get_object(self):
        return self.request.user


class UserSettingsView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]

    # Atende GET em UserSettingsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def get(self, request):
        settings, _ = UserSettings.objects.get_or_create(user=request.user)
        serializer = UserSettingsSerializer(settings)
        return Response(serializer.data)

    # Atende PATCH em UserSettingsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def patch(self, request):
        settings, _ = UserSettings.objects.get_or_create(user=request.user)
        serializer = UserSettingsSerializer(settings, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
