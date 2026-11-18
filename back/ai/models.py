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


class AIProviderKey(models.Model):
    """Credencial global administrada pelos desenvolvedores, nunca enviada ao cliente."""
    PROVIDERS = (("gemini", "Google Gemini"), ("openai", "OpenAI"))

    name = models.CharField(max_length=100, unique=True)
    provider = models.CharField(max_length=20, choices=PROVIDERS)
    encrypted_secret = models.TextField()
    model = models.CharField(max_length=120, blank=True)
    priority = models.PositiveSmallIntegerField(default=100)
    active = models.BooleanField(default=True)
    backup_authorized = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("priority", "id")

    def __str__(self):
        return f"{self.name} ({self.provider})"
