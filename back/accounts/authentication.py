# Autenticação JWT com versão de sessão: tokens de versões anteriores deixam de identificar o usuário após revogação.
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.authentication import JWTAuthentication
# Dependência: validação, emissão e renovação dos tokens JWT.
from rest_framework_simplejwt.exceptions import AuthenticationFailed
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import UserSettings


# Obtém a versão de sessão associada ao usuário para comparar ou emitir credenciais.
# Parâmetros — user: instância do usuário Django.
# Retorno: UserSettings.objects.get_or_create(user=user)[0].session_version.
def version(user):
    return UserSettings.objects.get_or_create(user=user)[0].session_version


class AccountJWTAuthentication(JWTAuthentication):
    # Resolve o usuário do JWT validado e verifica se sua versão de sessão ainda é aceita.
    # Parâmetros — validated_token: argumento fornecido pelo chamador no contrato desta função.
    # Retorno: user.
    # Falhas explícitas no fluxo: AuthenticationFailed. Consulte os blocos try/except para as conversões locais.
    def get_user(self,validated_token):
        user=super().get_user(validated_token)
        if validated_token.get('session_version',0)!=version(user):
            raise AuthenticationFailed('Este acesso foi encerrado. Entre novamente.',code='session_revoked')
        return user
