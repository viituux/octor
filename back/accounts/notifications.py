"""Notificações internas: criação transacional, paginação e leitura por destinatário."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from config.release import release_info
from .models import Notification


def notify(user, kind, title, message, path=''):
    """Persiste o aviso na mesma transação da operação; rollback desfaz ambos."""
    return Notification.objects.create(recipient=user, kind=kind, title=title, message=message, path=path)


def ensure_release_notification(user):
    release = release_info()
    version, previous = release.get('version'), release.get('previous_version')
    if not version or not previous or version == previous:
        return
    Notification.objects.get_or_create(
        recipient=user, release_version=version,
        defaults={
            'kind': 'system_release',
            'title': f'OCTOR atualizado para v{version}',
            'message': (
                f'O sistema passou de v{previous} para v{version}. '
                'Seus treinamentos em andamento continuam na versão que você iniciou.'
            ),
        },
    )


class NotificationData(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'kind', 'title', 'message', 'path', 'read_at', 'created_at']
        read_only_fields = fields


class NotificationPage(PageNumberPagination):
    page_size = 20


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Lista somente avisos próprios, com total de não lidos e páginas limitadas."""
        ensure_release_notification(request.user)
        query = Notification.objects.filter(recipient=request.user)
        unread = query.filter(read_at__isnull=True).count()
        if request.query_params.get('unread') == 'true':
            query = query.filter(read_at__isnull=True)
        pager = NotificationPage()
        rows = pager.paginate_queryset(query, request)
        response = pager.get_paginated_response(NotificationData(rows, many=True).data)
        response.data['unread_count'] = unread
        return response


class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        """Marca um aviso próprio ou todos como lidos; repetição é idempotente."""
        query = Notification.objects.filter(recipient=request.user)
        with transaction.atomic():
            if pk is not None:
                get_object_or_404(query, pk=pk)
                query = query.filter(pk=pk)
            query.filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({'unread_count': Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()})
