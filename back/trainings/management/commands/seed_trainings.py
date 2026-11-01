"""Demonstração de procedimentos e avaliações; não cria dados de quiz."""
from datetime import timedelta
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test import RequestFactory
from django.utils import timezone
from guides.models import Guide, Step, Workspace
from trainings.models import Training, Participation, Feedback
from trainings.services import publish


class Command(BaseCommand):
    help = 'Cria demonstração isolada de treinamentos sem alterar guias ou senhas existentes.'

    def add_arguments(self, parser):
        """Adiciona a senha usada somente em novas contas de demonstração."""
        parser.add_argument('--password', default='OctorDemo!2026Training')

    @transaction.atomic
    def handle(self, *args, **options):
        """Cria conteúdo e feedbacks repetíveis; CommandError impede uso fora de DEBUG."""
        if not settings.DEBUG:
            raise CommandError('Execute a demonstração somente em desenvolvimento (DEBUG=True).')
        users = []
        for name, first in [('octor_demo_admin', 'Gestor Demo'), ('octor_demo_ana', 'Ana Demo'),
                            ('octor_demo_bruno', 'Bruno Demo'), ('octor_demo_carla', 'Carla Demo'),
                            ('octor_demo_davi', 'Davi Demo')]:
            user, created = User.objects.get_or_create(username=name, defaults={
                'email': name + '@training.example', 'first_name': first})
            if created:
                user.set_password(options['password'])
                user.save()
            users.append(user)
        owner = users[0]
        space, _ = Workspace.objects.get_or_create(owner=owner, name='Demonstração de treinamentos OCTOR')
        space.members.add(*users)
        description = 'Abra a área de clientes, preencha nome e e-mail, revise, salve e confira o cadastro.'
        guide, _ = Guide.objects.get_or_create(owner=owner, title='[DEMO] Cadastro de clientes', defaults={
            'workspace': space, 'status': 'published', 'description': description})
        instructions = ['Abra a área de clientes.', 'Preencha o nome e o e-mail.',
                        'Revise os dados antes de confirmar.', 'Clique em Salvar.', 'Confira o cliente na lista.']
        for order, text in enumerate(instructions, 1):
            Step.objects.get_or_create(guide=guide, order=order, defaults={
                'text': text, 'url': 'https://example.com/clientes', 'action_type': 'click'})
        for index, title in enumerate(['[DEMO] Cadastro de clientes', '[DEMO] Revisão do cadastro']):
            training, created = Training.objects.get_or_create(owner=owner, title=title, defaults={
                'guide': guide, 'workspace': space, 'description': description})
            # Reexecutar o seed não reescreve dados anteriores nem os resultados legados.
            if not created:
                continue
            request = RequestFactory().get('/', HTTP_HOST='localhost:8000')
            request.user = owner
            version = publish(training, request)
            for position, user in enumerate(users[1:]):
                part = Participation.objects.create(training=training, user=user)
                if position == 3:
                    continue
                moment = timezone.now() - timedelta(days=position * 32 + index * 8)
                part.version, part.started_at, part.completed_at = version, moment - timedelta(minutes=7), moment
                part.save()
                if position == 2:
                    continue
                feedback = Feedback.objects.create(training=training, user=user, stars=5-position,
                    comment='O passo a passo facilitou meu entendimento.' if position == 0 else 'Gostaria de mais exemplos.')
                Feedback.objects.filter(pk=feedback.pk).update(created_at=moment + timedelta(minutes=3))
        self.stdout.write(self.style.SUCCESS('Demonstração disponível: octor_demo_admin, octor_demo_ana, octor_demo_bruno, octor_demo_carla e octor_demo_davi. Contas existentes preservadas.'))
