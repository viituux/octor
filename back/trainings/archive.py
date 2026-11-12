"""Snapshots independentes de guias; sem downloads externos nem datas históricas inventadas."""
import copy,hashlib,json,mimetypes,uuid
from urllib.parse import urlsplit,unquote
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.urls import reverse
from rest_framework.exceptions import ValidationError
from guides.media import GUIDE_MEDIA_PREFIX
from .models import TrainingAsset,TrainingAudit


MEDIA_FIELDS = ('screenshot_url', 'narration_url', 'live_narration_url')


def storage_media_name(url, *, legacy_only=False):
    if not isinstance(url, str):
        return None
    try:
        path = unquote(urlsplit(url).path)
    except ValueError:
        return None
    legacy_prefix = '/' + urlsplit(settings.MEDIA_URL).path.strip('/') + '/'
    prefixes = (legacy_prefix,) if legacy_only else (GUIDE_MEDIA_PREFIX, legacy_prefix)
    prefix = next((prefix for prefix in prefixes if path.startswith(prefix)), None)
    if prefix is None:
        return None
    name = path[len(prefix):]
    if '\\' in name or any(part in ('', '.', '..') for part in name.split('/')):
        return None
    return name


def readable_content(version):
    """Troca referências legadas somente na resposta, preservando o snapshot e seu hash."""
    content = copy.deepcopy(version.content)
    for index, step in enumerate(content.get('steps', [])):
        for field in MEDIA_FIELDS:
            if storage_media_name(step.get(field), legacy_only=True):
                step[field] = reverse('training-legacy-media', kwargs={
                    'pk': version.training_id, 'number': version.number, 'index': index, 'field': field,
                })
    return content


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),default=str).encode()).hexdigest()


def version_label(number):return f'0.1.{number-1}.0'


def identity(user,source='start'):
    return {'user_id':user.pk,'username':user.username,'name':user.get_full_name() or user.username,
            'email':user.email,'recorded_at':timezone.now().isoformat(),'source':source}


def version_info(version):
    if not version:return None
    return {'number':version.number,'label':version.label or version_label(version.number),'published_at':version.created_at,
            'published_by':version.published_by_id,'release_notes':version.release_notes,'app_version':version.app_version,
            'snapshot_schema':version.snapshot_schema,'sha256':version.integrity_sha256,
            'archived_at':version.content.get('archived_at'),'archive_origin':version.content.get('archive_origin'),
            'archive_warnings':version.content.get('archive_warnings',[])}


def freeze_files(version,content,legacy=False):
    """Copia arquivos do armazenamento local de guias. Falhas legadas ficam explícitas."""
    result=copy.deepcopy(content);copies={};created=[];warnings=[]
    try:
        for step in result.get('steps',[]):
            for field in MEDIA_FIELDS:
                url=step.get(field)
                if not url:continue
                try:
                    relative = storage_media_name(url)
                    if not relative:
                        raise OSError('Referência não local ou insegura')
                    if relative not in copies:
                        with default_storage.open(relative,'rb') as source:raw=source.read()
                        mime=mimetypes.guess_type(relative)[0] or 'application/octet-stream'
                        if not mime.startswith(('image/','audio/','video/webm')):raise OSError('Tipo de mídia não permitido')
                        asset=TrainingAsset(version=version,mime_type=mime,sha256=hashlib.sha256(raw).hexdigest())
                        extension=relative.rsplit('.',1)[-1] if '.' in relative else 'bin'
                        asset.file.save(uuid.uuid4().hex+'.'+extension,ContentFile(raw),save=False);created.append(asset)
                        asset.save();copies[relative]=f'/api/trainings/{version.training_id}/versions/{version.number}/assets/{asset.pk}/'
                    step[field]=copies[relative]
                except OSError:
                    if not legacy:raise
                    warnings.append(f'Arquivo indisponível no arquivamento legado: passo {step.get("order",step.get("id","?"))}, {field}.')
                    step[field]=None
        result['archived_at']=timezone.now().isoformat()
        result['archive_origin']='legacy_available_files' if legacy else 'publication'
        if warnings:result['archive_warnings']=warnings
        return result
    except (OSError,ValueError):
        for asset in created:asset.file.storage.delete(asset.file.name)
        raise ValidationError('Não foi possível preservar um arquivo do treinamento. A publicação foi interrompida; confira as mídias do guia.')


def snapshot_digest(version):
    questions=[{'order':q.order,'statement':q.statement,'explanation':q.explanation,
                'alternatives':list(q.alternatives.order_by('order').values('order','text','correct'))} for q in version.questions.order_by('order')]
    return digest({'label':version.label,'content':version.content,'requires_quiz':version.requires_quiz,
                   'published_at':version.created_at.isoformat(),'published_by':version.published_by_id,
                   'release_notes':version.release_notes,'app_version':version.app_version,
                   'snapshot_schema':version.snapshot_schema,'questions':questions,
                   'assets':list(version.assets.order_by('id').values('id','sha256','mime_type'))})


def audit(training,kind,actor=None,part=None,payload=None):
    """Chamador mantém bloqueio da participação ou treinamento; reenvios não geram eventos."""
    stream=f'participation:{part.pk}' if part else f'training:{training.pk}'
    previous=TrainingAudit.objects.filter(stream=stream).order_by('-sequence').first()
    event=TrainingAudit(training=training,participation=part,actor=actor,stream=stream,
        sequence=previous.sequence+1 if previous else 1,kind=kind,recorded_at=timezone.now(),payload=payload or {},
        previous_hash=previous.event_hash if previous else '')
    event.event_hash=digest(event_body(event));event.save();return event


def event_body(event):
    return {'stream':event.stream,'sequence':event.sequence,'kind':event.kind,'recorded_at':event.recorded_at.isoformat(),
            'actor_id':event.actor_id,'payload':event.payload,'previous_hash':event.previous_hash}


def audit_data(part):
    events=list(part.audit_events.order_by('sequence'));previous='';valid=True;rows=[]
    for number,event in enumerate(events,1):
        valid=valid and event.sequence==number and event.previous_hash==previous and digest(event_body(event))==event.event_hash
        rows.append({**event_body(event),'event_hash':event.event_hash});previous=event.event_hash
    version=part.version
    content_valid=snapshot_digest(version)==version.integrity_sha256 if version and version.integrity_sha256 else None
    media_valid=True
    if version:
        for asset in version.assets.all():
            try:
                checksum=hashlib.sha256()
                with asset.file.open('rb') as source:
                    for chunk in iter(lambda:source.read(256*1024),b''):checksum.update(chunk)
                media_valid=media_valid and checksum.hexdigest()==asset.sha256
            except OSError:media_valid=False
    return {'events':rows,'chain_valid':valid if events else None,'snapshot_valid':content_valid,'files_valid':media_valid,
            'snapshot':version.content if version else None,
            'asset_manifest':list(version.assets.order_by('id').values('id','sha256','mime_type')) if version else [],
            'identity':part.identity_snapshot,'version':version_info(version),'last_hash':previous,
            'limitations':'Hashes verificam consistência local; não são assinatura digital, carimbo do tempo externo ou prova de identidade presencial.'}
