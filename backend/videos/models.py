from django.db import models
from guides.models import Guide


class VideoJob(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pendente"),
        ("generating_audio", "Gerando Áudio"),
        ("generating_subtitles", "Gerando Legendas"),
        ("generating_avatar", "Gerando Avatar"),
        ("rendering", "Renderizando Vídeo"),
        ("completed", "Concluído"),
        ("failed", "Falhou"),
    ]

    guide = models.ForeignKey(Guide, on_delete=models.CASCADE, related_name="video_jobs")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending")
    voice = models.CharField(max_length=100, default="default")
    language = models.CharField(max_length=10, default="pt-BR")
    avatar = models.CharField(max_length=100, blank=True, default="")
    video_file = models.FileField(upload_to="videos/%Y/%m/%d/", null=True, blank=True)
    progress = models.PositiveIntegerField(default=0)  # 0 a 100
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"VideoJob {self.id} ({self.status}) - Guia: {self.guide.title}"
