from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from guides.models import Guide
from .models import VideoJob
from .serializers import VideoJobSerializer


class CreateVideoJobView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
            from .tasks import generate_video_pipeline_task
            generate_video_pipeline_task.delay(job.id)
        except Exception:
            pass

        serializer = VideoJobSerializer(job, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VideoJobDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VideoJobSerializer
    queryset = VideoJob.objects.all()

    def get_queryset(self):
        return VideoJob.objects.filter(guide__owner=self.request.user)
