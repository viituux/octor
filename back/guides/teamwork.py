# Equipes e convites: operações administrativas verificam o proprietário e a aceitação verifica identidade, validade e estado do convite.
# Dependência: datas e intervalos usados por expiração e filtros.
from datetime import timedelta
# Dependência: resumos criptográficos para identificar conteúdo ou tokens sem guardar seu texto em claro.
import hashlib
# Dependência: valores aleatórios adequados a desafios e convites.
import secrets
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction
# Dependência: tempo e utilitários compatíveis com a configuração Django.
from django.utils import timezone
# Dependência: consulta de objetos com resposta HTTP 404 padronizada.
from django.shortcuts import get_object_or_404
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import permissions, serializers, viewsets
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.decorators import action
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.exceptions import PermissionDenied
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.throttling import ScopedRateThrottle
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Workspace, WorkspaceInvitation


class WorkspaceData(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    class Meta:
        model = Workspace
        fields = ['id','name','owner','role','member_count','created_at']
        read_only_fields = ['id','owner','created_at']
    # Calcula o campo `role` de WorkspaceData usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: str ou str.
    def get_role(self,obj):
        return 'owner' if obj.owner_id == self.context['request'].user.id else 'member'
    # Calcula o campo `member_count` de WorkspaceData usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de obj.members.count(...).
    def get_member_count(self,obj):
        return obj.members.count()


class WorkspaceViewSet(viewsets.ModelViewSet):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceData
    http_method_names = ['get','post','patch','delete','head','options']
    # Define o conjunto de registros que esta view permite consultar, antes dos filtros e da serialização.
    # Retorno: resultado de Workspace.objects.filter(members=self.request.user).distinct().order_by(...).
    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user).distinct().order_by('name')
    # Associa os vínculos definidos pela view ao registro validado antes de persistir.
    # Parâmetros — serializer: serializer já validado pela view.
    # Retorno: None; o efeito está nas operações do corpo.
    def perform_create(self,serializer):
        with transaction.atomic():
            workspace=serializer.save(owner=self.request.user)
            workspace.members.add(self.request.user)
    # Interrompe a operação se o usuário da requisição não for o proprietário da equipe.
    # Parâmetros — workspace: instância da equipe.
    # Retorno: None; o efeito está nas operações do corpo.
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    def require_owner(self,workspace):
        if workspace.owner_id != self.request.user.id:
            raise PermissionDenied('Somente o administrador gerencia este espaço.')
    # Verifica as condições da atualização e salva os dados validados pelo serializer.
    # Parâmetros — serializer: serializer já validado pela view.
    # Retorno: None; o efeito está nas operações do corpo.
    def perform_update(self,serializer):
        self.require_owner(serializer.instance)
        serializer.save()
    # Apoio de WorkspaceViewSet: prepara os dados do cenário ou da operação `destroy` descrita pelas chamadas e verificações abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — *args: argumentos posicionais adicionais.
    # Parâmetros — **kwargs: argumentos nomeados adicionais.
    # Retorno: None; o efeito está nas operações do corpo.
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    def destroy(self,request,*args,**kwargs):
        # No deletion of a workspace containing other people's documents in this version.
        raise PermissionDenied('A exclusão do espaço não está disponível. Você pode renomeá-lo.')
    # Lista ou gerencia os membros no escopo da equipe verificada pela ação.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True,methods=['get','delete'])
    def members(self,request,pk=None):
        workspace=self.get_object()
        if request.method == 'DELETE':
            self.require_owner(workspace)
            user_id=serializers.IntegerField(min_value=1).run_validation(request.data.get('user_id'))
            if str(user_id)==str(workspace.owner_id):
                return Response({'detail':'O administrador não pode ser removido.'},status=400)
            with transaction.atomic():
                removed=User.objects.filter(pk=user_id).first()
                workspace.members.remove(user_id)
                if removed:
                    workspace.invitations.filter(email__iexact=removed.email,revoked_at__isnull=True).update(revoked_at=timezone.now())
        return Response([{'id':u.id,'name':u.first_name or u.username,'email':u.email,'role':'owner' if u.id==workspace.owner_id else 'member'} for u in workspace.members.order_by('username')])
    # Lista ou administra convites da equipe após verificar o papel exigido.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    @action(detail=True,methods=['get','post','delete'])
    def invitations(self,request,pk=None):
        workspace=self.get_object();self.require_owner(workspace)
        if request.method == 'POST':
            class Input(serializers.Serializer):
                email=serializers.EmailField()
            data=Input(data=request.data);data.is_valid(raise_exception=True)
            email=data.validated_data['email'].lower()
            if workspace.members.filter(email__iexact=email).exists():
                return Response({'detail':'Esta pessoa já faz parte do espaço.'},status=400)
            token=secrets.token_urlsafe(32)
            with transaction.atomic():
                workspace.invitations.filter(email__iexact=email,accepted_at__isnull=True,revoked_at__isnull=True).update(revoked_at=timezone.now())
                invite=WorkspaceInvitation.objects.create(workspace=workspace,email=email,token_hash=hashlib.sha256(token.encode()).hexdigest(),created_by=request.user,expires_at=timezone.now()+timedelta(days=7))
            return Response({'id':invite.id,'email':email,'token':token,'expires_at':invite.expires_at},status=201)
        if request.method == 'DELETE':
            invite=get_object_or_404(workspace.invitations,pk=serializers.IntegerField(min_value=1).run_validation(request.data.get('invitation_id')))
            invite.revoked_at=timezone.now();invite.save(update_fields=['revoked_at'])
        return Response([{'id':i.id,'email':i.email,'expires_at':i.expires_at,'expired':i.expires_at<=timezone.now()} for i in workspace.invitations.filter(accepted_at__isnull=True,revoked_at__isnull=True).order_by('-created_at')])


