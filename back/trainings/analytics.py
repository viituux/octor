"""Indicadores de conclusão e avaliação sobre o escopo autorizado de treinamentos."""
from collections import defaultdict
from django.utils import timezone
from rest_framework import serializers
from .models import Participation, Feedback


class Filters(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False)

    def validate(self, data):
        """Retorna filtros válidos ou ValidationError se o período estiver invertido."""
        if data.get('start') and data.get('end') and data['start'] > data['end']:
            raise serializers.ValidationError('O início deve ser anterior ao fim do período.')
        return data


def filtered(query, field, data):
    """Filtra QuerySet pela data de field; preserva seu escopo e retorna a consulta."""
    if data.get('start'):
        query = query.filter(**{field + '__date__gte': data['start']})
    if data.get('end'):
        query = query.filter(**{field + '__date__lte': data['end']})
    return query


def analytics(trainings, params):
    """Retorna métricas, ranking de avaliações, evolução e comentários; valida os filtros.

    A data de conclusão filtra conclusões e a de envio filtra avaliações.
    A base total de atribuídos é mantida para calcular a taxa de conclusão.
    """
    form = Filters(data=params)
    form.is_valid(raise_exception=True)
    filters = form.validated_data
    training_list = list(trainings)
    ids = [training.id for training in training_list]
    parts = list(Participation.objects.filter(training_id__in=ids))
    feedbacks = filtered(Feedback.objects.filter(training_id__in=ids), 'created_at', filters)
    if 'rating' in filters:
        feedbacks = feedbacks.filter(stars=filters['rating'])
    feedbacks = list(feedbacks.select_related('user', 'training'))
    completed = list(filtered(Participation.objects.filter(
        training_id__in=ids, completed_at__isnull=False), 'completed_at', filters))
    rows = []
    for training in training_list:
        participants = [p for p in parts if p.training_id == training.id]
        evaluations = [f for f in feedbacks if f.training_id == training.id]
        completions = [p for p in completed if p.training_id == training.id]
        rows.append({
            'id': training.id, 'title': training.title, 'status': training.status,
            'participants': len(participants), 'evaluations': len(evaluations),
            'average_stars': round(sum(f.stars for f in evaluations) / len(evaluations), 2) if evaluations else None,
            'completions': len(completions),
            'completion_rate': round(100 * len(completions) / len(participants), 1) if participants else 0,
        })
    months = defaultdict(lambda: {'completions': 0, 'stars': []})
    for part in completed:
        months[timezone.localtime(part.completed_at).strftime('%Y-%m')]['completions'] += 1
    for feedback in feedbacks:
        months[timezone.localtime(feedback.created_at).strftime('%Y-%m')]['stars'].append(feedback.stars)
    # Mantém meses sem atividade para não disfarçar lacunas no gráfico.
    if months:
        last = max(months)
        year, month = map(int, min(months).split('-'))
        while f'{year:04d}-{month:02d}' <= last:
            months[f'{year:04d}-{month:02d}']
            month += 1
            if month == 13:
                year, month = year + 1, 1
    timeline = [{
        'month': key, 'completions': value['completions'],
        'average_stars': round(sum(value['stars']) / len(value['stars']), 2) if value['stars'] else None,
    } for key, value in sorted(months.items())]
    return {
        'trainings': rows,
        'metrics': {
            'completed': len(completed),
            'average_stars': round(sum(f.stars for f in feedbacks) / len(feedbacks), 2) if feedbacks else None,
            'comments': sum(bool(f.comment.strip()) for f in feedbacks),
        },
        'training_ranking': sorted([r for r in rows if r['evaluations']],
                                   key=lambda row: (-row['average_stars'], -row['evaluations'], row['title'])),
        'timeline': timeline,
        'latest_comments': [{
            'training_id': f.training_id, 'training': f.training.title,
            'user': f.user.get_full_name() or f.user.username,
            'stars': f.stars, 'comment': f.comment, 'created_at': f.created_at,
        } for f in sorted(feedbacks, key=lambda f: f.created_at, reverse=True) if f.comment.strip()][:10],
    }
