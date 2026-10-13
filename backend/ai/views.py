from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from guides.models import Guide
from guides.serializers import GuideDetailSerializer
from .tasks import generate_step_texts_task


class GenerateGuideTextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, guide_id):
        guide = get_object_or_404(Guide, id=guide_id, owner=request.user)

        # Executa geração dos passos
        last_error = generate_step_texts_task(guide.id)

        guide.refresh_from_db()
        serializer = GuideDetailSerializer(guide, context={"request": request})
        res_data = serializer.data
        if last_error:
            res_data["ai_warning"] = last_error

        return Response(res_data, status=status.HTTP_200_OK)
