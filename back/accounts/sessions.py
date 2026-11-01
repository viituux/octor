# Emissão e renovação de JWTs com a versão atual de sessão, sem incluir segredos de provedores na resposta.
# Dependência: contratos e funções do módulo .authentication reutilizados neste fluxo.
from .authentication import version
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.exceptions import InvalidToken
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.views import TokenRefreshView
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User


# Emite a sessão de acesso/renovação para o usuário usando a versão atual de revogação.
# Parâmetros — user: instância do usuário Django.
# Retorno: dicionário.
def session_tokens(user):
    # Dependência: validação, emissão e renovação dos tokens JWT.
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    refresh['session_version'] = version(user)
    return {'access':str(refresh.access_token),'refresh':str(refresh)}


class AccountRefreshSerializer(TokenRefreshSerializer):
    # Aplica as validações combinadas de AccountRefreshSerializer antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — attrs: atributos de entrada do serializer.
    # Retorno: resultado de super().validate(...).
    # Falhas explícitas no fluxo: InvalidToken. Consulte os blocos try/except para as conversões locais.
    def validate(self, attrs):
        refresh=self.token_class(attrs['refresh'])
        user=User.objects.filter(pk=refresh.get('user_id'),is_active=True).first()
        if not user or refresh.get('session_version',0) != version(user):
            raise InvalidToken('Este acesso foi encerrado. Entre novamente.')
        return super().validate(attrs)


class AccountRefreshView(TokenRefreshView):
    serializer_class=AccountRefreshSerializer
