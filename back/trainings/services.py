"""Publica procedimento e quiz imutáveis; representa conteúdo, tentativa e conclusão."""
from rest_framework.exceptions import ValidationError
from guides.serializers import StepSerializer
from .models import QuizVersion, QuizQuestion, QuizAlternative
from .serializers import validate_complete_quiz
from .quiz import current_result, result_data
from .archive import freeze_files,snapshot_digest,version_label,version_info,audit
from config.release import release_info
from django.db import transaction
from rest_framework import serializers


@transaction.atomic
# Cria a versão publicada do treinamento para preservar o conteúdo cursado nas auditorias.
def publish(training, request):
    """Retorna a versão publicada. Rejeita guia na lixeira ou sem passos com ValidationError.

    Novas versões exigem cinco perguntas válidas. Versões antigas continuam
    sem obrigatoriedade retroativa. A view mantém o bloqueio e a transação.
    """
    if training.guide.trashed_at:
        raise ValidationError('O guia está na lixeira.')
    steps = list(training.guide.steps.all())
    if not steps:
        raise ValidationError('Adicione pelo menos um passo ao guia antes de publicar.')
    allowed = {'id', 'order', 'text', 'screenshot_url', 'narration_url', 'live_narration_url',
               'url', 'selector', 'element_text', 'annotations', 'action_type', 'click_x', 'click_y'}
    questions = validate_complete_quiz(training.draft_questions)
    data = StepSerializer(steps, many=True, context={'request': request}).data
    content = {'title': training.title, 'description': training.description,
               'steps': [{key: value for key, value in step.items() if key in allowed} for step in data],
               'document_profile': training.document_profile}
    # Não altera snapshots já vinculados a participantes que iniciaram o conteúdo.
    number = (training.versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
    notes=serializers.CharField(max_length=1000,allow_blank=True).run_validation(getattr(request,'data',{}).get('release_notes',''))
    version = QuizVersion.objects.create(training=training,number=number,content={},requires_quiz=True,label=version_label(number),
        published_by=request.user,app_version=release_info()['version'],
        release_notes=notes or ('Publicação inicial.' if number==1 else 'Nova publicação revisada.'))
    for order,q in enumerate(questions,1):
        question=QuizQuestion.objects.create(version=version,statement=q['statement'],explanation=q['explanation'],order=order)
        QuizAlternative.objects.bulk_create([QuizAlternative(question=question,order=i,**a) for i,a in enumerate(q['alternatives'],1)])
    version.content=freeze_files(version,content)
    version.integrity_sha256=snapshot_digest(version)
    version.save(update_fields=['content','integrity_sha256'])
    audit(training,'version_published',request.user,payload={'version':version.label,'number':number,'sha256':version.integrity_sha256,'app_version':version.app_version,'release_notes':version.release_notes})
    training.current_version = version
    training.status = 'published'
    training.save(update_fields=['current_version', 'status', 'updated_at'])
    return version


# Serializa a participação e inclui detalhes de auditoria somente para chamadas autorizadas.
def participation_data(part, *, include_audit=False):
    """Retorna progresso e tentativa da versão cursada, sem misturar resultados legados."""
    feedback = part.training.feedbacks.filter(user=part.user).first()
    data = {
        'started_at': part.started_at, 'completed_at': part.completed_at, 'assigned_at': part.assigned_at,
        'content_completed_at':part.content_completed_at or (part.completed_at if not part.version_id or not part.version.requires_quiz else None),
        'requires_quiz':bool(part.version_id and part.version.requires_quiz),
        'quiz':result_data(current_result(part),True) if part.version_id and part.version.requires_quiz else None,
        'attempt_limit':part.quiz_attempt_limit,
        'feedback': {'stars': feedback.stars, 'comment': feedback.comment,
                     'created_at': feedback.created_at} if feedback else None,
    }
    if include_audit:
        data.update(version_info=version_info(part.version), identity_snapshot=part.identity_snapshot)
    return data
