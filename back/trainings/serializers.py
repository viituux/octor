"""Valida rascunhos do quiz, atribuição e avaliação; publicação exige completude."""
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from .models import Training


class AlternativeDraft(serializers.Serializer):
    text=serializers.CharField(max_length=500,allow_blank=True)
    correct=serializers.BooleanField()


class QuestionDraft(serializers.Serializer):
    statement=serializers.CharField(max_length=1500,allow_blank=True)
    explanation=serializers.CharField(max_length=1500,allow_blank=True,default='')
    alternatives=AlternativeDraft(many=True,min_length=4,max_length=4)


def validate_complete_quiz(data):
    """Valida a estrutura completa usada na publicação e nas sugestões."""
    questions=QuestionDraft(data=data,many=True,min_length=5,max_length=5)
    questions.is_valid(raise_exception=True)
    for index,q in enumerate(questions.validated_data,1):
        if not q['statement'].strip() or any(not a['text'].strip() for a in q['alternatives']) or sum(a['correct'] for a in q['alternatives'])!=1:
            raise ValidationError(f'Pergunta {index}: preencha enunciado, quatro alternativas e marque exatamente uma correta.')
        if len({a['text'].strip().casefold() for a in q['alternatives']})!=4:
            raise ValidationError(f'Pergunta {index}: as quatro alternativas devem ser diferentes.')
    return questions.validated_data


class DocumentProfileInput(serializers.Serializer):
    objective = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    audience = serializers.CharField(max_length=500, required=False, allow_blank=True)
    prerequisites = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)
    final_check = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class TrainingInput(serializers.ModelSerializer):
    document_profile = DocumentProfileInput(required=False)
    draft_questions=QuestionDraft(many=True,max_length=5,required=False)
    class Meta:
        model = Training
        fields = ['guide', 'title', 'description', 'draft_questions', 'document_profile']

    def to_internal_value(self, data):
        """Tentativas são liberadas individualmente; não aceita alteração global por este contrato."""
        if 'max_attempts' in data:
            raise serializers.ValidationError({'max_attempts':'Use a liberação individual de nova tentativa.'})
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
