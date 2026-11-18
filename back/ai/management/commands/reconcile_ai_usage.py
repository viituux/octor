"""Conciliação explícita: não libera automaticamente reservas de consumo desconhecido."""
from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.contrib.admin.models import LogEntry, CHANGE
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone
from ai.models import AIUsage


class Command(BaseCommand):
    help='Concilia uma tentativa pendente usando somente métricas conferidas no provedor.'

    def add_arguments(self, parser):
        parser.add_argument('request_id')
        parser.add_argument('--master-id',type=int,required=True)
        parser.add_argument('--input-tokens',type=int,required=True)
        parser.add_argument('--output-tokens',type=int,required=True)
        parser.add_argument('--cost-brl',type=Decimal)
        parser.add_argument('--confirmed-official',action='store_true')

    @transaction.atomic
    def handle(self,*args,**options):
        master=get_user_model().objects.filter(pk=options['master_id'],is_active=True,is_staff=True,is_superuser=True).first()
        if not master or not options['confirmed_official']:
            raise CommandError('Exige usuário master dos devs e confirmação das métricas oficiais.')
        if min(options['input_tokens'],options['output_tokens'])<0 or (options['cost_brl'] is not None and options['cost_brl']<0):
            raise CommandError('Tokens e custo não podem ser negativos.')
        try:record=AIUsage.objects.select_for_update().get(pk=options['request_id'],status__in=['reserved','unknown'])
        except (AIUsage.DoesNotExist,ValueError):raise CommandError('Solicitação não encontrada ou já conciliada.') from None
        record.input_tokens=options['input_tokens'];record.output_tokens=options['output_tokens']
        record.total_tokens=record.input_tokens+record.output_tokens
        record.estimated_cost_brl=options['cost_brl'];record.reserved_tokens=0;record.reserved_cost_brl=0
        record.status='reconciled';record.error_kind='manual_reconciliation';record.finished_at=timezone.now();record.save()
        LogEntry.objects.log_actions(user_id=master.pk,queryset=AIUsage.objects.filter(pk=record.pk),action_flag=CHANGE,
            change_message='Consumo conciliado pelo master após conferência das métricas oficiais.')
        self.stdout.write('Consumo conciliado; reserva liberada conforme os valores informados.')
