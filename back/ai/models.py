"""Credenciais de IA criptografadas, isoladas por conta pessoal ou espaço."""
from django.conf import settings
from django.db import models
from django.db.models import Q


class AIConnection(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True)
    workspace = models.OneToOneField('guides.Workspace', on_delete=models.CASCADE, null=True)
    gemini_secret = models.TextField(blank=True)
    elevenlabs_secret = models.TextField(blank=True)
    voice_id = models.CharField(max_length=64, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(Q(user__isnull=False, workspace__isnull=True)
                           | Q(user__isnull=True, workspace__isnull=False)),
                name='ai_connection_exactly_one_scope',
            ),
        ]