class AcceptInvitationView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope='auth'
    # Localiza o convite pelo token e verifica suas condições; o parâmetro lock permite bloqueio transacional.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — token: token de convite recebido pela URL.
    # Parâmetros — lock: booleano que solicita bloqueio de linha.
    # Retorno: invitation.
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    def invitation(self,request,token,lock=False):
        if len(token)>100:
            raise PermissionDenied('Convite inválido.')
        query=WorkspaceInvitation.objects.select_related('workspace')
        if lock:query=query.select_for_update()
        invitation=get_object_or_404(query,token_hash=hashlib.sha256(token.encode()).hexdigest())
        if invitation.revoked_at or invitation.expires_at<=timezone.now():
            raise PermissionDenied('Este convite expirou ou foi revogado. Solicite um novo link.')
        if invitation.email.lower()!=request.user.email.lower():
            raise PermissionDenied('Entre com a conta que possui o e-mail convidado para aceitar.')
        if invitation.accepted_by_id and invitation.accepted_by_id!=request.user.id:
            raise PermissionDenied('Este convite já foi utilizado.')
        return invitation
    # Atende GET em AcceptInvitationView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — token: token de convite recebido pela URL.
    # Retorno: resultado de Response(...).
    def get(self,request,token):
        invite=self.invitation(request,token)
        return Response({'name':invite.workspace.name,'expires_at':invite.expires_at,'accepted':bool(invite.accepted_at)})
    # Atende POST em AcceptInvitationView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — token: token de convite recebido pela URL.
    # Retorno: resultado de Response(...).
    def post(self,request,token):
        with transaction.atomic():
            invite=self.invitation(request,token,lock=True)
            invite.workspace.members.add(request.user)
            if not invite.accepted_at:
                invite.accepted_at=timezone.now();invite.accepted_by=request.user
                invite.save(update_fields=['accepted_at','accepted_by'])
        return Response(WorkspaceData(invite.workspace,context={'request':request}).data)
