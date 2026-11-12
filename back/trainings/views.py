from collections.abc import Mapping
from accounts.training_consent import accept_training_consent, has_current_consent
from accounts.notifications import notify
# Conteúdo e avaliação do treinamento; permissões, bloqueios e idempotência preservados.
from django.contrib.auth.models import User
from django.db import transaction, IntegrityError, OperationalError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from ai.tasks import GenerationError
from .quiz_suggestions import suggest_questions
from rest_framework.exceptions import PermissionDenied, ValidationError
from guides.models import Guide, Workspace
from .models import Training, Participation, Feedback
from .permissions import managed, require_manager
from .serializers import TrainingInput, AssignmentInput, FeedbackInput
from .services import publish, participation_data
from .analytics import analytics, Filters, filtered
from .quiz import start_quiz, submit_answer, quiz_state, current_result, ranking, result_data
from .archive import version_info,identity,audit,audit_data,readable_content

def admin_capability(user):
    """Retorna se o usuário pode acessar a gestão conforme seus guias e equipes."""
    return managed(user).exists() or Guide.objects.filter(owner=user, trashed_at__isnull=True).exists() or Workspace.objects.filter(owner=user).exists()

def training_data(t, admin=False):
    """Oculta o rascunho/gabarito das consultas de participantes."""
    data={'id': t.id, 'guide': t.guide_id, 'title': t.title, 'description': t.description, 'status': t.status, 'workspace': t.workspace_id, 'version': t.current_version.number if t.current_version_id else None}
    if admin:
        data.update(draft_questions=t.draft_questions, version_info=version_info(t.current_version),
                    document_profile=t.document_profile)
    return data


def participant_header(part):
    """Não troca título, descrição ou versão na listagem de uma participação iniciada."""
    header=training_data(part.training);version=part.version or part.training.current_version
    if version:header.update(title=version.content.get('title',header['title']),description=version.content.get('description',header['description']),version=version.number)
    return header

class BaseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def handle_exception(self, exc):
        """Converte conflitos de gravação em 409; demais erros seguem o tratamento DRF."""
        if isinstance(exc, (IntegrityError, OperationalError)):
            return Response({'detail': 'Outra atualização está em andamento. Atualize e tente novamente.'}, status=409)
        return super().handle_exception(exc)

