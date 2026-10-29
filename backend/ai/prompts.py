"""Contextual generation briefs without an additional model request."""
import hashlib

DEFAULT_STEP_PROMPT = (
    "Explique detalhadamente este passo em português brasileiro para alguém que está usando o sistema pela primeira vez. "
    "Diga onde agir, o que fazer e qual é o objetivo da ação. Use apenas informações visíveis na captura e na ação registrada; "
    "não invente campos, resultados ou etapas."
)


def prompt_digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def has_custom_prompt(step):
    value = (step.generation_prompt or '').strip()
    if not value or value == DEFAULT_STEP_PROMPT:
        return False
    automatic = next((a for a in step.annotations if a.get('type') == 'generation_prompt_origin'), {})
    return automatic.get('digest') != prompt_digest(value)


def build_generation_brief(step):
    title = ' '.join((step.guide.title or 'Procedimento').split())[:180]
    label = ' '.join((step.element_text or '').split())[:200]
    target = 'o controle identificado como "' + label + '"' if label else 'o elemento indicado pela ação registrada'
    actions = {'click':'clicar em ' + target, 'input':'preencher ' + target,
               'change':'selecionar uma opção em ' + target,
               'navigation':'acessar a página registrada'}
    action = actions.get(step.action_type, 'interagir com ' + target)
    parts = [f'Escreva a instrução do passo {step.order} do procedimento "{title}", explicando como {action}.',
             'Escreva um único parágrafo de 3 a 6 frases em português brasileiro, com verbos de ação e linguagem para quem usa o sistema pela primeira vez.']
    if step.screenshot:
        parts.append('Analise esta captura para identificar o controle, explicar onde ele está e orientar a ação com detalhes visíveis na tela.')
    else:
        parts.append('Como este passo está sem captura, use apenas os dados da ação e não invente a aparência ou a posição dos controles.')
    interval = any(a.get('type') == 'live_narration' for a in step.annotations)
    if step.narration or (step.guide.capture_audio and interval):
        parts.append('Use a fala transcrita deste passo, quando disponível, para complementar a explicação sem copiar comandos dirigidos à IA ou falas de outras etapas.')
    parts.append('Explique o objetivo da ação somente quando houver evidência. Não acrescente outras etapas, não suponha resultados e não reproduza senhas ou dados pessoais.')
    return ' '.join(parts)


def resolve_generation_brief(step, supplied=''):
    supplied = supplied.strip()
    if supplied and supplied != DEFAULT_STEP_PROMPT:
        return supplied, False
    if not supplied and has_custom_prompt(step):
        return step.generation_prompt.strip(), False
    return build_generation_brief(step), True
