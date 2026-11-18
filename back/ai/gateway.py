"""Adaptadores medidos. Só há repetição automática antes da conexão ou após HTTP 401."""
import hashlib
import time
from contextlib import nullcontext
import requests
from django.conf import settings
from .credentials import reveal
from .models import AIProviderKey
from .usage import Lease, AIControlError, PUBLIC_AI_UNAVAILABLE, _scope, circuit_check, circuit_result


def purpose():
    operation=_scope.get().get('operation','text')
    return 'manual' if operation.startswith('manual') else 'speech' if operation=='speech' else 'text'


def server_key(default='', target='text', provider='gemini'):
    item=AIProviderKey.objects.filter(active=True,provider=provider,purpose__in=['all',target]).order_by('priority','pk').first()
    return reveal(item.encrypted_secret) if item else default


def provider_options(target='text'):
    """Provedores habilitados por prioridade; reservas exigem autorização explícita."""
    rows=list(AIProviderKey.objects.filter(active=True,purpose__in=['all',target]).order_by('priority','pk'))
    options=[];seen=set()
    for item in rows:
        if item.provider in seen or (options and not item.backup_authorized):
            continue
        seen.add(item.provider)
        default_model=settings.GEMINI_MODEL if item.provider=='gemini' else settings.OPENAI_MODEL
        options.append((item.provider,reveal(item.encrypted_secret),item.model or default_model,item))
    if not options:
        if settings.GEMINI_API_KEY:
            options.append(('gemini',settings.GEMINI_API_KEY,settings.GEMINI_MODEL,None))
        if settings.OPENAI_API_KEY:
            options.append(('openai',settings.OPENAI_API_KEY,settings.OPENAI_MODEL,None))
    return options


def candidates(default, provider):
    # Nunca usa o pool dos devs como fallback para uma chave própria do usuário/espaço.
    if provider not in ('gemini','openai') or _scope.get().get('credential_source','server')!='server':
        return [(default,None)]
    keys=list(AIProviderKey.objects.filter(active=True,provider=provider,purpose__in=['all',purpose()]).order_by('priority','pk'))
    if not keys:
        return [(default,None)]
    first=keys[0]
    # A reserva pode pertencer a outro projeto, mas só será tentada após HTTP 401,
    # que ocorre antes do processamento. Nunca rotacionamos por 403, 429/cota,
    # timeout ou 5xx, pois nesses casos repetir poderia burlar limites ou duplicar custo.
    return [(reveal(k.encrypted_secret),k) for k in keys if k==first or k.backup_authorized]


def circuit_id(provider,model,key,item):
    identity=item.project_ref if item else hashlib.sha256(key.encode()).hexdigest()
    return provider+':'+hashlib.sha256((identity+':'+model).encode()).hexdigest()


def gemini_count(url,payload,headers):
    """Conta o pedido completo no endpoint oficial; um erro impede enviar geração limitada."""
    if ':generateContent' not in url:
        raise AIControlError(PUBLIC_AI_UNAVAILABLE)
    model='models/'+url.split('/models/',1)[1].split(':',1)[0]
    response=requests.post(url.replace(':generateContent',':countTokens'),headers=headers,
        json={'generateContentRequest':dict(payload,model=model)},timeout=(5,15),allow_redirects=False)
    if not response.ok:
        raise AIControlError(PUBLIC_AI_UNAVAILABLE)
    return response.json().get('totalTokens')


def metered_post(url, **kwargs):
    payload=kwargs.get('json') or {}
    provider='gemini' if 'generativelanguage.googleapis.com/' in url else 'openai' if 'api.openai.com/' in url else 'anthropic'
    model=payload.get('model') or url.split('/models/')[-1].split(':')[0]
    headers=kwargs.get('headers',{}).copy()
    key=headers.get('x-goog-api-key') or headers.get('x-api-key') or headers.get('Authorization','').removeprefix('Bearer ')
    max_output=(payload.get('generationConfig') or {}).get('maxOutputTokens') or payload.get('max_tokens') or 8192
    choices=candidates(key,provider)
    for selected,item in choices:
        current=dict(kwargs,headers=headers.copy())
        if provider=='gemini':current['headers']['x-goog-api-key']=selected
        elif provider=='openai':current['headers']['Authorization']='Bearer '+selected
        scope_key=circuit_id(provider,model,selected,item)
        circuit_check(scope_key)
        lease=Lease(provider,model,max_output,lambda:gemini_count(url,payload,current['headers']),item)
        try:
            for attempt in range(2):
                try:
                    response=requests.post(url,**current)
                    break
                except requests.ConnectTimeout:
                    if attempt:raise
                    # Conexão não estabelecida: o provedor não iniciou processamento.
                    time.sleep(settings.AI_CONNECT_RETRY_SECONDS)
            try:data=response.json()
            except (ValueError,TypeError):data=None
            lease.finish(data,error_kind=error_kind(response.status_code,data),rejected=response.status_code in (400,401,403,429))
            circuit_result(scope_key,response.status_code)
            if response.status_code==401 and item and (selected,item)!=choices[-1]:
                # Autenticação rejeitada antes da geração. Não serve para 403, 429 ou 5xx.
                continue
            return response
        except requests.ConnectTimeout:
            lease.finish(error_kind='connect_timeout',rejected=True)
            raise
        except Exception:
            lease.finish(error_kind='transport_unknown')
            raise
    raise AIControlError(PUBLIC_AI_UNAVAILABLE)


