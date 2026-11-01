# Biblioteca e edição de procedimentos: consultas respeitam o escopo de acesso; ações distinguem lixeira, restauração e exclusão definitiva.
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import viewsets, permissions, status
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.decorators import action
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: consulta de objetos com resposta HTTP 404 padronizada.
from django.shortcuts import get_object_or_404
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models.deletion import ProtectedError
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Guide, Step, Workspace, GuideShare
# Dependência: contratos e funções do módulo .permissions reutilizados neste fluxo.
from .permissions import OwnerWritesOthersRead, accessible_guides
# Dependência: tempo e utilitários compatíveis com a configuração Django.
from django.utils import timezone
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.exceptions import PermissionDenied
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import GuideListSerializer, GuideDetailSerializer, StepSerializer, WorkspaceSerializer


class GuideViewSet(viewsets.ModelViewSet):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated, OwnerWritesOthersRead]

    # Define o conjunto de registros que esta view permite consultar, antes dos filtros e da serialização.
    # Retorno: resultado de query.filter(...).
    def get_queryset(self):
        query = accessible_guides(self.request.user).select_related('owner','workspace').prefetch_related('starred_by','shares')
        if self.action in ['restore','permanent_delete'] or self.request.query_params.get('trash') == '1':
            return query.filter(owner=self.request.user, trashed_at__isnull=False)
        if self.action == 'list' and self.request.query_params.get('include_trash') == '1':
            # Dependência: modelos, consultas e transações do banco relacional.
            from django.db.models import Q
            return query.filter(Q(trashed_at__isnull=True) | Q(owner=self.request.user))
        return query.filter(trashed_at__isnull=True)

    # Seleciona o serializer adequado à operação da view.
    # Retorno: GuideDetailSerializer; GuideListSerializer.
    def get_serializer_class(self):
        if self.action in ["retrieve", "create", "update", "partial_update"]:
            return GuideDetailSerializer
        return GuideListSerializer

    # Associa os vínculos definidos pela view ao registro validado antes de persistir.
    # Parâmetros — serializer: serializer já validado pela view.
    # Retorno: None; o efeito está nas operações do corpo.
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    # Aplica a política de remoção da view ao registro autorizado.
    # Parâmetros — instance: registro persistido a atualizar.
    # Retorno: None; o efeito está nas operações do corpo.
    def perform_destroy(self, instance):
        instance.trashed_at = timezone.now()
        instance.save(update_fields=['trashed_at','updated_at'])

    # Retira o guia da lixeira no escopo autorizado da requisição.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        guide = self.get_object()
        guide.trashed_at = None
        guide.save(update_fields=['trashed_at','updated_at'])
        return Response(GuideListSerializer(guide, context={'request':request}).data)

    # Exclui definitivamente o guia respeitando as proteções de vínculos existentes.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True, methods=['post'], url_path='permanent-delete')
    def permanent_delete(self, request, pk=None):
        try:self.get_object().delete()
        except ProtectedError:return Response({'detail':'Este guia é usado em um treinamento e precisa ser preservado para o histórico.'},status=409)
        return Response(status=204)

    # Altera o favorito pessoal do usuário sem mudar os favoritos dos demais participantes.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True, methods=['post'])
    def favorite(self, request, pk=None):
        # A leitura permite alterar o favorito pessoal, mas não concede edição do procedimento.
        guide = get_object_or_404(self.get_queryset(), pk=pk)
        value = request.data.get('favorite')
        if not isinstance(value, bool):
            return Response({'detail':'Informe favorite como booleano.'}, status=400)
        if value: guide.starred_by.add(request.user)
        else: guide.starred_by.remove(request.user)
        return Response({'is_favorite':value})

    # Consulta ou altera o compartilhamento direto conforme a ação e a permissão de edição.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    @action(detail=True, methods=['get','post','delete'])
    def share(self, request, pk=None):
        guide = self.get_object()
        if guide.owner_id != request.user.id:
            raise PermissionDenied('Somente o proprietário pode compartilhar este guia.')
        if request.method == 'POST':
            email = str(request.data.get('email','')).strip()
            user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
            if not user or user.id == request.user.id:
                return Response({'detail':'Informe o e-mail de outra pessoa cadastrada no OCTOR.'}, status=400)
            GuideShare.objects.get_or_create(guide=guide, user=user)
        elif request.method == 'DELETE':
            # Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
            from rest_framework import serializers
            user_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('user_id'))
            GuideShare.objects.filter(guide=guide, user_id=user_id).delete()
        return Response([{'id':item.user_id,'name':item.user.first_name or item.user.username,'email':item.user.email} for item in guide.shares.select_related('user').all()])

    # Valida e adiciona um passo manual ao guia autorizado.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True, methods=["post"], url_path="steps")
    def add_step(self, request, pk=None):
        guide = self.get_object()
        data = request.data.copy()
        data["guide"] = guide.id
        
        # Se order não for passado, calcular próxima ordem
        if "order" not in data:
            last_order = guide.steps.order_by("-order").values_list("order", flat=True).first() or 0
            data["order"] = last_order + 1

        serializer = StepSerializer(data=data, context={"request": request})
        if serializer.is_valid():
            serializer.save(guide=guide)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # Valida os passos capturados e os grava em conjunto no guia da requisição.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    @action(detail=True, methods=["post"], url_path="bulk-steps")
    def bulk_steps(self, request, pk=None):
        """Permite que a extensão envie todos os passos de uma vez ao finalizar"""
        guide = self.get_object()
        steps_data = request.data.get("steps", [])
        if not isinstance(steps_data, list):
            return Response({"error": "O campo 'steps' deve ser uma lista."}, status=status.HTTP_400_BAD_REQUEST)

        if not steps_data:
            return Response({"error": "Envie pelo menos um passo."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            Guide.objects.select_for_update().get(pk=guide.pk)
            start_order = (guide.steps.order_by("-order").values_list("order", flat=True).first() or 0) + 1
            serializers_to_save = []
            errors = []
            for idx, step_data in enumerate(steps_data):
                if not isinstance(step_data, dict):
                    errors.append({"step_index": idx, "errors": "O passo deve ser um objeto."})
                    continue
                data = {**step_data, "guide": guide.id, "order": start_order + idx}
                serializer = StepSerializer(data=data, context={"request": request})
                if serializer.is_valid():
                    serializers_to_save.append(serializer)
                else:
                    errors.append({"step_index": idx, "errors": serializer.errors})
            if errors:
                return Response({"error": "Nenhum passo foi salvo. Corrija os dados e tente novamente.",
                                 "details": errors}, status=status.HTTP_400_BAD_REQUEST)
            steps = [serializer.save(guide=guide) for serializer in serializers_to_save]

        return Response({"created_count": len(steps),
                         "steps": StepSerializer(steps, many=True, context={"request": request}).data,
                         "errors": None}, status=status.HTTP_201_CREATED)



class StepViewSet(viewsets.ModelViewSet):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated, OwnerWritesOthersRead]
    serializer_class = StepSerializer
    http_method_names = ["get", "patch", "put", "delete"]

    # Define o conjunto de registros que esta view permite consultar, antes dos filtros e da serialização.
    # Retorno: resultado de Step.objects.filter(guide__in=accessible_guides(self.request.user).filter(trashed_at__isnull=True)).select_related(...).
    def get_queryset(self):
        return Step.objects.filter(guide__in=accessible_guides(self.request.user).filter(trashed_at__isnull=True)).select_related('guide__owner','guide__workspace')
