from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from .models import UserSettings


def version(user):
    return UserSettings.objects.get_or_create(user=user)[0].session_version


class AccountJWTAuthentication(JWTAuthentication):
    def get_user(self,validated_token):
        user=super().get_user(validated_token)
        if validated_token.get('session_version',0)!=version(user):
            raise AuthenticationFailed('Este acesso foi encerrado. Entre novamente.',code='session_revoked')
        return user
