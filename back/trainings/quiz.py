"""Quiz versionado: respostas imutáveis, relógio do servidor e ranking autorizado pelas views."""
from math import ceil
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError, PermissionDenied
from .models import QuizResult, QuizAnswer


class AnswerInput(serializers.Serializer):
    result_id=serializers.IntegerField(min_value=1)
    question_id=serializers.IntegerField(min_value=1)
    alternative_id=serializers.IntegerField(min_value=1)


def current_result(part):
    """Considera somente tentativas da versão fixada quando o participante iniciou."""
    return QuizResult.objects.filter(training=part.training,user=part.user,version_id=part.version_id).order_by('-attempt').first()


def result_data(result, reveal=False):
    """Nunca expõe gabarito de tentativa pendente, mesmo na retomada da sessão."""
    if not result:return None
    answers=list(result.answers.select_related('question','alternative').order_by('question__order'))
    data={'id':result.id,'attempt':result.attempt,'started_at':result.started_at,'finished_at':result.finished_at,
          'answered':len(answers),'server_now':timezone.now(),'answers':[{'question_id':a.question_id,'alternative_id':a.alternative_id} for a in answers]}
    if result.finished_at:
        data.update(correct_count=result.correct_count,score=result.score,time_seconds=result.time_seconds,duration_ms=result.duration_ms)
        if reveal:
            data['review']=[{'question':a.question.statement,'selected':a.alternative.text,'correct':a.correct,
                            'correct_text':a.question.alternatives.get(correct=True).text,'explanation':a.question.explanation} for a in answers]
    return data


def question_data(part,result):
    """Uma pergunta por vez; nenhuma flag correta ou explicação antes do fim."""
    if result.finished_at:return None
    question=part.version.questions.exclude(pk__in=result.answers.values('question_id')).order_by('order').first()
    if not question:return None
    return {'id':question.id,'order':question.order,'statement':question.statement,
            'alternatives':list(question.alternatives.order_by('order').values('id','text'))}


def quiz_state(part):
    result=current_result(part)
    return {'result':result_data(result,True),'question':question_data(part,result) if result else None,
            'attempt_limit':part.quiz_attempt_limit,'server_now':timezone.now()}


def start_quiz(part):
    """A view bloqueia a participação: cliques/abas simultâneos retomam a mesma tentativa."""
    if not part.version or not part.version.requires_quiz:raise ValidationError('Esta versão não possui quiz obrigatório.')
    if not part.content_completed_at:raise PermissionDenied('Conclua o conteúdo antes de iniciar o quiz.')
    result=current_result(part)
    if result and (not result.finished_at or result.attempt>=part.quiz_attempt_limit):return quiz_state(part)
    if part.completed_at:raise ValidationError('O treinamento já foi concluído.')
    if part.version.questions.count()!=5:raise ValidationError('O quiz desta versão está incompleto. Contate o responsável.')
    QuizResult.objects.create(training=part.training,user=part.user,version=part.version,attempt=(result.attempt+1 if result else 1))
    return quiz_state(part)


def submit_answer(part,data):
    form=AnswerInput(data=data);form.is_valid(raise_exception=True);values=form.validated_data
    result=current_result(part)
    if not result or result.id!=values['result_id']:raise ValidationError('Tentativa inválida. Atualize o quiz.')
    old=result.answers.filter(question_id=values['question_id']).first()
    if old:
        if old.alternative_id!=values['alternative_id']:raise ValidationError('Esta resposta já foi confirmada e não pode ser alterada.')
        return quiz_state(part)
    if result.finished_at:raise ValidationError('Esta tentativa já foi finalizada.')
    question=part.version.questions.exclude(pk__in=result.answers.values('question_id')).order_by('order').first()
    if not question or question.id!=values['question_id']:raise ValidationError('Responda a pergunta atual antes de avançar.')
    alternative=question.alternatives.filter(pk=values['alternative_id']).first()
    if not alternative:raise ValidationError('A alternativa não pertence à pergunta.')
    QuizAnswer.objects.create(result=result,question=question,alternative=alternative,correct=alternative.correct)
    if result.answers.count()==5:
        result.finished_at=timezone.now()
        result.duration_ms=max(1,round((result.finished_at-result.started_at).total_seconds()*1000))
        result.time_seconds=ceil(result.duration_ms/1000)
        result.correct_count=result.answers.filter(correct=True).count();result.score=result.correct_count*20
        result.save(update_fields=['finished_at','duration_ms','time_seconds','correct_count','score'])
    return quiz_state(part)


def ranking(training,version,filters=None):
    """Uma tentativa final por pessoa/versão; empate exato compartilha posição."""
    if not version or not version.requires_quiz:return []
    # Mantém somente membros ainda autorizados e a versão efetivamente cursada.
    parts=training.participations.filter(version=version,user__is_active=True)
    if training.workspace_id:
        from django.db.models import Q
        parts=parts.filter(Q(user__workspaces=training.workspace)|Q(user_id=training.owner_id)|Q(user_id=training.workspace.owner_id)).distinct()
    participants=list(parts.select_related('user'))
    latest={}
    for result in QuizResult.objects.filter(training=training,version=version,user_id__in=[p.user_id for p in participants]).order_by('user_id','-attempt'):
        latest.setdefault(result.user_id,result)
    rows=[];filters=filters or {}
    for part in participants:
        result=latest.get(part.user_id)
        if not result or not result.finished_at:continue
        day=timezone.localtime(result.finished_at).date()
        if filters.get('start') and day<filters['start']:continue
        if filters.get('end') and day>filters['end']:continue
        if result.score<filters.get('min_score',0):continue
        rows.append({'user_id':part.user_id,'name':part.user.get_full_name() or part.user.username,
                     'score':result.score,'correct_count':result.correct_count,'duration_ms':result.duration_ms,
                     'time_seconds':result.time_seconds,'attempt':result.attempt,'version':version.number})
    rows.sort(key=lambda r:(-r['score'],r['duration_ms'],r['name'],r['user_id']))
    last=None;position=0
    for index,row in enumerate(rows,1):
        key=(row['score'],row['duration_ms'])
        if key!=last:position=index
        row['position']=position;last=key
    return rows