class CapabilitiesView(BaseView):

    def get(self, request):
        """Atende GET em CapabilitiesView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        return Response({'can_manage': admin_capability(request.user)})

class AdminTrainingsView(BaseView):

    def get(self, request):
        """Atende GET em AdminTrainingsView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        if not admin_capability(request.user):
            raise PermissionDenied('Área disponível somente para responsáveis por treinamentos.')
        return Response(analytics(managed(request.user), request.query_params)['trainings'])

    def post(self, request):
        """Atende POST em AdminTrainingsView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        form = TrainingInput(data=request.data, context={'request': request})
        form.is_valid(raise_exception=True)
        t = form.save(owner=request.user, workspace=form.validated_data['guide'].workspace)
        return Response(training_data(t, True), status=201)

class QuizSuggestionThrottle(UserRateThrottle):
    scope = 'training_quiz_suggestions'
    rate = '5/min'


class QuizSuggestionsView(BaseView):
    throttle_classes = [QuizSuggestionThrottle]

    def post(self, request):
        """Sugere perguntas para um guia elegível, inclusive antes de criar o treinamento."""
        form = TrainingInput(data=request.data, context={'request': request})
        form.is_valid(raise_exception=True)
        values = form.validated_data
        try:
            questions = suggest_questions(
                values['guide'], values['title'], values.get('description', ''), actor=request.user,
            )
        except GenerationError as exc:
            return Response({'detail': str(exc)}, status=503)
        return Response({'questions': questions})


class AdminTrainingView(BaseView):

    def get(self, request, pk):
        """Atende GET em AdminTrainingView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        t = get_object_or_404(managed(request.user).select_related('current_version'), pk=pk)
        data = training_data(t, True)
        data['summary'] = analytics(managed(request.user).filter(pk=pk), request.query_params)['trainings'][0]
        filters = Filters(data=request.query_params)
        filters.is_valid(raise_exception=True)
        f = filters.validated_data
        parts = t.participations.select_related('user').order_by('user__first_name', 'user__username')
        if f.get('start') or f.get('end'):
            parts = filtered(parts, 'completed_at', f)
        rows = []
        for p in parts:
            fb = t.feedbacks.filter(user=p.user).first()
            if 'rating' in f and (not fb or fb.stars != f['rating']):
                continue
            rows.append({'id': p.user_id, 'name': p.user.get_full_name() or p.user.username, 'email': p.user.email, 'started': bool(p.started_at), 'completed': bool(p.completed_at), 'evaluated': bool(fb), 'commented': bool(fb and fb.comment.strip()), 'stars': fb.stars if fb else None, 'date': fb.created_at if fb else p.completed_at or p.assigned_at})
        data['participants'] = rows
        for row in rows:
            part=parts.get(user_id=row['id'])
            row.update(participation_data(part, include_audit=True))
        if 'min_score' in f:data['participants']=[r for r in rows if r['quiz'] and r['quiz'].get('score',-1)>=f['min_score']]
        version=t.current_version
        if request.query_params.get('version'):
            from rest_framework import serializers
            number=serializers.IntegerField(min_value=1).run_validation(request.query_params['version'])
            version=get_object_or_404(t.versions,number=number)
        data['versions']=list(t.versions.filter(requires_quiz=True).order_by('-number').values_list('number',flat=True))
        data['version_history']=[version_info(v) for v in t.versions.order_by('-number')]
        data['ranking']=ranking(t,version,f)
        data['ranking_version']=version.number if version else None
        return Response(data)

    @transaction.atomic
    def patch(self, request, pk):
        """Atende PATCH em AdminTrainingView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        t = get_object_or_404(Training.objects.select_for_update(), pk=pk)
        require_manager(request.user, t)
        form = TrainingInput(t, data=request.data, partial=True, context={'request': request})
        form.is_valid(raise_exception=True)
        if 'guide' in form.validated_data and form.validated_data['guide'].pk != t.guide_id:
            raise ValidationError('Crie outro treinamento para utilizar um guia diferente.')
        form.save()
        return Response(training_data(t, True))

class AdminActionView(BaseView):

    @transaction.atomic
    def post(self, request, pk, action):
        """Publica conteúdo/quiz, atribui, arquiva ou libera tentativa após autorização."""
        t = get_object_or_404(Training.objects.select_for_update(), pk=pk)
        require_manager(request.user, t)
        if action == 'suggestions':
            return Response({'detail': 'Sugestões automáticas não estão disponíveis. Cadastre e revise as cinco perguntas no editor.'}, status=410)
        if action == 'publish':
            if request.data.get('quiz_reviewed') is not True:raise ValidationError('Confirme a revisão das cinco perguntas antes de publicar.')
            publish(t, request)
            return Response(training_data(t, True))
        if action=='allow-retry':
            from rest_framework import serializers
            user_id=serializers.IntegerField(min_value=1).run_validation(request.data.get('user_id'))
            part=get_object_or_404(t.participations.select_for_update(),user_id=user_id)
            result=current_result(part)
            if not result or not result.finished_at or not part.version.requires_quiz:raise ValidationError('Não há tentativa finalizada para liberar.')
            if part.completed_at or t.feedbacks.filter(user_id=user_id).exists():raise ValidationError('A conclusão já foi registrada. Crie outro treinamento para uma nova avaliação.')
            if part.quiz_attempt_limit>result.attempt:return Response({'attempt_limit':part.quiz_attempt_limit})
            if part.quiz_attempt_limit>=5:raise ValidationError('O limite de cinco tentativas foi atingido.')
            part.quiz_attempt_limit+=1;part.save(update_fields=['quiz_attempt_limit'])
            audit(t,'retry_allowed',request.user,part,{'attempt_limit':part.quiz_attempt_limit})
            return Response({'attempt_limit':part.quiz_attempt_limit})
        if action == 'archive':
            if t.status!='archived':audit(t,'training_archived',request.user)
            t.status = 'archived'
            t.save(update_fields=['status', 'updated_at'])
            return Response(training_data(t, True))
        if action == 'assign':
            form = AssignmentInput(data=request.data)
            form.is_valid(raise_exception=True)
            users = []
            for email in set((x.lower() for x in form.validated_data['emails'])):
                user = User.objects.filter(email__iexact=email, is_active=True).first()
                if not user:
                    raise ValidationError({'emails': 'Uma das pessoas ainda não possui conta no OCTOR.'})
                if t.workspace_id and (not t.workspace.members.filter(pk=user.pk).exists()):
                    raise ValidationError({'emails': 'Todos os participantes precisam pertencer ao espaço do treinamento.'})
                users.append(user)
            for user in users:
                part, created = Participation.objects.get_or_create(training=t, user=user)
                if created:
                    audit(t,'assigned',request.user,part,{'user_id':user.pk})
                    if t.status == 'draft':
                        notify(user, 'training_assigned', 'Treinamento atribuído',
                               f'{t.title} está aguardando publicação.', '/trainings')
                    else:
                        notify(user, 'training_assigned', 'Novo treinamento disponível',
                               f'Você recebeu o treinamento {t.title}.', f'/trainings/{t.id}')
            return Response({'assigned': len(users)})
        raise ValidationError('Ação inválida.')

class ParticipantInspectionView(BaseView):

    def get(self, request, pk, user_id):
        """Atende GET em ParticipantInspectionView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        t = get_object_or_404(managed(request.user), pk=pk)
        part = get_object_or_404(t.participations.select_related('user'), user_id=user_id)
        return Response({'user': {'id': part.user_id, 'name': part.user.get_full_name() or part.user.username}, **participation_data(part, include_audit=True),
                         'audit':audit_data(part),
                         'attempts':[result_data(r,True) for r in t.results.filter(user_id=user_id,version__requires_quiz=True).order_by('-attempt')]})

