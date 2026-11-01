# Fluxo de aprendizagem: início, conclusão do conteúdo, tentativa de quiz, resposta ordenada e feedback; ações são transacionais.
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import transaction,IntegrityError,OperationalError
# Dependência: modelos, consultas e transações do banco relacional.
from django.db.models import Q
# Dependência: consulta de objetos com resposta HTTP 404 padronizada.
from django.shortcuts import get_object_or_404
# Dependência: tempo e utilitários compatíveis com a configuração Django.
from django.utils import timezone
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import permissions,status
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.views import APIView
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.response import Response
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.exceptions import PermissionDenied,ValidationError
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.throttling import ScopedRateThrottle
# Dependência: contratos e funções do módulo guides.models reutilizados neste fluxo.
from guides.models import Guide,Workspace
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Training,Participation,QuizResult,QuizAnswer,QuizAlternative,Feedback
# Dependência: contratos e funções do módulo .permissions reutilizados neste fluxo.
from .permissions import managed,require_manager
# Dependência: contratos e funções do módulo .serializers reutilizados neste fluxo.
from .serializers import TrainingInput,AssignmentInput,AnswerInput,FeedbackInput
# Dependência: contratos e funções do módulo .services reutilizados neste fluxo.
from .services import publish,suggest,quiz_state,participation_data,answer_data,result_data
# Dependência: contratos e funções do módulo .analytics reutilizados neste fluxo.
from .analytics import analytics,Filters,filtered


# Verifica se há guia, equipe ou treinamento que habilite a área administrativa para o usuário.
# Parâmetros — user: instância do usuário Django.
# Retorno: condição booleana.
def admin_capability(user):
    return managed(user).exists() or Guide.objects.filter(owner=user,trashed_at__isnull=True).exists() or Workspace.objects.filter(owner=user).exists()


# Representa o treinamento e inclui perguntas em rascunho somente quando solicitado no contexto administrativo.
# Parâmetros — t: argumento fornecido pelo chamador no contrato desta função.
# Parâmetros — admin: argumento fornecido pelo chamador no contrato desta função.
# Retorno: data.
def training_data(t,admin=False):
    data={'id':t.id,'guide':t.guide_id,'title':t.title,'description':t.description,'status':t.status,'max_attempts':t.max_attempts,'workspace':t.workspace_id,'version':t.current_version.number if t.current_version_id else None}
    if admin:data['draft_questions']=t.draft_questions
    return data


class BaseView(APIView):
    # list: permissões verificadas antes da execução da view.
    permission_classes=[permissions.IsAuthenticated]
    # Converte conflitos de escrita concorrente em resposta HTTP 409 e delega as demais exceções ao DRF.
    # Parâmetros — exc: argumento fornecido pelo chamador no contrato desta função.
    # Retorno: resultado de Response(...); resultado de super().handle_exception(...).
    def handle_exception(self,exc):
        # Restrições de unicidade continuam necessárias: duas requisições podem passar pela consulta prévia ao mesmo tempo.
        if isinstance(exc,(IntegrityError,OperationalError)):
            return Response({'detail':'Outra atualização está em andamento. Atualize e tente novamente.'},status=409)
        return super().handle_exception(exc)


class CapabilitiesView(BaseView):
    # Atende GET em CapabilitiesView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def get(self,request):return Response({'can_manage':admin_capability(request.user)})


class AdminTrainingsView(BaseView):
    # Atende GET em AdminTrainingsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    def get(self,request):
        if not admin_capability(request.user):raise PermissionDenied('Área disponível somente para responsáveis por treinamentos.')
        return Response(analytics(managed(request.user),request.query_params)['trainings'])
    # Atende POST em AdminTrainingsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    def post(self,request):
        form=TrainingInput(data=request.data,context={'request':request});form.is_valid(raise_exception=True)
        t=form.save(owner=request.user,workspace=form.validated_data['guide'].workspace)
        return Response(training_data(t,True),status=201)


class AdminTrainingView(BaseView):
    # Atende GET em AdminTrainingView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    # Falhas: is_valid(raise_exception=True) interrompe a operação se o serializer rejeitar os dados.
    def get(self,request,pk):
        t=get_object_or_404(managed(request.user).select_related('current_version'),pk=pk)
        data=training_data(t,True);data['summary']=analytics(managed(request.user).filter(pk=pk),request.query_params)['trainings'][0]
        filters=Filters(data=request.query_params);filters.is_valid(raise_exception=True);f=filters.validated_data
        parts=t.participations.select_related('user').order_by('user__first_name','user__username')
        if f.get('start') or f.get('end'):parts=filtered(parts,'completed_at',f)
        rows=[]
        for p in parts:
            result=t.results.filter(user=p.user,finished_at__isnull=False).order_by('-score','finished_at').first();fb=t.feedbacks.filter(user=p.user).first()
            if 'rating' in f and (not fb or fb.stars!=f['rating']):continue
            if 'min_percent' in f and (not result or result.correct_count*20<f['min_percent']):continue
            rows.append({'id':p.user_id,'name':p.user.get_full_name() or p.user.username,'email':p.user.email,'started':bool(p.started_at),'completed':bool(p.completed_at),'quiz_submitted':bool(result),'evaluated':bool(fb),'commented':bool(fb and fb.comment.strip()),'percent':result.correct_count*20 if result else None,'score':result.score if result else None,'stars':fb.stars if fb else None,'date':fb.created_at if fb else result.finished_at if result else p.completed_at or p.assigned_at})
        data['participants']=rows
        return Response(data)
    # Atende PATCH em AdminTrainingView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: ValidationError. Consulte os blocos try/except para as conversões locais.
    @transaction.atomic
    def patch(self,request,pk):
        t=get_object_or_404(Training.objects.select_for_update(),pk=pk);require_manager(request.user,t)
        form=TrainingInput(t,data=request.data,partial=True,context={'request':request});form.is_valid(raise_exception=True)
        if 'guide' in form.validated_data and form.validated_data['guide'].pk!=t.guide_id:raise ValidationError('Crie outro treinamento para utilizar um guia diferente.')
        form.save();return Response(training_data(t,True))


