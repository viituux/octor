"""Processa uma geração por vez com fila persistida no PostgreSQL."""
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from accounts.notifications import notify
from .models import ManualRun
from .services import ManualGenerationError, generate_manual

logger = logging.getLogger(__name__)
GENERATION_LEASE = timedelta(minutes=3)


def process_next_manual():
    now = timezone.now()
    ManualRun.objects.filter(status='generating', updated_at__lt=now - GENERATION_LEASE).update(
        status='failed', updated_at=now,
        message='A geração foi interrompida. Suas capturas foram preservadas. Tente novamente.',
    )
    with transaction.atomic():
        run = ManualRun.objects.select_for_update(skip_locked=True).filter(status='queued').order_by('updated_at', 'pk').first()
        if not run:
            return False
        run.status = 'generating'
        run.message = 'A IA está preparando o manual a partir das capturas.'
        run.save(update_fields=['status', 'message', 'updated_at'])

    # O horário da reserva identifica a tentativa e impede que um worker antigo grave após cancelamento ou retry.
    attempt = ManualRun.objects.filter(pk=run.pk, status='generating', updated_at=run.updated_at)
    try:
        document = generate_manual(run)
    except ManualGenerationError as error:
        attempt.update(status='failed', message=str(error), updated_at=timezone.now())
    except Exception:
        logger.exception('Falha inesperada na geração do manual %s', run.pk)
        attempt.update(
            status='failed', message='A geração falhou. Suas capturas foram preservadas. Tente novamente.',
            updated_at=timezone.now(),
        )
    else:
        with transaction.atomic():
            if attempt.update(status='review', document=document, updated_at=timezone.now(),
                              message='Revise os textos e as imagens antes de aprovar.'):
                notify(run.owner, 'manual_ready', 'Seu manual está pronto para revisão', document['title'], f'/manuals/{run.id}')
    return True
