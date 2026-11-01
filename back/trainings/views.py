# Conteúdo e avaliação do treinamento; permissões, bloqueios e idempotência preservados.
from django.contrib.auth.models import User
from django.db import transaction, IntegrityError, OperationalError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from guides.models import Guide, Workspace
from .models import Training, Participation, Feedback
from .permissions import managed, require_manager
from .serializers import TrainingInput, AssignmentInput, FeedbackInput
from .services import publish, participation_data
from .analytics import analytics, Filters, filtered

def admin_capability(user):
    """Retorna se o usuário pode acessar a gestão conforme seus guias e equipes."""
    return managed(user).exists() or Guide.objects.filter(owner=user, trashed_at__isnull=True).exists() or Workspace.objects.filter(owner=user).exists()

def training_data(t, admin=False):
    """Retorna o contrato do treinamento sem configurações ou resultados de quiz."""
    return {'id': t.id, 'guide': t.guide_id, 'title': t.title, 'description': t.description, 'status': t.status, 'workspace': t.workspace_id, 'version': t.current_version.number if t.current_version_id else None}

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
        """Publica, arquiva ou atribui após verificar o responsável. Publicação congela apenas o procedimento."""
        t = get_object_or_404(Training.objects.select_for_update(), pk=pk)
        require_manager(request.user, t)
        if action == 'suggestions':
            return Response({'detail': 'O quiz foi removido dos treinamentos.'}, status=410)
        if action == 'publish':
            publish(t, request)
            return Response(training_data(t, True))
        if action == 'archive':
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
                Participation.objects.get_or_create(training=t, user=user)
            return Response({'assigned': len(users)})
        raise ValidationError('Ação inválida.')

class ParticipantInspectionView(BaseView):

    def get(self, request, pk, user_id):
        """Atende GET em ParticipantInspectionView; recebe request e parâmetros da URL, retorna Response ou falha de permissão/validação."""
        t = get_object_or_404(managed(request.user), pk=pk)
        part = get_object_or_404(t.participations.select_related('user'), user_id=user_id)
        return Response({'user': {'id': part.user_id, 'name': part.user.get_full_name() or part.user.username}, **participation_data(part)})

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
        parts = Participation.objects.filter(Q(training__workspace__isnull=True) | Q(training__workspace__members=request.user) | Q(training__owner=request.user) | Q(training__workspace__owner=request.user), user=request.user).distinct().exclude(training__status='draft').select_related('training__current_version')
        return Response([{**training_data(p.training), 'progress': participation_data(p)} for p in parts])

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
        return Response({**training_data(p.training), 'content': version.content if version else None, 'progress': participation_data(p)})

class LearningActionView(BaseView):

    @transaction.atomic
    def post(self, request, pk, action):
        """Inicia, conclui ou avalia a participação autenticada em uma transação. Ações antigas de quiz retornam 410."""
        p = my_part(request.user, pk, True)
        if action in ('quiz-start', 'answer'):
            return Response({'detail': 'O quiz foi removido dos treinamentos.'}, status=410)
        if p.training.status != 'published':
            raise ValidationError('Este treinamento não está disponível para novas atividades.')
        if action == 'start':
            if not p.started_at:
                p.started_at = timezone.now()
                p.version = p.training.current_version
                p.save(update_fields=['started_at', 'version'])
            return Response(participation_data(p))
        if action == 'complete':
            if not p.started_at:
                raise ValidationError('Inicie o treinamento antes de concluir.')
            if not p.completed_at:
                p.completed_at = timezone.now()
                p.save(update_fields=['completed_at'])
            return Response(participation_data(p))
        if action == 'feedback':
            if not p.completed_at:
                raise PermissionDenied('Conclua o conteúdo antes de avaliar o treinamento.')
            form = FeedbackInput(data=request.data)
            form.is_valid(raise_exception=True)
            old = p.training.feedbacks.filter(user=request.user).first()
            if old:
                if old.stars != form.validated_data['stars'] or old.comment != form.validated_data['comment']:
                    return Response({'detail': 'Você já avaliou este treinamento.'}, status=409)
                return Response({'stars': old.stars, 'comment': old.comment, 'created_at': old.created_at})
            fb = Feedback.objects.create(training=p.training, user=request.user, **form.validated_data)
            return Response({'stars': fb.stars, 'comment': fb.comment, 'created_at': fb.created_at}, status=201)
        raise ValidationError('Ação inválida.')
