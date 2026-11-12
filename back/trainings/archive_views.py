"""Histórico administrativo e acesso autenticado aos arquivos congelados."""
from django.http import FileResponse
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from guides.media import private_media_response
from rest_framework.exceptions import PermissionDenied,NotFound
from rest_framework.response import Response
from .models import QuizVersion, TrainingAsset
from .permissions import managed
from .views import BaseView,my_part
from .archive import MEDIA_FIELDS, readable_content, storage_media_name, version_info,snapshot_digest,version_label


def require_version_access(user, version):
    if managed(user).filter(pk=version.training_id).exists():
        return
    part = my_part(user, version.training_id)
    allowed = part.version_id or part.training.current_version_id
    if allowed != version.pk or part.training.status == 'draft':
        raise PermissionDenied('Arquivo fora da versão autorizada.')


class TrainingVersionDetailView(BaseView):
    def get(self,request,pk,number):
        training=get_object_or_404(managed(request.user),pk=pk)
        version=get_object_or_404(training.versions,number=number)
        questions=[{'statement':q.statement,'explanation':q.explanation,'order':q.order,
                    'alternatives':list(q.alternatives.order_by('order').values('text','correct'))} for q in version.questions.order_by('order')]
        history = [
            {'label': item.label or version_label(item.number), 'published_at': item.created_at, 'release_notes': item.release_notes}
            for item in training.versions.filter(number__lte=number).order_by('-number').only(
                'number', 'label', 'created_at', 'release_notes'
            )
        ]
        return Response({'version':version_info(version),'content':readable_content(version),'questions':questions,'history':history,
                         'snapshot_valid':snapshot_digest(version)==version.integrity_sha256 if version.integrity_sha256 else None})


class TrainingAssetView(BaseView):
    def get(self,request,pk,number,asset_id):
        asset=get_object_or_404(TrainingAsset.objects.select_related('version'),pk=asset_id,version__training_id=pk,version__number=number)
        require_version_access(request.user, asset.version)
        try:stream=asset.file.open('rb')
        except OSError:raise NotFound('Arquivo arquivado indisponível. Contate o responsável pelo armazenamento.')
        response=FileResponse(stream,content_type=asset.mime_type)
        response['Cache-Control']='private, no-store';response['X-Content-Type-Options']='nosniff'
        return response


class TrainingLegacyMediaView(BaseView):
    def get(self, request, pk, number, index, field):
        version = get_object_or_404(QuizVersion, training_id=pk, number=number)
        require_version_access(request.user, version)
        steps = version.content.get('steps', [])
        if field not in MEDIA_FIELDS or index >= len(steps):
            raise NotFound()
        name = storage_media_name(steps[index].get(field), legacy_only=True)
        if not name:
            raise NotFound()
        return private_media_response(default_storage, name)
