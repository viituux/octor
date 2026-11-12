"""Coleta de telas e rascunhos de manuais; imagens brutas ficam fora da mídia pública."""
import uuid
from django.conf import settings
from django.db import models
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible

@deconstructible
class PrivateManualStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(location=settings.BASE_DIR / 'private_manuals')

class ManualRun(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
    owner=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='manual_runs')
    url=models.URLField(max_length=2000)
    objective=models.CharField(max_length=1000)
    status=models.CharField(max_length=20,default='waiting')
    message=models.CharField(max_length=500,blank=True,default='')
    document=models.JSONField(default=dict,blank=True)
    guide=models.ForeignKey('guides.Guide',on_delete=models.SET_NULL,null=True,blank=True)
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    class Meta:
        ordering=['-created_at']

class ManualCapture(models.Model):
    run=models.ForeignKey(ManualRun,on_delete=models.CASCADE,related_name='captures')
    key=models.CharField(max_length=80)
    order=models.PositiveSmallIntegerField()
    url=models.URLField(max_length=2000)
    title=models.CharField(max_length=200)
    evidence=models.JSONField(default=dict)
    screenshot=models.ImageField(storage=PrivateManualStorage(),upload_to='captures/%Y/%m/%d/')
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering=['order','id']
        constraints=[models.UniqueConstraint(fields=['run','key'],name='unique_manual_capture_key'),models.UniqueConstraint(fields=['run','order'],name='unique_manual_capture_order')]
