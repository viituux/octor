from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.models import User
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import serializers, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from .serializers import UserSerializer
from .models import UserSettings
from .sessions import session_tokens


def confirm_identity(user,data,request):
    if user.has_usable_password():
        if not user.check_password(data.get('current_password','')):
            raise serializers.ValidationError({'current_password':'A senha atual está incorreta.'})
    else:
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
    def validate_username(self,value):
        if User.objects.filter(username__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Este nome de usuário já está em uso.')
        return value
    def validate_email(self,value):
        value=value.strip().lower()
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('Este e-mail já está em uso.')
        return value
    def validate(self,data):
        user=self.instance
        if any(key in data and data[key]!=getattr(user,key) for key in ['username','email']):
            confirm_identity(user,data,self.context['request'])
        return data
    def update(self,instance,validated_data):
        for key in ['current_password','credential','challenge']:validated_data.pop(key,None)
        return super().update(instance,validated_data)


class ProfileView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='auth'
    def patch(self,request):
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
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='auth'
    change_password=True
    def post(self,request):
        form=(PasswordInput if self.change_password else IdentityInput)(data=request.data,context={'request':request})
        form.is_valid(raise_exception=True)
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
