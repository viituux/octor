from django.db import models
from django.conf import settings
from django.db.models import Q


class Training(models.Model):
    guide=models.ForeignKey('guides.Guide',on_delete=models.PROTECT,related_name='trainings')
    owner=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='owned_trainings')
    workspace=models.ForeignKey('guides.Workspace',on_delete=models.PROTECT,null=True,blank=True)
    title=models.CharField(max_length=255)
    description=models.TextField(blank=True)
    status=models.CharField(max_length=12,default='draft',choices=[('draft','Rascunho'),('published','Publicado'),('archived','Arquivado')])
    max_attempts=models.PositiveSmallIntegerField(default=1)
    draft_questions=models.JSONField(default=list,blank=True)
    current_version=models.ForeignKey('QuizVersion',on_delete=models.SET_NULL,null=True,blank=True,related_name='+')
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    class Meta:
        ordering=['-created_at']
        constraints=[models.CheckConstraint(condition=Q(max_attempts__gte=1,max_attempts__lte=5),name='training_attempt_limit')]


class QuizVersion(models.Model):
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='versions')
    number=models.PositiveIntegerField()
    content=models.JSONField(default=dict)
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['training','number'],name='unique_training_version')]


class Participation(models.Model):
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='participations')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='training_participations')
    version=models.ForeignKey(QuizVersion,on_delete=models.PROTECT,null=True,blank=True)
    assigned_at=models.DateTimeField(auto_now_add=True)
    started_at=models.DateTimeField(null=True,blank=True)
    completed_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['training','user'],name='unique_training_participant')]


class QuizQuestion(models.Model):
    version=models.ForeignKey(QuizVersion,on_delete=models.CASCADE,related_name='questions')
    statement=models.TextField(max_length=1500)
    explanation=models.TextField(max_length=1500,blank=True)
    order=models.PositiveSmallIntegerField()
    class Meta:
        ordering=['order']
        constraints=[models.UniqueConstraint(fields=['version','order'],name='unique_version_question_order')]


class QuizAlternative(models.Model):
    question=models.ForeignKey(QuizQuestion,on_delete=models.CASCADE,related_name='alternatives')
    text=models.CharField(max_length=500)
    correct=models.BooleanField(default=False)
    order=models.PositiveSmallIntegerField()
    class Meta:
        ordering=['order']
        constraints=[models.UniqueConstraint(fields=['question','order'],name='unique_question_alternative_order')]


class QuizResult(models.Model):
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='results')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='quiz_results')
    version=models.ForeignKey(QuizVersion,on_delete=models.PROTECT)
    attempt=models.PositiveSmallIntegerField(default=1)
    correct_count=models.PositiveSmallIntegerField(default=0)
    score=models.PositiveIntegerField(default=0)
    time_seconds=models.PositiveIntegerField(default=0)
    started_at=models.DateTimeField(auto_now_add=True)
    finished_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-started_at']
        constraints=[models.UniqueConstraint(fields=['training','user','attempt'],name='unique_training_user_attempt')]


class QuizAnswer(models.Model):
    result=models.ForeignKey(QuizResult,on_delete=models.CASCADE,related_name='answers')
    question=models.ForeignKey(QuizQuestion,on_delete=models.PROTECT)
    alternative=models.ForeignKey(QuizAlternative,on_delete=models.PROTECT)
    correct=models.BooleanField()
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['result','question'],name='unique_quiz_answer')]
        ordering=['question__order']


class Feedback(models.Model):
    training=models.ForeignKey(Training,on_delete=models.CASCADE,related_name='feedbacks')
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='training_feedbacks')
    stars=models.PositiveSmallIntegerField()
    comment=models.CharField(max_length=500,blank=True,default='')
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering=['-created_at']
        constraints=[models.UniqueConstraint(fields=['training','user'],name='unique_training_feedback'),models.CheckConstraint(condition=Q(stars__gte=1,stars__lte=5),name='feedback_valid_stars')]
