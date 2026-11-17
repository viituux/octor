# Treinamentos, avaliações e quiz versionado; versões legadas não exigem quiz retroativamente.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import models
# Dependência: acesso às configurações carregadas no servidor.
from django.conf import settings
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models import Q
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible
import uuid


@deconstructible
class TrainingArchiveStorage(FileSystemStorage):
    """Arquivos publicados não compartilham o ciclo de exclusão da mídia dos guias."""
    def __init__(self):super().__init__(location=settings.BASE_DIR/'private_trainings')


class Training(models.Model):
    guide=models.ForeignKey('guides.Guide',on_delete=models.PROTECT,related_name='trainings')
    owner=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='owned_trainings')
    workspace=models.ForeignKey('guides.Workspace',on_delete=models.PROTECT,null=True,blank=True)
    title=models.CharField(max_length=255)
    description=models.TextField(blank=True)
    status=models.CharField(max_length=12,default='draft',choices=[('draft','Rascunho'),('published','Publicado'),('archived','Arquivado')])
    # max_attempts é legado; o limite ativo fica na participação. draft_questions é editável pelo gestor.
    max_attempts=models.PositiveSmallIntegerField(default=1)
    draft_questions=models.JSONField(default=list,blank=True)
    document_profile = models.JSONField(default=dict, blank=True)
    current_version=models.ForeignKey('QuizVersion',on_delete=models.SET_NULL,null=True,blank=True,related_name='+')
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    class Meta:
        ordering=['-created_at']
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.CheckConstraint(condition=Q(max_attempts__gte=1,max_attempts__lte=5),name='training_attempt_limit')]


# Nome histórico mantido: snapshot do procedimento e suas perguntas publicadas.
class QuizVersion(models.Model):
    label=models.CharField(max_length=40,blank=True,default='')
    snapshot_schema=models.PositiveSmallIntegerField(default=1)
    integrity_sha256=models.CharField(max_length=64,blank=True,default='')
    app_version=models.CharField(max_length=40,default='legacy/unknown')
    release_notes=models.CharField(max_length=1000,blank=True,default='')
    published_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='published_training_versions')
    requires_quiz=models.BooleanField(default=False)
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='versions')
    number=models.PositiveIntegerField()
    content=models.JSONField(default=dict)
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['training','number'],name='unique_training_version')]


class Participation(models.Model):
    approved_at = models.DateTimeField(null=True, blank=True, editable=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, editable=False, related_name='+')
    identity_snapshot=models.JSONField(default=dict,blank=True)
    content_completed_at=models.DateTimeField(null=True,blank=True)
    quiz_attempt_limit=models.PositiveSmallIntegerField(default=1)
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='participations')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='training_participations')
    version=models.ForeignKey(QuizVersion,on_delete=models.PROTECT,null=True,blank=True)
    assigned_at=models.DateTimeField(auto_now_add=True)
    started_at=models.DateTimeField(null=True,blank=True)
    completed_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['training','user'],name='unique_training_participant')]


# Perguntas/resultados legados são preservados; requires_quiz separa o fluxo atual.
class QuizQuestion(models.Model):
    version=models.ForeignKey(QuizVersion,on_delete=models.CASCADE,related_name='questions')
    statement=models.TextField(max_length=1500)
    explanation=models.TextField(max_length=1500,blank=True)
    order=models.PositiveSmallIntegerField()
    class Meta:
        ordering=['order']
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['version','order'],name='unique_version_question_order')]


class QuizAlternative(models.Model):
    question=models.ForeignKey(QuizQuestion,on_delete=models.CASCADE,related_name='alternatives')
    text=models.CharField(max_length=500)
    correct=models.BooleanField(default=False)
    order=models.PositiveSmallIntegerField()
    class Meta:
        ordering=['order']
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['question','order'],name='unique_question_alternative_order')]


class QuizResult(models.Model):
    duration_ms=models.PositiveBigIntegerField(default=0)
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='results')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='quiz_results')
    version=models.ForeignKey(QuizVersion,on_delete=models.PROTECT)
    attempt=models.PositiveSmallIntegerField(default=1)
    correct_count=models.PositiveSmallIntegerField(default=0)
    score=models.PositiveIntegerField(default=0)
    time_seconds=models.PositiveIntegerField(default=0)
    started_at=models.DateTimeField(auto_now_add=True)
    finished_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-started_at']
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['training','user','attempt'],name='unique_training_user_attempt')]


class QuizAnswer(models.Model):
    result=models.ForeignKey(QuizResult,on_delete=models.CASCADE,related_name='answers')
    question=models.ForeignKey(QuizQuestion,on_delete=models.PROTECT)
    alternative=models.ForeignKey(QuizAlternative,on_delete=models.PROTECT)
    correct=models.BooleanField()
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['result','question'],name='unique_quiz_answer')]
        ordering=['question__order']


class Feedback(models.Model):
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='feedbacks')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='training_feedbacks')
    stars=models.PositiveSmallIntegerField()
    comment=models.CharField(max_length=500,blank=True,default='')
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering=['-created_at']
        # list: garantias aplicadas pelo banco, inclusive em submissões concorrentes.
        constraints=[models.UniqueConstraint(fields=['training','user'],name='unique_training_feedback'),models.CheckConstraint(condition=Q(stars__gte=1,stars__lte=5),name='feedback_valid_stars')]


class TrainingAsset(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
    version=models.ForeignKey(QuizVersion,on_delete=models.PROTECT,related_name='assets')
    file=models.FileField(storage=TrainingArchiveStorage(),upload_to='versions/%Y/%m/%d/')
    mime_type=models.CharField(max_length=100)
    sha256=models.CharField(max_length=64)


class TrainingAudit(models.Model):
    """Eventos inseridos pelo servidor, encadeados por publicação ou participação."""
    training=models.ForeignKey(Training,on_delete=models.PROTECT,related_name='audit_events')
    participation=models.ForeignKey(Participation,on_delete=models.PROTECT,null=True,blank=True,related_name='audit_events')
    actor=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    stream=models.CharField(max_length=80)
    sequence=models.PositiveIntegerField()
    kind=models.CharField(max_length=50)
    recorded_at=models.DateTimeField()
    payload=models.JSONField(default=dict)
    previous_hash=models.CharField(max_length=64,blank=True)
    event_hash=models.CharField(max_length=64)
    class Meta:
        ordering=['sequence']
        constraints=[models.UniqueConstraint(fields=['stream','sequence'],name='unique_training_audit_sequence')]
