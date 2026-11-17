"""Validação de URLs, limites de conteúdo e referências de evidências do manual."""
from urllib.parse import urlsplit
from rest_framework import serializers

def safe_url(value):
    """Permite páginas HTTP(S); não baixa a URL no servidor nem aceita credenciais embutidas."""
    try:
        url=urlsplit(value)
        if url.scheme not in ('https','http') or not url.hostname or url.username or url.password or url.fragment:
            raise ValueError()
        _=url.port
        if any(key in url.query.lower() for key in ('password=','access_token=','api_key=','sessionid=')):
            raise ValueError()
    except ValueError:
        raise serializers.ValidationError('Informe uma URL HTTP/HTTPS sem senha, token ou fragmento.')
    return value

class RunInput(serializers.Serializer):
    url=serializers.URLField(max_length=2000,validators=[safe_url])
    objective=serializers.CharField(max_length=1000,default='Criar um manual de usuário em seções e passos das funcionalidades visíveis.')
    consent=serializers.BooleanField()
    def validate_consent(self,value):
        if not value:raise serializers.ValidationError('Autorize a coleta das telas para continuar.')
        return value

class RectInput(serializers.Serializer):
    left=serializers.FloatField(min_value=0,max_value=10000)
    top=serializers.FloatField(min_value=0,max_value=10000)
    width=serializers.FloatField(min_value=1,max_value=10000)
    height=serializers.FloatField(min_value=1,max_value=10000)

class ControlInput(serializers.Serializer):
    label=serializers.CharField(max_length=150)
    role=serializers.ChoiceField(choices=['button','link','field','heading'])
    rect=RectInput(required=False)
    disabled=serializers.BooleanField(default=False)

class QualityInput(serializers.Serializer):
    warnings=serializers.ListField(child=serializers.CharField(max_length=200),max_length=6,default=list)
    pending_images=serializers.IntegerField(min_value=0,max_value=10000,default=0)
    masked_fields=serializers.IntegerField(min_value=0,max_value=10000,default=0)
    stable=serializers.BooleanField(default=False)
    visual_content=serializers.BooleanField(default=True)

class EvidenceInput(serializers.Serializer):
    heading=serializers.CharField(max_length=200,allow_blank=True)
    text=serializers.CharField(max_length=5000,allow_blank=True)
    controls=ControlInput(many=True,max_length=40)
    scroll_y=serializers.IntegerField(min_value=0,max_value=1000000)
    viewport_width=serializers.IntegerField(min_value=200,max_value=10000)
    viewport_height=serializers.IntegerField(min_value=200,max_value=10000)
    page_height=serializers.IntegerField(min_value=0,max_value=1000000,required=False)
    quality=QualityInput(required=False)
    def validate(self,data):
        for control in data['controls']:
            rect=control.get('rect')
            if rect and (rect['left']+rect['width']>data['viewport_width']+1 or rect['top']+rect['height']>data['viewport_height']+1):
                raise serializers.ValidationError('O destaque precisa estar dentro da área capturada.')
        return data

class CaptureInput(serializers.Serializer):
    execution_id=serializers.UUIDField(required=False)
    step_id=serializers.UUIDField(required=False)
    key=serializers.CharField(max_length=80)
    order=serializers.IntegerField(min_value=1,max_value=6)
    url=serializers.URLField(max_length=2000,validators=[safe_url])
    title=serializers.CharField(max_length=200)
    evidence=EvidenceInput()
    screenshot_base64=serializers.CharField(max_length=6000000,trim_whitespace=False)

class ManualStepInput(serializers.Serializer):
    text=serializers.CharField(max_length=2000)
    capture_id=serializers.IntegerField(min_value=1)
    control_index=serializers.IntegerField(min_value=0,max_value=39,required=False,allow_null=True,default=None)
    kind=serializers.ChoiceField(choices=['interface','guidance'],default='guidance')

class ManualSectionInput(serializers.Serializer):
    title=serializers.CharField(max_length=200)
    steps=ManualStepInput(many=True,min_length=1,max_length=10)

class DocumentInput(serializers.Serializer):
    title=serializers.CharField(max_length=200)
    summary=serializers.CharField(max_length=2000)
    sections=ManualSectionInput(many=True,min_length=1,max_length=6)
    def validate_sections(self,value):
        allowed=self.context['capture_ids']
        if any(step['capture_id'] not in allowed for section in value for step in section['steps']):
            raise serializers.ValidationError('O manual faz referência a uma captura inexistente.')
        if sum(len(section['steps']) for section in value)>30:
            raise serializers.ValidationError('Use no máximo 30 passos por manual.')
        controls=self.context.get('capture_controls',{})
        for section in value:
            for step in section['steps']:
                index=step.get('control_index')
                options=controls.get(step['capture_id'],[])
                if index is not None and (index>=len(options) or not options[index].get('rect')):
                    raise serializers.ValidationError('O controle destacado não existe na captura indicada.')
        return value


def equivalent_page(original, candidate):
    """Aceita o destino inicial no mesmo site, mantendo as restrições de protocolo, porta e query."""
    before,after=urlsplit(original),urlsplit(candidate)
    host=lambda value:value.hostname.lower().removeprefix('www.')
    port=lambda value:value.port or (443 if value.scheme=='https' else 80)
    same_port=port(before)==port(after) or (before.scheme=='http' and after.scheme=='https' and port(before)==80 and port(after)==443)
    return (before.scheme==after.scheme or (before.scheme=='http' and after.scheme=='https')) and host(before)==host(after) and same_port and before.query==after.query