class AdminActionView(BaseView):
    # Atende POST em AdminActionView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Parâmetros — action: ação do fluxo de aprendizagem indicada na URL.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: ValidationError. Consulte os blocos try/except para as conversões locais.
    @transaction.atomic
    def post(self,request,pk,action):
        t=get_object_or_404(Training.objects.select_for_update(),pk=pk);require_manager(request.user,t)
        if action=='publish':
            if request.data.get('review_approved') is not True:raise ValidationError('Confirme a revisão do quiz antes de publicar.')
            publish(t,request);return Response(training_data(t,True))
        if action=='archive':t.status='archived';t.save(update_fields=['status','updated_at']);return Response(training_data(t,True))
        if action=='assign':
            form=AssignmentInput(data=request.data);form.is_valid(raise_exception=True)
            users=[]
            for email in set(x.lower() for x in form.validated_data['emails']):
                user=User.objects.filter(email__iexact=email,is_active=True).first()
                if not user:raise ValidationError({'emails':'Uma das pessoas ainda não possui conta no OCTOR.'})
                if t.workspace_id and not t.workspace.members.filter(pk=user.pk).exists():raise ValidationError({'emails':'Todos os participantes precisam pertencer ao espaço do treinamento.'})
                users.append(user)
            for user in users:Participation.objects.get_or_create(training=t,user=user)
            return Response({'assigned':len(users)})
        raise ValidationError('Ação inválida.')


class SuggestionsView(BaseView):
    throttle_classes=[ScopedRateThrottle]
    # str: nome do limite de requisições definido nas configurações.
    throttle_scope='auth'
    # Atende POST em SuggestionsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    def post(self,request,pk):
        t=get_object_or_404(managed(request.user),pk=pk)
        return Response({'questions':suggest(t),'requires_review':True})


class ParticipantInspectionView(BaseView):
    # Atende GET em ParticipantInspectionView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Parâmetros — user_id: identificador do participante consultado.
    # Retorno: resultado de Response(...).
    def get(self,request,pk,user_id):
        t=get_object_or_404(managed(request.user),pk=pk)
        part=get_object_or_404(t.participations.select_related('user'),user_id=user_id)
        return Response({'user':{'id':part.user_id,'name':part.user.get_full_name() or part.user.username},**participation_data(part)})


class DashboardView(BaseView):
    # Atende GET em DashboardView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: PermissionDenied, ValidationError. Consulte os blocos try/except para as conversões locais.
    def get(self,request):
        if not admin_capability(request.user):raise PermissionDenied('Área administrativa.')
        query=managed(request.user)
        if request.query_params.get('training'):
            try:pk=int(request.query_params['training'])
            except ValueError:raise ValidationError('Treinamento inválido.')
            get_object_or_404(query,pk=pk);query=query.filter(pk=pk)
        return Response(analytics(query,request.query_params))


class MyTrainingsView(BaseView):
    # Atende GET em MyTrainingsView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Retorno: resultado de Response(...).
    def get(self,request):
        parts=Participation.objects.filter(Q(training__workspace__isnull=True)|Q(training__workspace__members=request.user)|Q(training__owner=request.user)|Q(training__workspace__owner=request.user),user=request.user).distinct().exclude(training__status='draft').select_related('training__current_version')
        return Response([{**training_data(p.training),'progress':participation_data(p)} for p in parts])


# Busca a participação do usuário no treinamento e opcionalmente bloqueia a linha para atualização concorrente.
# Parâmetros — user: instância do usuário Django.
# Parâmetros — pk: identificador do recurso na URL.
# Parâmetros — lock: booleano que solicita bloqueio de linha.
# Retorno: resultado de get_object_or_404(...).
def my_part(user,pk,lock=False):
    query=Participation.objects.select_related('training__current_version','version').filter(Q(training__workspace__isnull=True)|Q(training__workspace__in=user.workspaces.all())|Q(training__owner=user)|Q(training__workspace__owner=user),user=user,training_id=pk)
    if lock:query=query.select_for_update(of=('self',))
    return get_object_or_404(query)


