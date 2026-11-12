"""Arquiva o que ainda está disponível em snapshots anteriores, sem recriar evidências perdidas."""
from django.core.management.base import BaseCommand
from django.db import transaction
from trainings.models import QuizVersion,Training,Participation
from trainings.archive import freeze_files,snapshot_digest,version_label,audit


class Command(BaseCommand):
    help='Preserva mídias locais disponíveis em versões não seladas; registra limitações do legado.'
    def handle(self,*args,**options):
        archived=0;warnings=0
        for pk in QuizVersion.objects.filter(integrity_sha256='').values_list('pk',flat=True):
            with transaction.atomic():
                version=QuizVersion.objects.select_for_update().get(pk=pk)
                training=Training.objects.select_for_update().get(pk=version.training_id)
                if version.integrity_sha256:continue
                version.label=version.label or version_label(version.number)
                version.content=freeze_files(version,version.content,legacy=True)
                version.integrity_sha256=snapshot_digest(version)
                version.save(update_fields=['label','content','integrity_sha256'])
                audit(training,'legacy_archive_created',payload={'version':version.label,'sha256':version.integrity_sha256,
                    'note':'Arquivamento feito agora. Não comprova integridade ou identidade antes desta data.'})
                archived+=1;warnings+=len(version.content.get('archive_warnings',[]))
        for pk in Participation.objects.filter(started_at__isnull=False).values_list('pk',flat=True):
            with transaction.atomic():
                part=Participation.objects.select_for_update().select_related('training').get(pk=pk)
                if not part.audit_events.exists():audit(part.training,'legacy_record_imported',part=part,payload={'identity':part.identity_snapshot,'note':'Importação do registro existente; não é um novo evento de conclusão.'})
        self.stdout.write(f'Versões arquivadas: {archived}. Avisos de arquivos ausentes: {warnings}.')
