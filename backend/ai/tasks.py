import base64
import json
import requests
from celery import shared_task
from guides.models import Guide, Step
from accounts.models import UserSettings


def get_step_prompt(step):
    action = step.action_type or "ação"
    target = step.element_text or step.selector or "no elemento indicado"
    input_val = step.input_value or ""
    url = step.url or ""
    coords = f"(x={step.click_x}, y={step.click_y})" if step.click_x is not None else "N/A"

    return (
        f"Você é um assistente técnico que escreve manuais de instrução passo a passo claros, concisos e em português brasileiro.\n"
        f"Analise a imagem da tela em anexo e a ação realizada pelo usuário:\n"
        f"- Tipo de ação: {action}\n"
        f"- Elemento identificado: {target}\n"
        f"- Seletor CSS: {step.selector}\n"
        f"- Coordenadas do clique: {coords}\n"
        f"- Valor preenchido: '{input_val}'\n"
        f"- URL da página: {url}\n\n"
        f"Gere UMA única frase curta de instrução direta para o usuário (Exemplo: 'Clique no botão Salvar no topo da tela', 'Digite seu e-mail no campo Usuário').\n"
        f"Responda apenas com a frase de instrução, sem comentários adicionais."
    )


def call_gemini_vision(api_key, prompt, image_bytes, mime_type="image/jpeg"):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={api_key}"
    
    parts = [{"text": prompt}]
    if image_bytes:
        parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": base64.b64encode(image_bytes).decode("utf-8")
            }
        })

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 800
        }
    }

    res = requests.post(url, json=payload, timeout=35)
    if res.ok:
        data = res.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for p in reversed(parts):
                txt = p.get("text", "").strip()
                if txt and not p.get("thought", False):
                    return txt, None
            if parts and parts[-1].get("text"):
                return parts[-1]["text"].strip(), None
    else:
        err_msg = f"Gemini erro {res.status_code}: {res.text}"
        return None, err_msg
    return None, None


def call_openai_vision(api_key, prompt, image_bytes, mime_type="image/png"):
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    content = [{"type": "text", "text": prompt}]
    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{b64}"}
        })

    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 100,
        "temperature": 0.2
    }

    res = requests.post(url, headers=headers, json=payload, timeout=25)
    if res.ok:
        data = res.json()
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "").strip(), None
    else:
        err_msg = f"OpenAI erro {res.status_code}: {res.text}"
        return None, err_msg
    return None, None


def call_anthropic_vision(api_key, prompt, image_bytes, mime_type="image/png"):
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }

    content = [{"type": "text", "text": prompt}]
    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": b64
            }
        })

    payload = {
        "model": "claude-3-5-haiku-20241022",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 100
    }

    res = requests.post(url, headers=headers, json=payload, timeout=25)
    if res.ok:
        data = res.json()
        parts = data.get("content", [])
        if parts:
            return parts[0].get("text", "").strip(), None
    else:
        err_msg = f"Anthropic erro {res.status_code}: {res.text}"
        return None, err_msg
    return None, None


@shared_task
def generate_step_texts_task(guide_id):
    try:
        guide = Guide.objects.get(id=guide_id)
        owner = guide.owner
        settings = getattr(owner, "settings", None)
        
        provider = settings.llm_provider if settings else "gemini"
        api_key = settings.llm_api_key.strip() if settings and settings.llm_api_key else None

        for step in guide.steps.all():
            generated_text = None

            # Lê a imagem do screenshot se existir
            image_bytes = None
            mime_type = "image/png"
            if step.screenshot:
                try:
                    step.screenshot.open("rb")
                    image_bytes = step.screenshot.read()
                    step.screenshot.close()
                    if step.screenshot.name.endswith(".jpg") or step.screenshot.name.endswith(".jpeg"):
                        mime_type = "image/jpeg"
                except Exception:
                    image_bytes = None

            prompt = get_step_prompt(step)

            last_error = None
            if api_key:
                try:
                    if provider == "gemini":
                        generated_text, last_error = call_gemini_vision(api_key, prompt, image_bytes, mime_type)
                    elif provider == "openai":
                        generated_text, last_error = call_openai_vision(api_key, prompt, image_bytes, mime_type)
                    elif provider == "anthropic":
                        generated_text, last_error = call_anthropic_vision(api_key, prompt, image_bytes, mime_type)
                except Exception as ex:
                    last_error = str(ex)
                    print(f"Erro ao chamar API de IA ({provider}):", ex)

            # Fallback inteligente se a chave falhar
            if not generated_text:
                action = step.action_type or "ação"
                target = step.element_text or step.selector or "no elemento indicado"
                if action == "click":
                    generated_text = f"Clique em '{target}'."
                elif action == "input":
                    val = step.input_value or "o valor desejado"
                    generated_text = f"Digite '{val}' no campo '{target}'."
                elif action == "change":
                    generated_text = f"Selecione a opção desejada no campo '{target}'."
                elif action == "navigation":
                    generated_text = f"Navegue para a página: {step.url}."
                else:
                    generated_text = f"Interaja com '{target}'."

            step.text = generated_text
            step.save()

        return last_error

    except Guide.DoesNotExist:
        return "Guia não encontrado"
