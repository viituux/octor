from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, serializers
from django.shortcuts import get_object_or_404
from guides.models import Guide
from guides.serializers import GuideDetailSerializer, StepSerializer
from .tasks import generate_steps, GenerationError


class GenerationRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(required=False, allow_blank=True, max_length=3000, default='')
    prompt_mode = serializers.ChoiceField(choices=['automatic', 'manual'], required=False)


class GenerateGuideTextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, guide_id, step_id=None):
        guide = get_object_or_404(Guide, id=guide_id, owner=request.user)
        step = get_object_or_404(guide.steps, id=step_id) if step_id is not None else None
        payload = GenerationRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            generate_steps(guide, payload.validated_data['prompt'], step=step, force_automatic_prompt=payload.validated_data.get('prompt_mode') == 'automatic')
        except GenerationError as error:
            return Response({'detail': str(error)}, status=503)
        serializer = StepSerializer(step, context={'request': request}) if step is not None else GuideDetailSerializer(guide, context={'request': request})
        return Response(serializer.data)


class PrepareNarrationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, guide_id):
        from .narration import prepare_narration
        guide = get_object_or_404(Guide, pk=guide_id, owner=request.user)
        class Payload(serializers.Serializer):
            step_id = serializers.IntegerField(required=False, min_value=1)
        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        sid = payload.validated_data.get('step_id')
        step = get_object_or_404(guide.steps, pk=sid) if sid else None
        try:
            count = prepare_narration(guide, step)
            return Response({'prepared':count})
        except GenerationError as error:
            return Response({'detail':str(error)}, status=503)
