# Alterações de perfil, senha e sessões. Fluxo: validar dados, confirmar identidade nas operações sensíveis e persistir a conta autenticada.
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.password_validation import validate_password
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.validators import UnicodeUsernameValidator
# Dependência: exceções, validações, cache ou utilitários de comandos do Django.
from django.core.exceptions import ValidationError
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import serializers, permissions
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.throttling import ScopedRateThrottle
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import UserSerializer
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import UserSettings
# Dependência: contratos e funções do módulo .sessions reutilizados neste fluxo.
from .sessions import session_tokens


# Confirma a identidade por senha atual ou credencial Google vinculada antes de autorizar alteração sensível.
# Parâmetros — user: instância do usuário Django.
# Parâmetros — data: dicionário de entrada ou dados já validados, conforme o chamador.
# Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
# Retorno: None; o efeito está nas operações do corpo.
# Falhas explícitas no fluxo: serializers.ValidationError, ValueError. Consulte os blocos try/except para as conversões locais.
def confirm_identity(user,data,request):
    if user.has_usable_password():
        if not user.check_password(data.get('current_password','')):
            raise serializers.ValidationError({'current_password':'A senha atual está incorreta.'})
    else:
        # Dependência: contratos e funções do módulo .google_auth reutilizados neste fluxo.
        from .google_auth import checked_claims
        try:
            claims=checked_claims(request)
            if not hasattr(user,'google_account') or claims['sub']!=user.google_account.subject:
                raise ValueError()
        except Exception:
            raise serializers.ValidationError({'identity':'Confirme novamente sua conta Google para continuar.'})


class ProfileInput(serializers.ModelSerializer):
    username=serializers.CharField(required=False,max_length=150,validators=[UnicodeUsernameValidator()])
    current_password=serializers.CharField(write_only=True,required=False,trim_whitespace=False)
    credential=serializers.CharField(write_only=True,required=False,max_length=20000)
    challenge=serializers.CharField(write_only=True,required=False,max_length=100)
    first_name=serializers.CharField(max_length=150,allow_blank=False,required=False)
    email=serializers.EmailField(required=False)
    class Meta:
        model=User
        fields=['first_name','last_name','username','email','current_password','credential','challenge']
        extra_kwargs={'username':{'validators':[]}}
    # Valida o campo `username` antes de aceitá-lo no contrato de entrada de ProfileInput.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_username(self,value):
        if User.objects.filter(username__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Este nome de usuário já está em uso.')
        return value
    # Valida o campo `email` antes de aceitá-lo no contrato de entrada de ProfileInput.
    # Parâmetros — value: valor do campo em validação.
    # Retorno: value.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate_email(self,value):
        value=value.strip().lower()
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Este e-mail já está em uso.')
        return value
    # Aplica as validações combinadas de ProfileInput antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — data: dicionário de entrada ou dados já validados, conforme o chamador.
    # Retorno: data.
    def validate(self,data):
        user=self.instance
        if any(key in data and data[key]!=getattr(user,key) for key in ['username','email']):
            confirm_identity(user,data,self.context['request'])
        return data
    # Aplica os dados validados ao registro de ProfileInput, preservando o tratamento dos campos auxiliares.
    # Parâmetros — instance: registro persistido a atualizar.
    # Parâmetros — validated_data: dicionário após a validação do serializer.
    # Retorno: resultado de super().update(...).
    def update(self,instance,validated_data):
        for key in ['current_password','credential','challenge']:validated_data.pop(key,None)
        return super().update(instance,validated_data)


class ProfileView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope='auth'
    # Atende PATCH em ProfileView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    def patch(self,request):
        # A atualização bloqueia o registro dentro da transação para serializar alterações concorrentes da mesma conta.
        with transaction.atomic():
            user=User.objects.select_for_update().get(pk=request.user.pk)
            form=ProfileInput(user,data=request.data,partial=True,context={'request':request})
            form.is_valid(raise_exception=True)
            user=form.save()
        return Response(UserSerializer(user).data)


class IdentityInput(serializers.Serializer):
    current_password=serializers.CharField(required=False,trim_whitespace=False,max_length=256,write_only=True)
    credential=serializers.CharField(required=False,max_length=20000,write_only=True)
    challenge=serializers.CharField(required=False,max_length=100,write_only=True)


class PasswordInput(IdentityInput):
    new_password=serializers.CharField(trim_whitespace=False,max_length=256,write_only=True)
    confirmation=serializers.CharField(trim_whitespace=False,max_length=256,write_only=True)
    # Aplica as validações combinadas de PasswordInput antes de disponibilizar os dados à persistência ou autenticação.
    # Parâmetros — data: dicionário de entrada ou dados já validados, conforme o chamador.
    # Retorno: data.
    # Falhas explícitas no fluxo: serializers.ValidationError. Consulte os blocos try/except para as conversões locais.
    def validate(self,data):
        user=self.context['request'].user
        if data['new_password']!=data['confirmation']:
            raise serializers.ValidationError({'confirmation':'As senhas não coincidem.'})
        try:validate_password(data['new_password'],user)
        except ValidationError as error:raise serializers.ValidationError({'new_password':error.messages})
        if user.check_password(data['new_password']):
            raise serializers.ValidationError({'new_password':'Escolha uma senha diferente da atual.'})
        return data


class SecurityView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope='auth'
    change_password=True
    # Atende POST em SecurityView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    def post(self,request):
        form=(PasswordInput if self.change_password else IdentityInput)(data=request.data,context={'request':request})
        form.is_valid(raise_exception=True)
        # A atualização bloqueia o registro dentro da transação para serializar alterações concorrentes da mesma conta.
        with transaction.atomic():
            user=User.objects.select_for_update().get(pk=request.user.pk)
            confirm_identity(user,form.validated_data,request)
            if self.change_password:
                user.set_password(form.validated_data['new_password']);user.save(update_fields=['password'])
            settings=UserSettings.objects.select_for_update().get(user=user)
            settings.session_version+=1;settings.save(update_fields=['session_version','updated_at'])
            session=session_tokens(user)
        return Response({**session,'user':UserSerializer(user).data})


class RevokeOtherSessionsView(SecurityView):
    change_password=False
