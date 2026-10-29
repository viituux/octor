import json
from unittest.mock import patch
from datetime import timedelta
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.db import IntegrityError,transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from guides.models import Guide,Step,Workspace
from .models import Training,Participation,QuizResult,QuizAnswer,Feedback
from .management.commands.seed_trainings import demo_questions

class TrainingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner=User.objects.create_user('manager',email='manager@example.com')
        self.user=User.objects.create_user('learner',email='learner@example.com',first_name='Learner')
        self.other=User.objects.create_user('other',email='other@example.com')
        self.space=Workspace.objects.create(name='Equipe',owner=self.owner);self.space.members.add(self.owner,self.user,self.other)
        self.guide=Guide.objects.create(owner=self.owner,workspace=self.space,title='Cadastro',status='published',description='Abra a área de clientes, preencha nome e e-mail, revise os dados e clique em Salvar para confirmar o cadastro.')
        Step.objects.create(guide=self.guide,text=self.guide.description,url='https://example.com',order=1)
        self.client.force_authenticate(self.owner)
        response=self.client.post('/api/trainings/admin/',{'guide':self.guide.id,'title':'Cadastro','description':self.guide.description,'draft_questions':demo_questions()},format='json')
        self.assertEqual(response.status_code,201,response.data);self.training=Training.objects.get(pk=response.data['id']);self.base=f'/api/trainings/{self.training.id}/';self.admin=f'/api/trainings/admin/{self.training.id}/'
        response=self.client.post(self.admin+'publish/',{'review_approved':True},format='json');self.assertEqual(response.status_code,200,response.data);self.training.refresh_from_db()
        Participation.objects.create(training=self.training,user=self.user)
        self.client.force_authenticate(self.user)
    def start_quiz(self):
        self.assertEqual(self.client.post(self.base+'start/').status_code,200)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,200)
        result=self.client.post(self.base+'quiz-start/');self.assertIn(result.status_code,[200,201]);return result.data
    def answer(self,state,correct=True):
        question=state['question'];q=self.training.versions.get(pk=QuizResult.objects.get(pk=state['result']['id']).version_id).questions.get(pk=question['id']);alternative=q.alternatives.filter(correct=correct).first()
        return self.client.post(self.base+'answer/',{'result_id':state['result']['id'],'question_id':q.pk,'alternative_id':alternative.pk},format='json')
    def finish(self,correct_count=5):
        state=self.start_quiz()
        for i in range(5):
            response=self.answer(state,i<correct_count);self.assertEqual(response.status_code,200,response.data);state=response.data
        return state
    def test_participant_cannot_access_admin_or_others(self):
        self.assertEqual(self.client.get('/api/trainings/admin/').status_code,403)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/').status_code,403)
        self.assertEqual(self.client.get(self.admin).status_code,404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.post(self.base+'start/').status_code,404)
    def test_quiz_requires_content_completion_and_feedback_requires_quiz(self):
        self.assertEqual(self.client.post(self.base+'quiz-start/').status_code,403)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,400)
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':5},format='json').status_code,403)
    def test_start_complete_and_quiz_resume_are_idempotent(self):
        state=self.start_quiz();again=self.client.post(self.base+'quiz-start/').data
        self.assertEqual(state['result']['id'],again['result']['id'])
        self.assertEqual(QuizResult.objects.count(),1)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,200)
    def test_correct_answers_are_not_exposed_before_answering(self):
        state=self.start_quiz()
        self.assertNotIn('explanation',state['question'])
        for option in state['question']['alternatives']:self.assertEqual(set(option),{'id','text'})
        self.assertEqual(state['result']['answers'],[])
        result=self.answer(state).data;self.assertTrue(result['feedback']['correct']);self.assertTrue(result['feedback']['explanation'])
    def test_answers_are_immutable_and_duplicate_does_not_inflate_score(self):
        state=self.start_quiz();first=self.answer(state);second=self.answer(state)
        self.assertEqual(first.status_code,200);self.assertEqual(second.status_code,200)
        self.assertEqual(second.data['result']['score'],100);self.assertEqual(QuizAnswer.objects.count(),1)
        self.assertEqual(self.answer(state,False).status_code,409)
    def test_wrong_order_foreign_option_and_foreign_result_rejected(self):
        state=self.start_quiz();result=QuizResult.objects.first();q2=result.version.questions.get(order=2);a2=q2.alternatives.first()
        body={'result_id':result.id,'question_id':q2.id,'alternative_id':a2.id}
        self.assertEqual(self.client.post(self.base+'answer/',body,format='json').status_code,400)
        body['question_id']=state['question']['id'];self.assertEqual(self.client.post(self.base+'answer/',body,format='json').status_code,404)
        self.client.force_authenticate(self.other);self.assertEqual(self.client.post(self.base+'answer/',body,format='json').status_code,404)
    def test_result_score_time_and_attempt_limit(self):
        state=self.finish(4);r=state['result']
        self.assertEqual(r['correct_count'],4);self.assertEqual(r['percent'],80);self.assertEqual(r['score'],400);self.assertIsNotNone(r['finished_at']);self.assertGreaterEqual(r['time_seconds'],0)
        again=self.client.post(self.base+'quiz-start/');self.assertEqual(again.data['result']['id'],r['id']);self.assertEqual(QuizResult.objects.count(),1)
    def test_feedback_validation_idempotency_and_unique_constraint(self):
        self.finish(0)
        for data in [{'stars':0},{'stars':6},{'stars':5,'comment':'a'*501}]:self.assertEqual(self.client.post(self.base+'feedback/',data,format='json').status_code,400)
        data={'stars':4,'comment':'Muito claro.'}
        self.assertEqual(self.client.post(self.base+'feedback/',data,format='json').status_code,201)
        self.assertEqual(self.client.post(self.base+'feedback/',data,format='json').status_code,200)
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':3},format='json').status_code,409)
        self.assertEqual(Feedback.objects.count(),1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():Feedback.objects.create(training=self.training,user=self.user,stars=5)
    def test_published_quiz_versions_preserve_started_content(self):
        self.client.post(self.base+'start/');part=Participation.objects.get(user=self.user,training=self.training);old=part.version_id
        self.client.force_authenticate(self.owner)
        Step.objects.filter(guide=self.guide).update(text='Conteúdo revisado')
        self.client.patch(self.admin,{'title':'Revisado','draft_questions':demo_questions()},format='json')
        self.client.post(self.admin+'publish/',{'review_approved':True},format='json')
        self.client.force_authenticate(self.user)
        self.assertNotEqual(Training.objects.get(pk=self.training.pk).current_version_id,old)
        self.assertNotEqual(self.client.get(self.base).data['content']['steps'][0]['text'],'Conteúdo revisado')
        self.client.force_authenticate(self.owner);self.client.post(self.admin+'assign/',{'emails':[self.other.email]},format='json');self.client.force_authenticate(self.other);self.client.post(self.base+'start/')
        self.assertEqual(self.client.get(self.base).data['content']['steps'][0]['text'],'Conteúdo revisado')
    def test_best_attempt_only_in_rankings(self):
        self.training.max_attempts=2;self.training.save()
        self.finish(2);self.finish(5)
        self.client.force_authenticate(self.owner);data=self.client.get('/api/trainings/admin/dashboard/').data
        self.assertEqual(data['user_ranking'][0]['score'],500);self.assertEqual(data['metrics']['average_percent'],100);self.assertEqual(data['metrics']['completed'],1)
    def test_admin_analytics_details_and_filters(self):
        self.finish(4);self.client.post(self.base+'feedback/',{'stars':5,'comment':'Excelente.'},format='json')
        self.client.force_authenticate(self.owner)
        data=self.client.get(self.admin).data
        self.assertEqual(data['summary']['completion_rate'],100);self.assertTrue(data['participants'][0]['commented'])
        self.assertEqual(self.client.get(self.admin+'participants/'+str(self.user.id)+'/').data['results'][0]['correct_count'],4)
        dashboard=self.client.get('/api/trainings/admin/dashboard/').data
        self.assertEqual(dashboard['metrics']['comments'],1);self.assertEqual(dashboard['latest_comments'][0]['comment'],'Excelente.')
        self.assertEqual(self.client.get(self.admin+'?min_percent=100').data['participants'],[])
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?start=2099-01-01').data['metrics']['completed'],0)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?start=bad').status_code,400)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?start=2026-12-01&end=2026-01-01').status_code,400)
    def test_assignments_are_atomic_and_do_not_duplicate(self):
        self.client.force_authenticate(self.owner)
        response=self.client.post(self.admin+'assign/',{'emails':[self.other.email,'missing@example.com']},format='json');self.assertEqual(response.status_code,400)
        self.assertFalse(Participation.objects.filter(user=self.other,training=self.training).exists())
        for i in range(2):self.assertEqual(self.client.post(self.admin+'assign/',{'emails':[self.other.email]},format='json').status_code,200)
        self.assertEqual(Participation.objects.filter(user=self.other,training=self.training).count(),1)
    def test_workspace_removal_revokes_training_access(self):
        self.space.members.remove(self.user)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.get('/api/trainings/').data,[])
    def test_workspace_admin_cannot_copy_private_drafts(self):
        private=Guide.objects.create(owner=self.other,workspace=self.space,title='Privado')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post('/api/trainings/admin/',{'guide':private.id,'title':'Tentativa'},format='json').status_code,400)
    def test_foreign_dashboard_scope_is_rejected(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?training=999999').status_code,404)
    def test_invalid_questions_and_unreviewed_publication_rejected(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.admin+'publish/',{},format='json').status_code,400)
        questions=demo_questions();questions[0]['alternatives'][0]['correct']=True;questions[0]['alternatives'][1]['correct']=True
        self.assertEqual(self.client.patch(self.admin,{'draft_questions':questions},format='json').status_code,400)
        self.assertEqual(self.client.patch(self.admin,{'draft_questions':demo_questions()[:4]},format='json').status_code,400)
    def test_archive_preserves_history_and_blocks_new_activity(self):
        self.start_quiz();self.client.force_authenticate(self.owner);self.client.post(self.admin+'archive/');self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.base).status_code,200)
        self.assertEqual(self.client.post(self.base+'quiz-start/').status_code,400)
    @override_settings(LLM_PROVIDER='gemini',LLM_API_KEY='test')
    def test_ai_suggestions_need_review_and_preserve_existing_draft_on_failure(self):
        self.client.force_authenticate(self.owner)
        with patch('ai.tasks.call_gemini_vision',return_value=(json.dumps(demo_questions()),None)):
            response=self.client.post(self.admin+'suggestions/');self.assertEqual(response.status_code,200);self.assertTrue(response.data['requires_review'])
        old=Training.objects.get(pk=self.training.pk).draft_questions
        with patch('ai.tasks.call_gemini_vision',return_value=('not json',None)):
            self.assertEqual(self.client.post(self.admin+'suggestions/').status_code,400)
        self.assertEqual(Training.objects.get(pk=self.training.pk).draft_questions,old)
    @override_settings(DEBUG=True)
    def test_seed_is_repeatable_without_resetting_accounts(self):
        call_command('seed_trainings',verbosity=0);before=(Training.objects.count(),Participation.objects.count(),QuizResult.objects.count())
        demo=User.objects.get(username='octor_demo_admin');demo.set_password('Changed!Password77');demo.save()
        call_command('seed_trainings',verbosity=0)
        self.assertEqual(before,(Training.objects.count(),Participation.objects.count(),QuizResult.objects.count()))
        demo.refresh_from_db();self.assertTrue(demo.check_password('Changed!Password77'))
    def test_anonymous_access_is_blocked(self):
        self.client.force_authenticate(None)
        for url in ['/api/trainings/','/api/trainings/admin/','/api/trainings/admin/dashboard/',self.base]:self.assertEqual(self.client.get(url).status_code,401)

    def test_guide_deletion_protects_training_history_with_clear_error(self):
        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/guides/{self.guide.pk}/')
        self.assertEqual(self.client.post(f'/api/guides/{self.guide.pk}/permanent-delete/').status_code,409)
        self.assertTrue(Training.objects.filter(pk=self.training.pk).exists())
