# Criação e consulta autenticadas de tarefas de vídeo vinculadas aos guias do usuário.
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import generics, permissions, status
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: consulta de objetos com resposta HTTP 404 padronizada.
from django.shortcuts import get_object_or_404
# Dependência: contratos e funções do módulo guides.models reutilizados neste fluxo.
from guides.models import Guide
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import VideoJob
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import VideoJobSerializer


class CreateVideoJobView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]

    # Atende POST em CreateVideoJobView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — guide_id: identificador do guia.
    # Retorno: resultado de Response(...).
    def post(self, request, guide_id):
        guide = get_object_or_404(Guide, id=guide_id, owner=request.user)
        voice = request.data.get("voice", "default")
        language = request.data.get("language", guide.language or "pt-BR")
        avatar = request.data.get("avatar", "")

        job = VideoJob.objects.create(
            guide=guide,
            voice=voice,
            language=language,
            avatar=avatar,
            status="pending",
            progress=0,
        )

        # Trigger celery task if celery is active, or queued
        try:
            # Dependência: contratos e funções do módulo .tasks reutilizados neste fluxo.
            from .tasks import generate_video_pipeline_task
            generate_video_pipeline_task.delay(job.id)
        except Exception:
            pass

        serializer = VideoJobSerializer(job, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VideoJobDetailView(generics.RetrieveAPIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VideoJobSerializer
    queryset = VideoJob.objects.all()

    # Define o conjunto de registros que esta view permite consultar, antes dos filtros e da serialização.
    # Retorno: resultado de VideoJob.objects.filter(...).
    def get_queryset(self):
        return VideoJob.objects.filter(guide__owner=self.request.user)
