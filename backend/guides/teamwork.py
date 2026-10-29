from datetime import timedelta
import hashlib
import secrets
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from .models import Workspace, WorkspaceInvitation


class WorkspaceData(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    class Meta:
        model = Workspace
        fields = ['id','name','owner','role','member_count','created_at']
        read_only_fields = ['id','owner','created_at']
    def get_role(self,obj):
        return 'owner' if obj.owner_id == self.context['request'].user.id else 'member'
    def get_member_count(self,obj):
        return obj.members.count()


class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceData
    http_method_names = ['get','post','patch','delete','head','options']
    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user).distinct().order_by('name')
    def perform_create(self,serializer):
        with transaction.atomic():
            workspace=serializer.save(owner=self.request.user)
            workspace.members.add(self.request.user)
    def require_owner(self,workspace):
        if workspace.owner_id != self.request.user.id:
            raise PermissionDenied('Somente o administrador gerencia este espaço.')
    def perform_update(self,serializer):
        self.require_owner(serializer.instance)
        serializer.save()
    def destroy(self,request,*args,**kwargs):
        # No deletion of a workspace containing other people's documents in this version.
        raise PermissionDenied('A exclusão do espaço não está disponível. Você pode renomeá-lo.')
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
    permission_classes=[permissions.IsAuthenticated]
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='auth'
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
    def get(self,request,token):
        invite=self.invitation(request,token)
        return Response({'name':invite.workspace.name,'expires_at':invite.expires_at,'accepted':bool(invite.accepted_at)})
    def post(self,request,token):
        with transaction.atomic():
            invite=self.invitation(request,token,lock=True)
            invite.workspace.members.add(request.user)
            if not invite.accepted_at:
                invite.accepted_at=timezone.now();invite.accepted_by=request.user
                invite.save(update_fields=['accepted_at','accepted_by'])
        return Response(WorkspaceData(invite.workspace,context={'request':request}).data)