class DashboardView(BaseView):

    def get(self, request):
        """Atende GET em DashboardView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        if not admin_capability(request.user):
            raise PermissionDenied('Área administrativa.')
        query = managed(request.user)
        if request.query_params.get('training'):
            try:
                pk = int(request.query_params['training'])
            except ValueError:
                raise ValidationError('Treinamento inválido.')
            get_object_or_404(query, pk=pk)
            query = query.filter(pk=pk)
        return Response(analytics(query, request.query_params))

class MyTrainingsView(BaseView):

    def get(self, request):
        """Atende GET em MyTrainingsView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        parts = Participation.objects.filter(
            Q(training__workspace__isnull=True)
            | Q(training__workspace__members=request.user)
            | Q(training__owner=request.user)
            | Q(training__workspace__owner=request.user),
            user=request.user,
        ).distinct().select_related('training__current_version', 'version')
        items = []
        for part in parts:
            training = part.training
            if training.status == 'draft':
                # Identifica a atribuição sem entregar a descrição, os passos ou o gabarito do rascunho.
                items.append({'id': training.id, 'title': training.title, 'status': 'draft'})
                continue
            version = part.version or training.current_version
            steps = version.content.get('steps', []) if version else []
            items.append({
                **participant_header(part), 'progress': participation_data(part),
                'step_count': len(steps),
                'reference_only': any(step.get('action_type') == 'reference' for step in steps),
            })
        return Response(items)

def my_part(user, pk, lock=False):
    """Busca a participação autorizada; lock ativa bloqueio transacional. Ausência gera 404."""
    query = Participation.objects.select_related('training__current_version', 'version').filter(Q(training__workspace__isnull=True) | Q(training__workspace__in=user.workspaces.all()) | Q(training__owner=user) | Q(training__workspace__owner=user), user=user, training_id=pk)
    if lock:
        query = query.select_for_update(of=('self',))
    return get_object_or_404(query)

