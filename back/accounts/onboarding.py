"""Preferência do tour por conta; não altera guias, sessões ou permissões."""
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions,serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import UserSettings
from collections.abc import Mapping


class OnboardingInput(serializers.Serializer):
    status=serializers.ChoiceField(choices=['completed','skipped'])
    def to_internal_value(self,data):
        if isinstance(data,Mapping) and set(data)-{'status'}:raise serializers.ValidationError({'non_field_errors':['Envie somente o estado do tour.']})
        return super().to_internal_value(data)


def state(settings):
    return {'user_id':settings.user_id,'status':settings.onboarding_status,'finished_at':settings.onboarding_finished_at}


class OnboardingView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def get(self,request):
        settings,_=UserSettings.objects.get_or_create(user=request.user)
        return Response(state(settings),headers={'Cache-Control':'private, no-store'})
    @transaction.atomic
    def post(self,request):
        form=OnboardingInput(data=request.data);form.is_valid(raise_exception=True)
        settings,_=UserSettings.objects.get_or_create(user=request.user)
        settings=UserSettings.objects.select_for_update().get(pk=settings.pk)
        desired=form.validated_data['status']
        # Reenvios preservam a data; rever/pular não desfaz uma conclusão anterior.
        if settings.onboarding_status!='completed' and settings.onboarding_status!=desired:
            settings.onboarding_status=desired;settings.onboarding_finished_at=timezone.now()
            settings.save(update_fields=['onboarding_status','onboarding_finished_at','updated_at'])
        return Response(state(settings),headers={'Cache-Control':'private, no-store'})
