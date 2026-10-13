from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Guide, Step, Workspace
from .serializers import GuideListSerializer, GuideDetailSerializer, StepSerializer, WorkspaceSerializer


class GuideViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Guide.objects.filter(owner=self.request.user)

    def get_serializer_class(self):
        if self.action in ["retrieve", "create", "update", "partial_update"]:
            return GuideDetailSerializer
        return GuideListSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

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

        created_steps = []
        errors = []
        start_order = (guide.steps.order_by("-order").values_list("order", flat=True).first() or 0) + 1

        for idx, step_data in enumerate(steps_data):
            step_data_copy = step_data.copy() if hasattr(step_data, "copy") else dict(step_data)
            step_data_copy["guide"] = guide.id
            if "order" not in step_data_copy:
                step_data_copy["order"] = start_order + idx

            serializer = StepSerializer(data=step_data_copy, context={"request": request})
            if serializer.is_valid():
                step = serializer.save(guide=guide)
                created_steps.append(StepSerializer(step, context={"request": request}).data)
            else:
                errors.append({"step_index": idx, "errors": serializer.errors})
                print(f"Erro de validação no passo {idx}:", serializer.errors)

        if errors and not created_steps:
            return Response({"error": "Falha ao validar passos.", "details": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "created_count": len(created_steps),
            "steps": created_steps,
            "errors": errors if errors else None
        }, status=status.HTTP_201_CREATED)


class StepViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StepSerializer
    http_method_names = ["get", "patch", "put", "delete"]

    def get_queryset(self):
        return Step.objects.filter(guide__owner=self.request.user)