class MyTrainingView(BaseView):

    def get(self, request, pk):
        """Atende GET em MyTrainingView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        p = my_part(request.user, pk)
        if p.training.status == 'draft':
            raise PermissionDenied('O treinamento ainda não foi publicado.')
        version = p.version or p.training.current_version
        header=participant_header(p)
        snapshot = readable_content(version) if version else {}
        content = {
            key: snapshot[key]
            for key in ('title', 'description', 'steps')
            if key in snapshot
        } if version else None
        return Response({**header, 'content': content, 'progress': participation_data(p),
                         'ranking':ranking(p.training,version),'ranking_version':version.number if version else None})

class LearningActionView(BaseView):

    @transaction.atomic
    def post(self, request, pk, action):
        """Bloqueia a participação para serializar início, respostas, fim do conteúdo e avaliação."""
        p = my_part(request.user, pk, True)
        if p.training.status != 'published':
            raise ValidationError('Este treinamento não está disponível para novas atividades.')
        if action == 'start':
            if not p.started_at:
                if not has_current_consent(request.user):
                    version = request.data.get('consent_version') if isinstance(request.data, Mapping) else None
                    accept_training_consent(request.user, version, 'training')
                p.started_at = timezone.now()
                p.version = p.training.current_version
                p.identity_snapshot=identity(request.user)
                p.save(update_fields=['started_at', 'version','identity_snapshot'])
                audit(p.training,'training_started',request.user,p,{'identity':p.identity_snapshot,'version':p.version.label,'sha256':p.version.integrity_sha256})
            return Response(participation_data(p))
        if action == 'complete':
            if not p.started_at:
                raise ValidationError('Inicie o treinamento antes de concluir.')
            if not p.content_completed_at:
                p.content_completed_at=timezone.now()
                if not p.version or not p.version.requires_quiz:p.completed_at=p.content_completed_at
                p.save(update_fields=['content_completed_at','completed_at'])
                audit(p.training,'content_finished',request.user,p,{'version':p.version.label if p.version else None})
            return Response(participation_data(p))
        if action=='quiz-start':
            before=current_result(p);state=start_quiz(p)
            if not before or before.pk!=state['result']['id']:audit(p.training,'quiz_started',request.user,p,{'result_id':state['result']['id'],'attempt':state['result']['attempt']})
            return Response(state)
        if action=='quiz-state':return Response(quiz_state(p))
        if action=='answer':
            before=current_result(p);count=before.answers.count() if before else 0
            state=submit_answer(p,request.data)
            if state['result']['answered']>count:
                audit(p.training,'quiz_answered',request.user,p,{'result_id':state['result']['id'],'question_id':request.data['question_id'],'alternative_id':request.data['alternative_id']})
                if state['result']['finished_at']:audit(p.training,'quiz_finished',request.user,p,{'result_id':state['result']['id'],'score':state['result']['score'],'duration_ms':state['result']['duration_ms']})
            return Response(state)
        if action == 'feedback':
            required=bool(p.version_id and p.version.requires_quiz)
            result=current_result(p) if required else None
            if required and (not result or not result.finished_at or p.quiz_attempt_limit>result.attempt):raise PermissionDenied('Finalize sua tentativa do quiz antes de avaliar.')
            if not (p.content_completed_at or p.completed_at):
                raise PermissionDenied('Conclua o conteúdo antes de avaliar o treinamento.')
            form = FeedbackInput(data=request.data)
            form.is_valid(raise_exception=True)
            old = p.training.feedbacks.filter(user=request.user).first()
            if old:
                if old.stars != form.validated_data['stars'] or old.comment != form.validated_data['comment']:
                    return Response({'detail': 'Você já avaliou este treinamento.'}, status=409)
                return Response({'stars': old.stars, 'comment': old.comment, 'created_at': old.created_at})
            fb = Feedback.objects.create(training=p.training, user=request.user, **form.validated_data)
            if not p.completed_at:
                p.completed_at=timezone.now();p.save(update_fields=['completed_at'])
            audit(p.training,'training_completed',request.user,p,{'feedback_id':fb.pk,'stars':fb.stars,'comment':fb.comment,'version':p.version.label if p.version else None})
            return Response({'stars': fb.stars, 'comment': fb.comment, 'created_at': fb.created_at}, status=201)
        raise ValidationError('Ação inválida.')
