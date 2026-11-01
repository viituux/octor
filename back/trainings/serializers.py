"""Valida cadastro de treinamento, atribuição e avaliação, sem entradas de quiz."""
from rest_framework import serializers
from .models import Training


class TrainingInput(serializers.ModelSerializer):
    class Meta:
        model = Training
        fields = ['guide', 'title', 'description']

    def to_internal_value(self, data):
        """Rejeita campos removidos; retorna os dados do contrato atual ou ValidationError."""
        if any(key in data for key in ('draft_questions', 'max_attempts')):
            raise serializers.ValidationError({'non_field_errors': ['O quiz foi removido dos treinamentos. Envie somente os dados do procedimento.']})
        return super().to_internal_value(data)

    def validate_guide(self, guide):
        """Aceita guia próprio ou publicado de equipe administrada; caso contrário, rejeita."""
        user = self.context['request'].user
        if guide.trashed_at or (guide.owner_id != user.id and (
            not guide.workspace_id or guide.workspace.owner_id != user.id or guide.status != 'published'
        )):
            raise serializers.ValidationError('Escolha um guia seu ou de um espaço que você administra.')
        return guide


class FeedbackInput(serializers.Serializer):
    stars = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=500, allow_blank=True, required=False, default='')


class AssignmentInput(serializers.Serializer):
    emails = serializers.ListField(child=serializers.EmailField(), min_length=1, max_length=200)
