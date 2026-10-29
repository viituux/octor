from django.db import models
from django.contrib.auth.models import User


class Workspace(models.Model):
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_workspaces")
    name = models.CharField(max_length=255)
    members = models.ManyToManyField(User, related_name="workspaces")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Guide(models.Model):
    STATUS_CHOICES = [
        ("draft", "Rascunho"),
        ("published", "Publicado"),
        ("archived", "Arquivado"),
    ]

    title = models.CharField(max_length=255, default="Novo Guia")
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    trashed_at = models.DateTimeField(null=True, blank=True)
    starred_by = models.ManyToManyField(User, blank=True, related_name="starred_guides")
    capture_audio = models.FileField(upload_to="capture_audio/%Y/%m/%d/", null=True, blank=True)
    language = models.CharField(max_length=10, default="pt-BR")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="guides")
    workspace = models.ForeignKey(
        Workspace, on_delete=models.SET_NULL, null=True, blank=True, related_name="guides"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Step(models.Model):
    guide = models.ForeignKey(Guide, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveIntegerField(default=1)
    text = models.TextField(blank=True, default="")
    generation_prompt = models.TextField(blank=True, default="", max_length=3000)
    screenshot = models.ImageField(upload_to="screenshots/%Y/%m/%d/", null=True, blank=True)
    narration = models.FileField(upload_to="narrations/%Y/%m/%d/", null=True, blank=True)
    selector = models.TextField(blank=True, default="")
    url = models.CharField(max_length=2000, blank=True, default="")
    click_x = models.FloatField(null=True, blank=True)
    click_y = models.FloatField(null=True, blank=True)
    element_text = models.CharField(max_length=500, blank=True, default="")
    action_type = models.CharField(max_length=50, default="click")  # click, input, change, navigation
    input_value = models.TextField(blank=True, default="")
    annotations = models.JSONField(default=list, blank=True)  # Setas, destaques, blur
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Passo {self.order} do Guia '{self.guide.title}'"


class GuideShare(models.Model):
    guide = models.ForeignKey(Guide, on_delete=models.CASCADE, related_name='shares')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_guides')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['guide','user'], name='unique_guide_recipient')]


class WorkspaceInvitation(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='invitations')
    email = models.EmailField()
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspace_invitations_sent')
    expires_at = models.DateTimeField()
    accepted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='accepted_invitations')
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
