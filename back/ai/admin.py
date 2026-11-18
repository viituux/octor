"""Gestão de consumo, tarifas, políticas e chaves; nenhum segredo aparece nos formulários GET."""
from django import forms
from django.contrib import admin
from django.db.models import Sum
from django.utils import timezone
from .credentials import protect, CredentialError
from .models import AIProviderKey, AIPolicy, AIPrice, AIUsage, AICircuit


class ProviderKeyForm(forms.ModelForm):
    secret=forms.CharField(label='Nova chave de API',required=False,widget=forms.PasswordInput(render_value=False),help_text='Não é exibida novamente. Deixe vazio para manter a chave existente.')

    class Meta:
        model=AIProviderKey
        exclude=['encrypted_secret']

    def clean(self):
        data=super().clean()
        secret=data.get('secret','')
        if not self.instance.pk and not secret:
            raise forms.ValidationError('Informe a chave completa.')
        if secret:
            try:self.instance.encrypted_secret=protect(secret)
            except CredentialError:
                raise forms.ValidationError('Configure OCTOR_AI_ENCRYPTION_KEY no backend antes de cadastrar chaves.') from None
        return data


@admin.register(AIProviderKey)
class ProviderKeyAdmin(admin.ModelAdmin):
    form=ProviderKeyForm
    list_display=['label','provider','model','project_ref','purpose','priority','active','backup_authorized']
    list_filter=['provider','purpose','active']
    search_fields=['label','model','project_ref']
    readonly_fields=['created_at']


@admin.register(AIPolicy)
class PolicyAdmin(admin.ModelAdmin):
    list_display=['scope','user','workspace','daily_tokens','monthly_tokens','monthly_budget_brl','enabled']
    list_filter=['scope','enabled']
    readonly_fields=['scope_key']


@admin.register(AIPrice)
class PriceAdmin(admin.ModelAdmin):
    list_display=['provider','model','operation','input_brl_per_million','output_brl_per_million','updated_at']
    list_filter=['provider','operation']
    readonly_fields=['updated_at']


@admin.register(AIUsage)
class UsageAdmin(admin.ModelAdmin):
    change_list_template='admin/ai_usage_list.html'
    list_display=['created_at','user','workspace','provider','model','operation','total_tokens','estimated_cost_brl','status','error_kind']
    list_filter=['provider','operation','status','created_at','workspace']
    search_fields=['user__username','model']
    readonly_fields=[f.name for f in AIUsage._meta.fields]
    date_hierarchy='created_at'

    def has_add_permission(self, request):return False
    def has_change_permission(self, request, obj=None):return False
    def has_delete_permission(self, request, obj=None):return False

    def changelist_view(self, request, extra_context=None):
        from .usage import boundaries
        day,month=boundaries()
        rows=AIUsage.objects.filter(created_at__gte=month)
        context={'month_total':rows.aggregate(n=Sum('total_tokens'))['n'] or 0,
                 'day_total':rows.filter(created_at__gte=day).aggregate(n=Sum('total_tokens'))['n'] or 0,
                 'unknown_count':rows.filter(status__in=['reserved','unknown']).count(),
                 'known_cost':rows.aggregate(n=Sum('estimated_cost_brl'))['n'] or 0}
        return super().changelist_view(request,dict(extra_context or {},**context))


@admin.register(AICircuit)
class CircuitAdmin(admin.ModelAdmin):
    list_display=['scope_key','failures','error_kind','blocked_until']
    readonly_fields=['scope_key','failures','error_kind','blocked_until']
    actions=['reset_circuit']
    def has_add_permission(self,request):return False
    def has_delete_permission(self,request,obj=None):return False

    @admin.action(description='Reabrir circuito após verificar a integração')
    def reset_circuit(self,request,queryset):
        queryset.update(failures=0,blocked_until=None,error_kind='')
