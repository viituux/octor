# Login e vinculação Google. O desafio de uso único e o nonce vinculam a credencial à tentativa iniciada nesta aplicação.
# Dependência: contratos e funções do módulo .sessions reutilizados neste fluxo.
from .sessions import session_tokens
# Dependência: valores aleatórios adequados a desafios e convites.
import secrets
# Dependência: identificadores para arquivos e recursos sem depender do nome enviado.
import uuid
# Dependência: acesso às configurações carregadas no servidor.
from django.conf import settings
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: exceções, validações, cache ou utilitários de comandos do Django.
from django.core.cache import cache
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction, IntegrityError
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import permissions
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.throttling import ScopedRateThrottle
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.tokens import RefreshToken
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import GoogleAccount
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import UserSerializer


# Valida a credencial Google com a biblioteca oficial e a configuração do cliente do servidor.
# Parâmetros — credential: credencial de identidade Google.
# Retorno: resultado de id_token.verify_oauth2_token(...).
def verify_google_credential(credential):
    # Dependência: validação da identidade Google com a biblioteca oficial.
    from google.oauth2 import id_token
    # Dependência: validação da identidade Google com a biblioteca oficial.
    from google.auth.transport.requests import Request
    class BoundedRequest(Request):
        # Executa o comportamento chamável de BoundedRequest no contexto da tentativa atual.
        # Parâmetros — *args: argumentos posicionais adicionais.
        # Parâmetros — **kwargs: argumentos nomeados adicionais.
        # Retorno: resultado de super().__call__(...).
        def __call__(self, *args, **kwargs):
            kwargs.setdefault("timeout", 10)
            return super().__call__(*args, **kwargs)
    return id_token.verify_oauth2_token(credential, BoundedRequest(), settings.GOOGLE_CLIENT_ID)


class GoogleConfigView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    # Atende GET em GoogleConfigView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def get(self, request):
        return Response({"enabled": bool(settings.GOOGLE_CLIENT_ID), "client_id": settings.GOOGLE_CLIENT_ID})


class GoogleChallengeView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope = "auth"
    # Atende POST em GoogleChallengeView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def post(self, request):
        if not settings.GOOGLE_CLIENT_ID:
            return Response({"detail": "O acesso com Google ainda não foi configurado."}, status=503)
        challenge, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        cache.set("google_challenge:" + challenge, nonce, 300)
        return Response({"challenge": challenge, "nonce": nonce})


# Valida a tentativa Google recebida, confrontando o desafio e o nonce antes de usar as declarações de identidade.
# Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
# Retorno: claims.
# Falhas explícitas no fluxo: RuntimeError, ValueError. Consulte os blocos try/except para as conversões locais.
def checked_claims(request):
    if not settings.GOOGLE_CLIENT_ID:
        raise RuntimeError("O acesso com Google ainda não foi configurado.")
    credential = request.data.get("credential")
    challenge = request.data.get("challenge")
    if not isinstance(credential, str) or len(credential) > 20000 or not isinstance(challenge, str) or len(challenge) > 100:
        raise ValueError("Resposta Google inválida.")
    expected_nonce = cache.get("google_challenge:" + challenge)
    if not expected_nonce:
        raise ValueError("A tentativa expirou. Tente entrar novamente.")
    claims = verify_google_credential(credential)
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise ValueError("Identidade Google inválida.")
    if not claims.get("sub") or not claims.get("email") or claims.get("email_verified") is not True:
        raise ValueError("É necessário um e-mail verificado pelo Google.")
    if claims.get("nonce") != expected_nonce:
        raise ValueError("A tentativa de login não corresponde à conta selecionada.")
    if not cache.add("google_consumed:" + challenge, True, 300):
        raise ValueError("Esta tentativa já foi utilizada. Tente novamente.")
    cache.delete("google_challenge:" + challenge)
    return claims


class GoogleLoginView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope = "auth"

    # Atende POST em GoogleLoginView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def post(self, request):
        try:
            claims = checked_claims(request)
        except (ImportError, RuntimeError):
            return Response({"detail": "Google indisponível. Verifique GOOGLE_CLIENT_ID e as dependências do backend."}, status=503)
        except Exception:
            return Response({"detail": "Não foi possível validar sua conta Google. Tente novamente."}, status=400)
        try:
            with transaction.atomic():
                account = GoogleAccount.objects.select_related("user").filter(subject=claims["sub"]).first()
                if account:
                    user = account.user
                else:
                    if User.objects.filter(email__iexact=claims["email"]).exists():
                        return Response({"detail": "Este e-mail já tem uma conta. Entre com sua senha e vincule o Google em Minha conta."}, status=409)
                    user = User.objects.create_user(username="google_" + uuid.uuid4().hex[:20], email=claims["email"].lower(),
                                                    first_name=str(claims.get("given_name", ""))[:150], last_name=str(claims.get("family_name", ""))[:150])
                    GoogleAccount.objects.create(user=user, subject=claims["sub"], email=claims["email"])
                if not user.is_active:
                    return Response({"detail": "Esta conta está desativada."}, status=403)
                tokens = session_tokens(user)
                return Response({**tokens, "user": UserSerializer(user).data})
        except IntegrityError:
            return Response({"detail": "A conta foi alterada durante o acesso. Tente novamente."}, status=409)


class GoogleLinkView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope = "auth"

    # Atende POST em GoogleLinkView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def post(self, request):
        try:
            claims = checked_claims(request)
        except (ImportError, RuntimeError):
            return Response({"detail": "Google indisponível. Verifique a configuração do backend."}, status=503)
        except Exception:
            return Response({"detail": "Não foi possível validar a conta Google. Tente novamente."}, status=400)
        try:
            with transaction.atomic():
                conflict = GoogleAccount.objects.filter(subject=claims["sub"]).exclude(user=request.user).exists()
                if conflict:
                    return Response({"detail": "Essa conta Google já está vinculada a outro usuário."}, status=409)
                current = GoogleAccount.objects.filter(user=request.user).first()
                if current and current.subject != claims["sub"]:
                    return Response({"detail": "Seu usuário já está vinculado a outra conta Google."}, status=409)
                GoogleAccount.objects.get_or_create(user=request.user, defaults={"subject": claims["sub"], "email": claims["email"]})
                return Response(UserSerializer(request.user).data)
        except IntegrityError:
            return Response({"detail": "A conta Google já está vinculada. Atualize a página."}, status=409)