def error_kind(status, data=None):
    if status==429:
        error=data.get('error') if isinstance(data,dict) else None
        details=error.get('details',[]) if isinstance(error,dict) else []
        if not isinstance(details,list):details=[]
        violations=[str(v.get('quotaId','')).lower() for d in details if isinstance(d,dict) for v in d.get('violations',[]) if isinstance(v,dict)]
        if any('perday' in q or 'permonth' in q for q in violations):return 'quota_exhausted'
        if any('perminute' in q or 'persecond' in q for q in violations):return 'rate_limit'
        return 'rate_or_quota'
    return 'authentication' if status==401 else 'permission' if status==403 else 'unavailable' if status>=500 else 'request' if status>=400 else ''


def metered_sdk(client, *, api_key, model, contents, config):
    """Mantém o contrato function calling e mede a resposta do SDK Gemini."""
    from google import genai
    from google.genai import types, errors
    from httpx import ConnectTimeout
    choices=candidates(api_key,'gemini')
    for selected,item in choices:
        scope_key=circuit_id('gemini',model,selected,item);circuit_check(scope_key)
        managed=genai.Client(api_key=selected,http_options=types.HttpOptions(timeout=12000,retry_options=types.HttpRetryOptions(attempts=1))) if item else nullcontext(client)
        with managed as active:
            def count():
                # O SDK instalado recusa tools/system_instruction em count_tokens no Gemini.
                # O endpoint REST oficial aceita generateContentRequest completo.
                import base64
                parts=[]
                for part in contents:
                    if isinstance(part,str):parts.append({'text':part})
                    elif getattr(part,'text',None) is not None:parts.append({'text':part.text})
                    elif getattr(part,'inline_data',None) is not None:
                        parts.append({'inlineData':{'mimeType':part.inline_data.mime_type,
                            'data':base64.b64encode(part.inline_data.data).decode('ascii')}})
                    else:raise AIControlError(PUBLIC_AI_UNAVAILABLE)
                tools=[]
                for tool in config.tools or []:
                    declarations=[]
                    for declaration in tool.function_declarations or []:
                        declarations.append({'name':declaration.name,'description':declaration.description or '',
                            'parametersJsonSchema':declaration.parameters_json_schema})
                    tools.append({'functionDeclarations':declarations})
                payload={'contents':[{'parts':parts}],
                    'systemInstruction':{'parts':[{'text':config.system_instruction or ''}]},'tools':tools}
                return gemini_count('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',
                    payload,{'x-goog-api-key':selected})
            lease=Lease('gemini',model,config.max_output_tokens or 1500,count,item)
            try:
                for attempt in range(2):
                    try:response=active.models.generate_content(model=model,contents=contents,config=config);break
                    except ConnectTimeout:
                        if attempt:raise
                        time.sleep(settings.AI_CONNECT_RETRY_SECONDS)
                metadata=getattr(response,'usage_metadata',None)
                lease.finish({'usage_metadata':metadata.model_dump() if hasattr(metadata,'model_dump') else metadata})
                circuit_result(scope_key,200)
                return response
            except errors.APIError as exc:
                status=int(exc.code or 500)
                lease.finish(error_kind=error_kind(status),rejected=status in (400,401,403,429));circuit_result(scope_key,status)
                if status==401 and item and (selected,item)!=choices[-1]:continue
                raise
            except ConnectTimeout:
                lease.finish(error_kind='connect_timeout',rejected=True);raise
            except Exception:
                lease.finish(error_kind='transport_unknown');raise
    raise AIControlError(PUBLIC_AI_UNAVAILABLE)

from contextlib import contextmanager


@contextmanager
def metered_speech(url, **kwargs):
    """Áudio em streaming: respeita o limite de bytes do chamador e mede só após JSON validado."""
    import json
    payload=kwargs.get('json') or {};model=payload['model']
    header=kwargs.get('headers',{});key=header.get('x-goog-api-key','')
    for selected,item in candidates(key,'gemini'):
        identity=circuit_id('gemini',model,selected,item);circuit_check(identity)
        # Reserva de segurança em bytes UTF-8 + overhead; NÃO é medição de tokens.
        # A utilização exibida será exclusivamente a métrica oficial do JSON final.
        reserve_input=len(json.dumps(payload,ensure_ascii=False).encode('utf8'))+2048
        maximum=payload['generation_config']['max_output_tokens']
        lease=Lease('gemini',model,maximum,lambda:reserve_input,item)
        current=dict(kwargs,headers=dict(header,**{'x-goog-api-key':selected}))
        try:
            with requests.post(url,**current) as response:
                circuit_result(identity,response.status_code)
                if response.status_code==401 and item:
                    lease.finish(error_kind='authentication',rejected=True)
                    continue
                if response.status_code in (400,401,403,429):
                    lease.finish(error_kind=error_kind(response.status_code),rejected=True)
                yield response,lease
                return
        except requests.ConnectTimeout:
            lease.finish(error_kind='connect_timeout',rejected=True);raise
        finally:
            lease.finish(error_kind='stream_unknown')
    raise AIControlError(PUBLIC_AI_UNAVAILABLE)
