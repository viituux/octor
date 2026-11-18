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
    """Credencial do servidor: o segredo cifrado nunca é retornado por serializers/admin."""
    label = models.CharField(max_length=100)
    provider = models.CharField(max_length=20, default='gemini', choices=[('gemini', 'Gemini'), ('openai', 'OpenAI')])
    model = models.CharField(max_length=120, blank=True, help_text='Vazio usa o modelo padrão do provedor.')
    project_ref = models.CharField(max_length=120, help_text='Identificação administrativa do projeto/cota, sem segredos.')
    purpose = models.CharField(max_length=20, default='all', choices=[('all','Todos'),('text','Instruções/quiz'),('manual','Manual por URL'),('speech','Voz')])
    encrypted_secret = models.TextField(editable=False)
    priority = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    backup_authorized = models.BooleanField(default=False, help_text='Reserva autorizada somente após falha de autenticação; nunca usada após 429/cota ou falha incerta.')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', 'id']

    def __str__(self):
        return self.label


class AIPrice(models.Model):
    """Preços em BRL por milhão, cadastrados pelos devs; ausência significa custo desconhecido."""
    provider = models.CharField(max_length=20, default='gemini')
    model = models.CharField(max_length=120)
    operation = models.CharField(max_length=20, default='text', choices=[('text','Texto/visão'),('speech','Voz')])
    input_brl_per_million = models.DecimalField(max_digits=14, decimal_places=6)
    output_brl_per_million = models.DecimalField(max_digits=14, decimal_places=6)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['provider','model','operation'],name='ai_price_model_operation')]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.input_brl_per_million < 0 or self.output_brl_per_million < 0:
            raise ValidationError('Os preços não podem ser negativos.')

    def __str__(self):
        return f'{self.provider} / {self.model} / {self.operation}'


class AIPolicy(models.Model):
    scope = models.CharField(max_length=20, default='default', choices=[('default','Padrão por usuário'),('system','Sistema inteiro'),('user','Usuário'),('workspace','Organização/espaço')])
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE)
    workspace = models.ForeignKey('guides.Workspace', null=True, blank=True, on_delete=models.CASCADE)
    scope_key = models.CharField(max_length=80, unique=True, editable=False)
    daily_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    monthly_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    monthly_budget_brl = models.DecimalField(max_digits=14,decimal_places=6,null=True,blank=True)
    alert_percent = models.PositiveSmallIntegerField(default=80)
    enabled = models.BooleanField(default=True)

    def clean(self):
        from django.core.exceptions import ValidationError
        if not 1 <= self.alert_percent <= 100:
            raise ValidationError('O alerta deve ficar entre 1 e 100%.')
        if (self.scope == 'user') != bool(self.user_id) or (self.scope == 'workspace') != bool(self.workspace_id):
            raise ValidationError('Selecione somente o usuário/espaço correspondente ao escopo.')
        if self.monthly_budget_brl is not None and self.monthly_budget_brl < 0:
            raise ValidationError('O orçamento não pode ser negativo.')

    def save(self, *args, **kwargs):
        self.scope_key = f'user:{self.user_id}' if self.scope == 'user' else f'workspace:{self.workspace_id}' if self.scope == 'workspace' else self.scope
        super().save(*args, **kwargs)

    def __str__(self):
        return self.scope_key or self.scope


class AIUsage(models.Model):
    """Uma tentativa de provedor, sem prompt, resposta, imagem ou credencial em texto."""
    import uuid
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    workspace = models.ForeignKey('guides.Workspace', null=True, on_delete=models.SET_NULL)
    provider = models.CharField(max_length=20)
    model = models.CharField(max_length=120)
    operation = models.CharField(max_length=40)
    credential_source = models.CharField(max_length=20, default='server')
    key = models.ForeignKey(AIProviderKey, null=True, blank=True, on_delete=models.SET_NULL)
    input_tokens = models.PositiveBigIntegerField(null=True)
    output_tokens = models.PositiveBigIntegerField(null=True)
    total_tokens = models.PositiveBigIntegerField(null=True)
    estimated_cost_brl = models.DecimalField(max_digits=18, decimal_places=8, null=True)
    reserved_tokens = models.PositiveBigIntegerField(default=0)
    reserved_cost_brl = models.DecimalField(max_digits=18, decimal_places=8, default=0)
    status = models.CharField(max_length=24,default='reserved')
    error_kind = models.CharField(max_length=32,blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user','created_at'],name='ai_usage_user_date'),models.Index(fields=['workspace','created_at'],name='ai_usage_workspace_date')]


class AICircuit(models.Model):
    """Circuito persistente por projeto/modelo; nunca contém a chave de API."""
    scope_key = models.CharField(max_length=180,unique=True)
    failures = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True,blank=True)
    error_kind = models.CharField(max_length=32,blank=True)
