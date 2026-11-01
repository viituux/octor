# Preferências e vínculo Google associados ao usuário Django; o sinal mantém as preferências disponíveis após salvar a conta.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import models
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models.signals import post_save
# Dependência: registro dos receptores de sinais do ciclo de persistência.
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

    # Fornece a representação textual do registro usada por administração e depuração.
    # Retorno: texto formatado.
    def __str__(self):
        return f"Configurações de {self.user.username}"


# Mantém o registro de preferências associado à conta após o sinal de salvamento do usuário.
# Parâmetros — sender: classe emissora do sinal Django.
# Parâmetros — instance: registro persistido a atualizar.
# Parâmetros — created: booleano que indica criação da conta.
# Parâmetros — **kwargs: argumentos nomeados adicionais.
# Retorno: None; o efeito está nas operações do corpo.
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
