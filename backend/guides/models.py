from django.db import models
from django.contrib.auth.models import User


class Workspace(models.Model):
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
    screenshot = models.ImageField(upload_to="screenshots/%Y/%m/%d/", null=True, blank=True)
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