class MyTrainingView(BaseView):
    # Atende GET em MyTrainingView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: PermissionDenied. Consulte os blocos try/except para as conversões locais.
    def get(self,request,pk):
        p=my_part(request.user,pk)
        if p.training.status=='draft':raise PermissionDenied('O treinamento ainda não foi publicado.')
        version=p.version or p.training.current_version
        return Response({**training_data(p.training),'content':version.content if version else None,'progress':participation_data(p)})


class LearningActionView(BaseView):
    # Atende POST em LearningActionView; valida o escopo da requisição e constrói a resposta do fluxo abaixo.
    # Parâmetros — request: requisição DRF com usuário, corpo e contexto HTTP.
    # Parâmetros — pk: identificador do recurso na URL.
    # Parâmetros — action: ação do fluxo de aprendizagem indicada na URL.
    # Retorno: resultado de Response(...).
    # Falhas explícitas no fluxo: ValidationError, PermissionDenied. Consulte os blocos try/except para as conversões locais.
    @transaction.atomic
    def post(self,request,pk,action):
        p=my_part(request.user,pk,True)
        if p.training.status!='published':raise ValidationError('Este treinamento não está disponível para novas atividades.')
        if action=='start':
            if not p.started_at:
                p.started_at=timezone.now();p.version=p.training.current_version;p.save(update_fields=['started_at','version'])
            return Response(participation_data(p))
        if action=='complete':
            if not p.started_at:raise ValidationError('Inicie o treinamento antes de concluir.')
            if not p.completed_at:p.completed_at=timezone.now();p.save(update_fields=['completed_at'])
            return Response(participation_data(p))
        # Retoma a tentativa incompleta antes de consumir outra; o vínculo de participação fica bloqueado na transação.
        if action=='quiz-start':
            if not p.completed_at:raise PermissionDenied('Conclua o conteúdo para liberar o quiz.')
            pending=p.training.results.filter(user=request.user,finished_at__isnull=True).first()
            if pending:return Response(quiz_state(pending))
            used=p.training.results.filter(user=request.user).count()
            if used>=p.training.max_attempts:return Response(quiz_state(p.training.results.filter(user=request.user).latest('attempt')))
            result=QuizResult.objects.create(training=p.training,user=request.user,version=p.version,attempt=used+1)
            return Response(quiz_state(result),status=201)
        if action=='answer':
            form=AnswerInput(data=request.data);form.is_valid(raise_exception=True);data=form.validated_data
            result=get_object_or_404(p.training.results,user=request.user,pk=data['result_id'])
            old=result.answers.filter(question_id=data['question_id']).first()
            # Reenvio idêntico devolve o resultado existente; conteúdo diferente é conflito, sem duplicar pontuação/avaliação.
            if old:
                if old.alternative_id!=data['alternative_id']:return Response({'detail':'Esta pergunta já foi respondida.'},status=409)
                return Response({**quiz_state(result),'feedback':answer_data(old)})
            if result.finished_at:raise ValidationError('Esta tentativa já foi concluída.')
            question=get_object_or_404(result.version.questions,pk=data['question_id'])
            # A sequência é conferida no servidor: o cliente não pode saltar uma pergunta informando outro ID.
            if question.order!=result.answers.count()+1:raise ValidationError('Responda às perguntas na ordem apresentada.')
            alternative=get_object_or_404(question.alternatives,pk=data['alternative_id'])
            answer=QuizAnswer.objects.create(result=result,question=question,alternative=alternative,correct=alternative.correct)
            if alternative.correct:result.correct_count+=1
            # Pontuação persistida é acertos × 100; o percentual apresentado é calculado separadamente (acertos × 20).
            result.score=result.correct_count*100
            if result.answers.count()==5:
                result.finished_at=timezone.now();result.time_seconds=max(0,int((result.finished_at-result.started_at).total_seconds()))
            result.save(update_fields=['correct_count','score','finished_at','time_seconds'])
            return Response({**quiz_state(result),'feedback':answer_data(answer)})
        if action=='feedback':
            if not p.training.results.filter(user=request.user,finished_at__isnull=False).exists():raise PermissionDenied('Conclua o quiz antes de avaliar.')
            form=FeedbackInput(data=request.data);form.is_valid(raise_exception=True)
            old=p.training.feedbacks.filter(user=request.user).first()
            # Reenvio idêntico devolve o resultado existente; conteúdo diferente é conflito, sem duplicar pontuação/avaliação.
            if old:
                if old.stars!=form.validated_data['stars'] or old.comment!=form.validated_data['comment']:return Response({'detail':'Você já avaliou este treinamento.'},status=409)
                return Response({'stars':old.stars,'comment':old.comment,'created_at':old.created_at})
            fb=Feedback.objects.create(training=p.training,user=request.user,**form.validated_data)
            return Response({'stars':fb.stars,'comment':fb.comment,'created_at':fb.created_at},status=201)
        raise ValidationError('Ação inválida.')
