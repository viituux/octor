"""Publica snapshots do procedimento e representa seu progresso e feedback."""
from rest_framework.exceptions import ValidationError
from guides.serializers import StepSerializer
from .models import QuizVersion


def publish(training, request):
    """Retorna a versão publicada. Rejeita guia na lixeira ou sem passos com ValidationError.

    QuizVersion mantém seu nome de banco por compatibilidade; agora guarda apenas
    o snapshot do procedimento, sem criar perguntas, alternativas ou tentativas.
    A view chamadora mantém o bloqueio e a transação da publicação.
    """
    if training.guide.trashed_at:
        raise ValidationError('O guia está na lixeira.')
    steps = list(training.guide.steps.all())
    if not steps:
        raise ValidationError('Adicione pelo menos um passo ao guia antes de publicar.')
    allowed = {'id', 'order', 'text', 'screenshot_url', 'narration_url', 'live_narration_url',
               'url', 'selector', 'element_text', 'annotations', 'action_type', 'click_x', 'click_y'}
    data = StepSerializer(steps, many=True, context={'request': request}).data
    content = {'title': training.title, 'description': training.description,
               'steps': [{key: value for key, value in step.items() if key in allowed} for step in data]}
    # Não altera snapshots já vinculados a participantes que iniciaram o conteúdo.
    number = (training.versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
    version = QuizVersion.objects.create(training=training, number=number, content=content)
    training.current_version = version
    training.status = 'published'
    training.save(update_fields=['current_version', 'status', 'updated_at'])
    return version


def participation_data(part):
    """Recebe Participation e retorna datas e avaliação, sem consultar/expor resultados antigos."""
    feedback = part.training.feedbacks.filter(user=part.user).first()
    return {
        'started_at': part.started_at, 'completed_at': part.completed_at, 'assigned_at': part.assigned_at,
        'feedback': {'stars': feedback.stars, 'comment': feedback.comment,
                     'created_at': feedback.created_at} if feedback else None,
    }
