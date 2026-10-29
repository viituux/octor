from django.contrib.auth.models import User
from django.db import transaction,IntegrityError,OperationalError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions,status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied,ValidationError
from rest_framework.throttling import ScopedRateThrottle
from guides.models import Guide,Workspace
from .models import Training,Participation,QuizResult,QuizAnswer,QuizAlternative,Feedback
from .permissions import managed,require_manager
from .serializers import TrainingInput,AssignmentInput,AnswerInput,FeedbackInput
from .services import publish,suggest,quiz_state,participation_data,answer_data,result_data
from .analytics import analytics,Filters,filtered


def admin_capability(user):
    return managed(user).exists() or Guide.objects.filter(owner=user,trashed_at__isnull=True).exists() or Workspace.objects.filter(owner=user).exists()


def training_data(t,admin=False):
    data={'id':t.id,'guide':t.guide_id,'title':t.title,'description':t.description,'status':t.status,'max_attempts':t.max_attempts,'workspace':t.workspace_id,'version':t.current_version.number if t.current_version_id else None}
    if admin:data['draft_questions']=t.draft_questions
    return data


class BaseView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def handle_exception(self,exc):
        # Unique constraints are the final guard against parallel duplicate submissions.
        if isinstance(exc,(IntegrityError,OperationalError)):
            return Response({'detail':'Outra atualização está em andamento. Atualize e tente novamente.'},status=409)
        return super().handle_exception(exc)


class CapabilitiesView(BaseView):
    def get(self,request):return Response({'can_manage':admin_capability(request.user)})


class AdminTrainingsView(BaseView):
    def get(self,request):
        if not admin_capability(request.user):raise PermissionDenied('Área disponível somente para responsáveis por treinamentos.')
        return Response(analytics(managed(request.user),request.query_params)['trainings'])
    def post(self,request):
        form=TrainingInput(data=request.data,context={'request':request});form.is_valid(raise_exception=True)
        t=form.save(owner=request.user,workspace=form.validated_data['guide'].workspace)
        return Response(training_data(t,True),status=201)


class AdminTrainingView(BaseView):
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
    @transaction.atomic
    def patch(self,request,pk):
        t=get_object_or_404(Training.objects.select_for_update(),pk=pk);require_manager(request.user,t)
        form=TrainingInput(t,data=request.data,partial=True,context={'request':request});form.is_valid(raise_exception=True)
        if 'guide' in form.validated_data and form.validated_data['guide'].pk!=t.guide_id:raise ValidationError('Crie outro treinamento para utilizar um guia diferente.')
        form.save();return Response(training_data(t,True))


class AdminActionView(BaseView):
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
                if not user:raise ValidationError({'emails':'Uma das pessoas ainda não possui conta no Octo.'})
                if t.workspace_id and not t.workspace.members.filter(pk=user.pk).exists():raise ValidationError({'emails':'Todos os participantes precisam pertencer ao espaço do treinamento.'})
                users.append(user)
            for user in users:Participation.objects.get_or_create(training=t,user=user)
            return Response({'assigned':len(users)})
        raise ValidationError('Ação inválida.')


class SuggestionsView(BaseView):
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='auth'
    def post(self,request,pk):
        t=get_object_or_404(managed(request.user),pk=pk)
        return Response({'questions':suggest(t),'requires_review':True})


class ParticipantInspectionView(BaseView):
    def get(self,request,pk,user_id):
        t=get_object_or_404(managed(request.user),pk=pk)
        part=get_object_or_404(t.participations.select_related('user'),user_id=user_id)
        return Response({'user':{'id':part.user_id,'name':part.user.get_full_name() or part.user.username},**participation_data(part)})


class DashboardView(BaseView):
    def get(self,request):
        if not admin_capability(request.user):raise PermissionDenied('Área administrativa.')
        query=managed(request.user)
        if request.query_params.get('training'):
            try:pk=int(request.query_params['training'])
            except ValueError:raise ValidationError('Treinamento inválido.')
            get_object_or_404(query,pk=pk);query=query.filter(pk=pk)
        return Response(analytics(query,request.query_params))


class MyTrainingsView(BaseView):
    def get(self,request):
        parts=Participation.objects.filter(Q(training__workspace__isnull=True)|Q(training__workspace__members=request.user)|Q(training__owner=request.user)|Q(training__workspace__owner=request.user),user=request.user).distinct().exclude(training__status='draft').select_related('training__current_version')
        return Response([{**training_data(p.training),'progress':participation_data(p)} for p in parts])


def my_part(user,pk,lock=False):
    query=Participation.objects.select_related('training__current_version','version').filter(Q(training__workspace__isnull=True)|Q(training__workspace__in=user.workspaces.all())|Q(training__owner=user)|Q(training__workspace__owner=user),user=user,training_id=pk)
    if lock:query=query.select_for_update(of=('self',))
    return get_object_or_404(query)


class MyTrainingView(BaseView):
    def get(self,request,pk):
        p=my_part(request.user,pk)
        if p.training.status=='draft':raise PermissionDenied('O treinamento ainda não foi publicado.')
        version=p.version or p.training.current_version
        return Response({**training_data(p.training),'content':version.content if version else None,'progress':participation_data(p)})


class LearningActionView(BaseView):
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
            if old:
                if old.alternative_id!=data['alternative_id']:return Response({'detail':'Esta pergunta já foi respondida.'},status=409)
                return Response({**quiz_state(result),'feedback':answer_data(old)})
            if result.finished_at:raise ValidationError('Esta tentativa já foi concluída.')
            question=get_object_or_404(result.version.questions,pk=data['question_id'])
            if question.order!=result.answers.count()+1:raise ValidationError('Responda às perguntas na ordem apresentada.')
            alternative=get_object_or_404(question.alternatives,pk=data['alternative_id'])
            answer=QuizAnswer.objects.create(result=result,question=question,alternative=alternative,correct=alternative.correct)
            if alternative.correct:result.correct_count+=1
            result.score=result.correct_count*100
            if result.answers.count()==5:
                result.finished_at=timezone.now();result.time_seconds=max(0,int((result.finished_at-result.started_at).total_seconds()))
            result.save(update_fields=['correct_count','score','finished_at','time_seconds'])
            return Response({**quiz_state(result),'feedback':answer_data(answer)})
        if action=='feedback':
            if not p.training.results.filter(user=request.user,finished_at__isnull=False).exists():raise PermissionDenied('Conclua o quiz antes de avaliar.')
            form=FeedbackInput(data=request.data);form.is_valid(raise_exception=True)
            old=p.training.feedbacks.filter(user=request.user).first()
            if old:
                if old.stars!=form.validated_data['stars'] or old.comment!=form.validated_data['comment']:return Response({'detail':'Você já avaliou este treinamento.'},status=409)
                return Response({'stars':old.stars,'comment':old.comment,'created_at':old.created_at})
            fb=Feedback.objects.create(training=p.training,user=request.user,**form.validated_data)
            return Response({'stars':fb.stars,'comment':fb.comment,'created_at':fb.created_at},status=201)
        raise ValidationError('Ação inválida.')
