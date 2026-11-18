from django import forms
from django.contrib import admin

from .credentials import protect
from .models import AIProviderKey


class AIProviderKeyForm(forms.ModelForm):
    secret = forms.CharField(label="Nova chave", required=False, widget=forms.PasswordInput(render_value=False))

    class Meta:
        model = AIProviderKey
        exclude = ("encrypted_secret",)

    def clean(self):
        data = super().clean()
        if not self.instance.pk and not data.get("secret"):
            self.add_error("secret", "Informe a chave.")
        return data

    def save(self, commit=True):
        item = super().save(commit=False)
        if self.cleaned_data.get("secret"):
            item.encrypted_secret = protect(self.cleaned_data["secret"])
        if commit:
            item.save()
        return item


@admin.register(AIProviderKey)
class AIProviderKeyAdmin(admin.ModelAdmin):
    form = AIProviderKeyForm
    list_display = ("name", "provider", "model", "priority", "active", "backup_authorized", "updated_at")
    list_filter = ("provider", "active", "backup_authorized")
    search_fields = ("name", "model")
