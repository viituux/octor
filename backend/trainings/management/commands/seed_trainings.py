from datetime import timedelta
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand,CommandError
from django.db import transaction
from django.test import RequestFactory
from django.utils import timezone
from guides.models import Guide,Step,Workspace
from trainings.models import Training,Participation,QuizResult,QuizAnswer,Feedback
from trainings.services import publish


def demo_questions():
    topics=[('Qual é a primeira ação do procedimento?','Abrir a área de clientes',['Excluir um registro','Abrir a área de clientes','Encerrar a sessão','Publicar o treinamento']),('O que deve ser conferido antes de salvar?','Nome e e-mail do cliente',['Somente a cor da tela','O navegador da equipe','Nome e e-mail do cliente','A quantidade de estrelas']),('Qual ação confirma o cadastro?','Clicar em Salvar',['Clicar em Salvar','Fechar a página sem salvar','Excluir o formulário','Sair da conta']),('Como conferir o resultado do cadastro?','Localizar o cliente na lista',['Repetir o quiz','Alterar sua senha','Fechar o navegador','Localizar o cliente na lista']),('O que fazer ao encontrar uma informação incorreta?','Revisar os dados antes de confirmar',['Ignorar a divergência','Revisar os dados antes de confirmar','Duplicar o cliente','Excluir toda a lista'])]
    return [{'statement':question,'explanation':'Siga a instrução registrada no procedimento: '+answer+'.','alternatives':[{'text':text,'correct':text==answer} for text in alternatives]} for question,answer,alternatives in topics]


class Command(BaseCommand):
    help='Cria demonstração isolada de treinamentos; não altera guias ou senhas existentes.'
    def add_arguments(self,parser):parser.add_argument('--password',default='OctorDemo!2026Training')
    @transaction.atomic
    def handle(self,*args,**options):
        if not settings.DEBUG:raise CommandError('Execute a demonstração somente em desenvolvimento (DEBUG=True).')
        users=[]
        for name,first in [('octor_demo_admin','Gestor Demo'),('octor_demo_ana','Ana Demo'),('octor_demo_bruno','Bruno Demo'),('octor_demo_carla','Carla Demo'),('octor_demo_davi','Davi Demo')]:
            user,created=User.objects.get_or_create(username=name,defaults={'email':name+'@training.example','first_name':first})
            if created:user.set_password(options['password']);user.save()
            users.append(user)
        owner=users[0];space,_=Workspace.objects.get_or_create(owner=owner,name='Demonstração de treinamentos Octo');space.members.add(*users)
        guide,_=Guide.objects.get_or_create(owner=owner,title='[DEMO] Cadastro de clientes',defaults={'workspace':space,'status':'published','description':'Abra a área de clientes, preencha o nome e o e-mail, revise os dados, clique em Salvar e confira o cliente na lista.'})
        instructions=['Abra a área de clientes no sistema para iniciar o cadastro.','Preencha o nome e o e-mail do cliente.','Revise os dados e corrija qualquer informação incorreta antes de confirmar.','Clique em Salvar para confirmar o cadastro.','Localize o cliente na lista para conferir o resultado.']
        for order,text in enumerate(instructions,1):Step.objects.get_or_create(guide=guide,order=order,defaults={'text':text,'url':'https://example.com/clientes','action_type':'click'})
        for index,title in enumerate(['[DEMO] Cadastro de clientes','[DEMO] Revisão do cadastro']):
            t,created=Training.objects.get_or_create(owner=owner,title=title,defaults={'guide':guide,'workspace':space,'description':guide.description,'draft_questions':demo_questions(),'max_attempts':1})
            if not created:continue
            request=RequestFactory().get('/',HTTP_HOST='localhost:8000');request.user=owner;version=publish(t,request)
            for position,user in enumerate(users[1:]):
                p=Participation.objects.create(training=t,user=user)
                if position==3:continue
                moment=timezone.now()-timedelta(days=position*32+index*8)
                p.version=version;p.started_at=moment-timedelta(minutes=7);p.completed_at=moment;p.save()
                if position==2:continue
                result=QuizResult.objects.create(training=t,user=user,version=version,attempt=1)
                count=5-position-index;count=max(0,count)
                for q in version.questions.all():
                    correct=q.order<=count
                    a=q.alternatives.filter(correct=correct).first()
                    QuizAnswer.objects.create(result=result,question=q,alternative=a,correct=a.correct)
                result.correct_count=count;result.score=count*100;result.time_seconds=80+position*30;result.finished_at=moment+timedelta(minutes=2);result.started_at=moment;result.save()
                fb=Feedback.objects.create(training=t,user=user,stars=5-position,comment='O passo a passo facilitou meu entendimento.' if position==0 else 'As instruções ajudaram. Gostaria de mais exemplos.')
                Feedback.objects.filter(pk=fb.pk).update(created_at=moment+timedelta(minutes=3))
        self.stdout.write(self.style.SUCCESS('Demonstração disponível: octor_demo_admin, octor_demo_ana, octor_demo_bruno, octor_demo_carla e octor_demo_davi. Contas existentes preservadas.'))
