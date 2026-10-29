from .authentication import version
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView
from django.contrib.auth.models import User


def session_tokens(user):
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    refresh['session_version'] = version(user)
    return {'access':str(refresh.access_token),'refresh':str(refresh)}


class AccountRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh=self.token_class(attrs['refresh'])
        user=User.objects.filter(pk=refresh.get('user_id'),is_active=True).first()
        if not user or refresh.get('session_version',0) != version(user):
            raise InvalidToken('Este acesso foi encerrado. Entre novamente.')
        return super().validate(attrs)


class AccountRefreshView(TokenRefreshView):
    serializer_class=AccountRefreshSerializer
