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
    onboarding_status=models.CharField(max_length=12,default='pending',choices=[('pending','Pendente'),('completed','Concluído'),('skipped','Pulado'),('legacy','Conta anterior ao tour')])
    onboarding_finished_at=models.DateTimeField(null=True,blank=True)
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
            # Uma relação em cache pode estar antiga; editar o perfil não deve
            # sobrescrever o estado do tour ou a versão de sessão gravados por outra requisição.
            instance.settings.save(update_fields=['updated_at'])


class GoogleAccount(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="google_account")
    subject = models.CharField(max_length=255, unique=True)
    email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    """Aviso persistente de um evento confirmado, visível somente ao destinatário."""
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=160)
    message = models.TextField()
    path = models.CharField(max_length=250, blank=True, default='')
    read_at = models.DateTimeField(null=True, blank=True)
    release_version = models.CharField(max_length=40, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['recipient', 'read_at'], name='notification_recipient_read')]
        constraints = [
            models.UniqueConstraint(fields=['recipient', 'release_version'], name='notification_recipient_release'),
        ]


class TrainingDataConsent(models.Model):
    """Recibo de aceite do texto apresentado para dados de treinamento."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='training_data_consents')
    version = models.CharField(max_length=24)
    term_sha256 = models.CharField(max_length=64)
    accepted_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'version'], name='training_consent_user_version'),
        ]


class SupportReport(models.Model):
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="support_reports")
    subject = models.CharField(max_length=120, verbose_name="assunto")
    description = models.CharField(max_length=2000, verbose_name="descrição")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="recebido em")
    resolved = models.BooleanField(default=False, verbose_name="resolvido")

    class Meta:
        verbose_name = "relato de suporte"
        verbose_name_plural = "relatos de suporte"

    def __str__(self):
        return self.subject
