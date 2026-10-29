from rest_framework import serializers
from guides.models import Guide
from django.db.models import Q
from .models import Training

class AlternativeInput(serializers.Serializer):
    text=serializers.CharField(max_length=500)
    correct=serializers.BooleanField()

class QuestionInput(serializers.Serializer):
    statement=serializers.CharField(max_length=1500)
    explanation=serializers.CharField(max_length=1500,allow_blank=True,required=False,default='')
    alternatives=AlternativeInput(many=True,min_length=4,max_length=4)
    def validate_alternatives(self,value):
        if sum(a['correct'] for a in value)!=1:raise serializers.ValidationError('Marque exatamente uma alternativa correta.')
        if len({a['text'].strip().casefold() for a in value})!=4:raise serializers.ValidationError('As quatro alternativas devem ser diferentes.')
        return value

class TrainingInput(serializers.ModelSerializer):
    draft_questions=serializers.JSONField(required=False)
    class Meta:
        model=Training
        fields=['guide','title','description','max_attempts','draft_questions']
    def validate_guide(self,guide):
        user=self.context['request'].user
        if guide.trashed_at or (guide.owner_id!=user.id and (not guide.workspace_id or guide.workspace.owner_id!=user.id or guide.status!='published')):
            raise serializers.ValidationError('Escolha um guia seu ou de um espaço que você administra.')
        return guide
    def validate_max_attempts(self,value):
        if not 1<=value<=5:raise serializers.ValidationError('Escolha de 1 a 5 tentativas.')
        return value
    def validate_draft_questions(self,value):
        if value==[]:return []
        questions=QuestionInput(data=value,many=True,min_length=5,max_length=5)
        questions.is_valid(raise_exception=True)
        return questions.validated_data

class FeedbackInput(serializers.Serializer):
    stars=serializers.IntegerField(min_value=1,max_value=5)
    comment=serializers.CharField(max_length=500,allow_blank=True,required=False,default='')

class AnswerInput(serializers.Serializer):
    result_id=serializers.IntegerField(min_value=1)
    question_id=serializers.IntegerField(min_value=1)
    alternative_id=serializers.IntegerField(min_value=1)

class AssignmentInput(serializers.Serializer):
    emails=serializers.ListField(child=serializers.EmailField(),min_length=1,max_length=200)
