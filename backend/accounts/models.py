from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserSettings(models.Model):
    LLM_PROVIDERS = [
        ("gemini", "Google Gemini"),
        ("openai", "OpenAI (GPT-4o)"),
        ("anthropic", "Anthropic Claude"),
    ]

    TTS_PROVIDERS = [
        ("gemini", "Google Gemini Audio"),
        ("openai", "OpenAI TTS"),
        ("elevenlabs", "ElevenLabs"),
    ]

    session_version = models.PositiveIntegerField(default=0)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="settings")
    llm_provider = models.CharField(max_length=30, choices=LLM_PROVIDERS, default="gemini")
    llm_api_key = models.CharField(max_length=255, blank=True, default="")
    tts_provider = models.CharField(max_length=30, choices=TTS_PROVIDERS, default="gemini")
    tts_api_key = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Configurações de {self.user.username}"


@receiver(post_save, sender=User)
def create_or_update_user_settings(sender, instance, created, **kwargs):
    if created:
        UserSettings.objects.create(user=instance)
    else:
        if hasattr(instance, "settings"):
            instance.settings.save()


class GoogleAccount(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="google_account")
    subject = models.CharField(max_length=255, unique=True)
    email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
