"""Entrega autenticada de prints e áudios, inclusive arquivos já gravados."""
from pathlib import PurePosixPath

from django.db.models import Q
from django.http import FileResponse
from django.urls import reverse
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .models import Step
from .permissions import accessible_guides


GUIDE_MEDIA_PREFIX = '/api/guides/media/'
MEDIA_TYPES = {
    'screenshots': {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'},
    'narrations': {'.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
                   '.mp4': 'audio/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'},
}
MEDIA_TYPES['capture_audio'] = MEDIA_TYPES['narrations']


def guide_media_url(file, request=None):
    if not file:
        return None
    url = reverse('guide-media', kwargs={'name': file.name})
    return request.build_absolute_uri(url) if request else url


def media_type(name):
    parts = name.split('/')
    if any(part in ('', '.', '..') for part in parts) or '\\' in name:
        raise NotFound()
    content_type = MEDIA_TYPES.get(parts[0], {}).get(PurePosixPath(name).suffix.lower())
    if not content_type:
        raise NotFound()
    return content_type


def private_media_response(storage, name):
    content_type = media_type(name)
    try:
        stream = storage.open(name, 'rb')
    except OSError as exc:
        raise NotFound('Arquivo de mídia indisponível.') from exc
    response = FileResponse(stream, content_type=content_type)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


class GuideMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        media_type(name)
        guides = accessible_guides(request.user).filter(
            Q(trashed_at__isnull=True) | Q(owner=request.user),
        )
        folder = name.split('/', 1)[0]
        if folder == 'capture_audio':
            guide = guides.filter(capture_audio=name).first()
            file = guide.capture_audio if guide else None
        else:
            field = 'screenshot' if folder == 'screenshots' else 'narration'
            step = Step.objects.filter(guide__in=guides, **{field: name}).first()
            file = getattr(step, field) if step else None
        if not file:
            raise NotFound()
        return private_media_response(file.storage, file.name)
