"""Worker do Manual por URL. Pode rodar ao lado do servidor local ou como serviço."""
from time import sleep

from django.core.management.base import BaseCommand
from django.db import OperationalError, close_old_connections

from manuals.generation import process_next_manual


class Command(BaseCommand):
    help = 'Processa gerações do Manual por URL registradas no PostgreSQL.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Processa no máximo uma geração e encerra.')

    def handle(self, *args, **options):
        try:
            while True:
                close_old_connections()
                try:
                    processed = process_next_manual()
                except OperationalError:
                    if options['once']:
                        raise
                    self.stderr.write('PostgreSQL indisponível. Nova tentativa em 5 segundos.')
                    sleep(5)
                    continue
                if options['once']:
                    return
                if not processed:
                    sleep(2)
        except KeyboardInterrupt:
            return
