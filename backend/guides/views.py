from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models.deletion import ProtectedError
from .models import Guide, Step, Workspace, GuideShare
from .permissions import OwnerWritesOthersRead, accessible_guides
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth.models import User
from .serializers import GuideListSerializer, GuideDetailSerializer, StepSerializer, WorkspaceSerializer


class GuideViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, OwnerWritesOthersRead]

    def get_queryset(self):
        query = accessible_guides(self.request.user).select_related('owner','workspace').prefetch_related('starred_by','shares')
        if self.action in ['restore','permanent_delete'] or self.request.query_params.get('trash') == '1':
            return query.filter(owner=self.request.user, trashed_at__isnull=False)
        if self.action == 'list' and self.request.query_params.get('include_trash') == '1':
            from django.db.models import Q
            return query.filter(Q(trashed_at__isnull=True) | Q(owner=self.request.user))
        return query.filter(trashed_at__isnull=True)

    def get_serializer_class(self):
        if self.action in ["retrieve", "create", "update", "partial_update"]:
            return GuideDetailSerializer
        return GuideListSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        instance.trashed_at = timezone.now()
        instance.save(update_fields=['trashed_at','updated_at'])

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        guide = self.get_object()
        guide.trashed_at = None
        guide.save(update_fields=['trashed_at','updated_at'])
        return Response(GuideListSerializer(guide, context={'request':request}).data)

    @action(detail=True, methods=['post'], url_path='permanent-delete')
    def permanent_delete(self, request, pk=None):
        try:self.get_object().delete()
        except ProtectedError:return Response({'detail':'Este guia é usado em um treinamento e precisa ser preservado para o histórico.'},status=409)
        return Response(status=204)

    @action(detail=True, methods=['post'])
    def favorite(self, request, pk=None):
        # Reading permission grants only this personal preference, never editing the guide.
        guide = get_object_or_404(self.get_queryset(), pk=pk)
        value = request.data.get('favorite')
        if not isinstance(value, bool):
            return Response({'detail':'Informe favorite como booleano.'}, status=400)
        if value: guide.starred_by.add(request.user)
        else: guide.starred_by.remove(request.user)
        return Response({'is_favorite':value})

    @action(detail=True, methods=['get','post','delete'])
    def share(self, request, pk=None):
        guide = self.get_object()
        if guide.owner_id != request.user.id:
            raise PermissionDenied('Somente o proprietário pode compartilhar este guia.')
        if request.method == 'POST':
            email = str(request.data.get('email','')).strip()
            user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
            if not user or user.id == request.user.id:
                return Response({'detail':'Informe o e-mail de outra pessoa cadastrada no Octo.'}, status=400)
            GuideShare.objects.get_or_create(guide=guide, user=user)
        elif request.method == 'DELETE':
            from rest_framework import serializers
            user_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('user_id'))
            GuideShare.objects.filter(guide=guide, user_id=user_id).delete()
        return Response([{'id':item.user_id,'name':item.user.first_name or item.user.username,'email':item.user.email} for item in guide.shares.select_related('user').all()])

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
    permission_classes = [permissions.IsAuthenticated, OwnerWritesOthersRead]
    serializer_class = StepSerializer
    http_method_names = ["get", "patch", "put", "delete"]

    def get_queryset(self):
        return Step.objects.filter(guide__in=accessible_guides(self.request.user).filter(trashed_at__isnull=True)).select_related('guide__owner','guide__workspace')
