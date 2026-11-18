"""Medição oficial e reserva transacional de limites. Nunca persiste conteúdo ou segredos."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from decimal import Decimal
from functools import wraps
import hashlib

from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework.exceptions import APIException
from .models import AIPolicy, AIPrice, AIUsage, AICircuit

_scope = ContextVar('octor_ai_scope', default={})

# Mensagem pública deliberadamente neutra. O diagnóstico técnico permanece em
# AIUsage.error_kind e no painel restrito aos desenvolvedores master.
PUBLIC_AI_UNAVAILABLE = 'Não foi possível concluir esta ação agora. Tente novamente em alguns instantes.'


class AIControlError(APIException):
    status_code = 429
    default_code = 'ai_limit'
    default_detail = PUBLIC_AI_UNAVAILABLE


@contextmanager
def usage_scope(user_id, workspace_id=None, operation='text', credential_source='server'):
    token = _scope.set(dict(user_id=user_id, workspace_id=workspace_id, operation=operation, credential_source=credential_source))
    try:
        yield
    finally:
        _scope.reset(token)


def scoped(operation, connection=False):
    """Propaga a autoria também aos workers; não depende de request/thread global."""
    def decorate(function):
        @wraps(function)
        def wrapped(owner, *args, **kwargs):
            source = 'server'
            if connection:
                from .credentials import connection_for
                item = connection_for(owner, actor=kwargs.get('actor'))
                if item and item.gemini_secret:
                    source = 'workspace' if owner.workspace_id else 'user'
            with usage_scope(kwargs['actor'].pk if kwargs.get('actor') is not None else owner.owner_id, getattr(owner, 'workspace_id', None), operation, source):
                return function(owner, *args, **kwargs)
        return wrapped
    return decorate


def boundaries():
    now = timezone.localtime()
    return now.replace(hour=0, minute=0, second=0, microsecond=0), now.replace(day=1,hour=0,minute=0,second=0,microsecond=0)


def applicable(scope):
    user = AIPolicy.objects.filter(scope='user', user_id=scope.get('user_id'), enabled=True).first()
    ids = list(AIPolicy.objects.filter(enabled=True, scope='system').values_list('id',flat=True))
    if user:
        ids.append(user.pk)
    else:
        ids.extend(AIPolicy.objects.filter(enabled=True,scope='default').values_list('id',flat=True))
    if scope.get('workspace_id'):
        ids.extend(AIPolicy.objects.filter(enabled=True,scope='workspace',workspace_id=scope['workspace_id']).values_list('id',flat=True))
    return AIPolicy.objects.filter(pk__in=ids).order_by('pk')


def scoped_rows(policy, scope):
    rows = AIUsage.objects.all()
    if policy.scope in ('user','default'):
        rows = rows.filter(user_id=policy.user_id if policy.scope=='user' else scope.get('user_id'))
    elif policy.scope == 'workspace':
        rows = rows.filter(workspace_id=policy.workspace_id)
    return rows


def totals(rows):
    data = rows.aggregate(tokens=Sum('total_tokens'), reserved=Sum('reserved_tokens'), cost=Sum('estimated_cost_brl'), held=Sum('reserved_cost_brl'))
    return int(data['tokens'] or 0) + int(data['reserved'] or 0), (data['cost'] or Decimal(0)) + (data['held'] or Decimal(0))


def pricing(provider, model, operation):
    return AIPrice.objects.filter(provider=provider,model=model,operation='speech' if operation=='speech' else 'text').first()


def price_value(rate, input_tokens, output_tokens):
    if rate is None or input_tokens is None or output_tokens is None:
        return None
    return (Decimal(input_tokens)*rate.input_brl_per_million + Decimal(output_tokens)*rate.output_brl_per_million) / Decimal(1000000)


def official_usage(data, provider='gemini'):
    """Não inventa tokens quando a API não retorna métricas; inclui reasoning no total."""
    if not isinstance(data, dict):
        return None, None, None
    meta = data.get('usageMetadata') or data.get('usage_metadata') or data.get('usage') or {}
    if not isinstance(meta,dict):
        return None,None,None
    def number(*keys):
        for key in keys:
            value=meta.get(key)
            if type(value) is int and value >= 0:
                return value
        return None
    incoming = number('promptTokenCount','prompt_token_count','prompt_tokens','input_tokens','total_input_tokens')
    total = number('totalTokenCount','total_token_count','total_tokens')
    outgoing = number('candidatesTokenCount','candidates_token_count','completion_tokens','output_tokens','total_output_tokens')
    thoughts = number('thoughtsTokenCount','thoughts_token_count')
    if total is not None and incoming is not None and total >= incoming:
        outgoing = total-incoming
    elif incoming is not None and outgoing is not None:
        outgoing += thoughts or 0
        total = incoming+outgoing
    return incoming,outgoing,total


class Lease:
    def __init__(self, provider, model, max_output, count_input, key=None):
        self.scope = dict(_scope.get())
        self.rate = pricing(provider, model, self.scope.get('operation','text'))
        policies = applicable(self.scope)
        input_tokens = count_input() if policies.exists() else 0
        if policies.exists() and (type(input_tokens) is not int or input_tokens < 0):
            raise AIControlError('Não foi possível verificar os tokens de entrada. A geração não foi enviada.')
        reserve = input_tokens + max_output if policies.exists() else 0
        held = price_value(self.rate,input_tokens,max_output) or Decimal(0)
        day, month = boundaries()
        with transaction.atomic():
            # Mesma ordem de bloqueio em todos os processos e workers.
            for policy in policies.select_for_update():
                rows=scoped_rows(policy,self.scope)
                daily,_=totals(rows.filter(created_at__gte=day))
                monthly,cost=totals(rows.filter(created_at__gte=month))
                if policy.daily_tokens is not None and daily+reserve>policy.daily_tokens:
                    raise AIControlError('O limite diário de IA não comporta esta geração. Aguarde a renovação ou contate o responsável.')
                if policy.monthly_tokens is not None and monthly+reserve>policy.monthly_tokens:
                    raise AIControlError('O limite mensal de IA não comporta esta geração. Consulte Meu consumo de IA.')
                if policy.monthly_budget_brl is not None:
                    if self.rate is None:
                        raise AIControlError('O preço deste modelo precisa ser configurado pelo administrador antes de usar o orçamento de IA.')
                    if cost+held>policy.monthly_budget_brl:
                        raise AIControlError('O orçamento mensal de IA não comporta esta geração. Contate o responsável.')
            self.record = AIUsage.objects.create(**self.scope,provider=provider,model=model,key=key,
                reserved_tokens=reserve,reserved_cost_brl=held)

    def finish(self, data=None, error_kind='', rejected=False):
        incoming,outgoing,total = official_usage(data)
        measured=total is not None
        updated = AIUsage.objects.filter(pk=self.record.pk,status='reserved').update(
            input_tokens=incoming,output_tokens=outgoing,total_tokens=total,
            estimated_cost_brl=price_value(self.rate,incoming,outgoing),
            reserved_tokens=0 if measured or rejected else self.record.reserved_tokens,
            reserved_cost_brl=0 if measured or rejected else self.record.reserved_cost_brl,
            status='measured' if measured else 'rejected' if rejected else 'unknown',
            error_kind=error_kind,finished_at=timezone.now())
        if updated and measured and self.scope.get('user_id'):
            self.notify()

    def notify(self):
        from accounts.models import Notification
        day,month=boundaries()
        for policy in applicable(self.scope):
            rows=scoped_rows(policy,self.scope)
            daily,_=totals(rows.filter(created_at__gte=day));monthly,cost=totals(rows.filter(created_at__gte=month))
            ratios=[used/limit for used,limit in [(daily,policy.daily_tokens),(monthly,policy.monthly_tokens),(cost,policy.monthly_budget_brl)] if limit]
            if ratios and max(ratios)*100 >= policy.alert_percent:
                label=hashlib.sha256(f'{policy.pk}:{day.date()}'.encode()).hexdigest()[:24]
                Notification.objects.get_or_create(recipient_id=self.scope['user_id'],release_version='ai:'+label,
                    defaults={'kind':'ai_usage_alert','title':'Atenção ao consumo de IA','message':'Seu consumo está próximo ou acima do limite configurado. Confira Meu consumo de IA.','path':'/account'})


def circuit_check(scope_key):
    if AICircuit.objects.filter(scope_key=scope_key,blocked_until__gt=timezone.now()).exists():
        raise AIControlError(PUBLIC_AI_UNAVAILABLE)


def circuit_result(scope_key, status):
    with transaction.atomic():
        circuit,_=AICircuit.objects.get_or_create(scope_key=scope_key)
        circuit=AICircuit.objects.select_for_update().get(pk=circuit.pk)
        if 200<=status<300:
            circuit.failures=0;circuit.blocked_until=None;circuit.error_kind=''
        elif status==429 or status>=500:
            circuit.failures+=1;circuit.error_kind='rate_or_quota' if status==429 else 'unavailable'
            if status==429 or circuit.failures>=settings.AI_CIRCUIT_FAILURES:
                circuit.blocked_until=timezone.now()+timedelta(seconds=settings.AI_CIRCUIT_SECONDS)
        circuit.save()
