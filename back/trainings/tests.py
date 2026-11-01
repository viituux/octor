"""Regressões de conteúdo → avaliação e preservação do histórico de quiz removido."""
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from guides.models import Guide, Step, Workspace
from .models import Training, Participation, QuizVersion, QuizQuestion, QuizAlternative, QuizResult, QuizAnswer, Feedback


class TrainingTests(APITestCase):
    def setUp(self):
        """Cria um procedimento publicado sem perguntas e atribui um participante."""
        cache.clear()
        self.owner=User.objects.create_user('manager',email='manager@example.com')
        self.user=User.objects.create_user('learner',email='learner@example.com',first_name='Learner')
        self.other=User.objects.create_user('other',email='other@example.com')
        self.space=Workspace.objects.create(name='Equipe',owner=self.owner)
        self.space.members.add(self.owner,self.user,self.other)
        self.guide=Guide.objects.create(owner=self.owner,workspace=self.space,title='Cadastro',status='published')
        Step.objects.create(guide=self.guide,text='Preencha os dados e clique em Salvar.',url='https://example.com',order=1)
        self.client.force_authenticate(self.owner)
        response=self.client.post('/api/trainings/admin/',{'guide':self.guide.id,'title':'Cadastro'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.training=Training.objects.get(pk=response.data['id'])
        self.base=f'/api/trainings/{self.training.id}/'
        self.admin=f'/api/trainings/admin/{self.training.id}/'
        response=self.client.post(self.admin+'publish/',{},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.training.refresh_from_db()
        Participation.objects.create(training=self.training,user=self.user)
        self.client.force_authenticate(self.user)

    def complete(self):
        """Executa a sequência real antes de testar envio de feedback."""
        self.assertEqual(self.client.post(self.base+'start/').status_code,200)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,200)

    def legacy_result(self):
        """Insere histórico antigo apenas como fixture; as APIs atuais não devem usá-lo."""
        question=QuizQuestion.objects.create(version=self.training.current_version,statement='Histórica',order=1)
        alternative=QuizAlternative.objects.create(question=question,text='Anterior',correct=True,order=1)
        result=QuizResult.objects.create(training=self.training,user=self.user,version=self.training.current_version,
            correct_count=1,score=100,finished_at=timezone.now())
        QuizAnswer.objects.create(result=result,question=question,alternative=alternative,correct=True)
        return result

    def test_feedback_requires_completion_not_quiz(self):
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':5},format='json').status_code,403)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,400)
        self.client.post(self.base+'start/')
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':5},format='json').status_code,403)
        self.client.post(self.base+'complete/')
        response=self.client.post(self.base+'feedback/',{'stars':5,'comment':'Claro.'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(QuizResult.objects.count(),0)
        self.assertEqual(QuizQuestion.objects.count(),0)

    def test_publication_without_questions_or_review_checkbox(self):
        self.assertEqual(self.training.status,'published')
        self.assertEqual(self.training.current_version.content['steps'][0]['text'],'Preencha os dados e clique em Salvar.')
        self.assertFalse(self.training.current_version.questions.exists())
        self.assertEqual(self.training.draft_questions,[])

    def test_removed_inputs_rejected_without_mutating_history(self):
        self.training.draft_questions=[{'historical':'preserve'}]
        self.training.save(update_fields=['draft_questions'])
        self.client.force_authenticate(self.owner)
        for data in [{'max_attempts':3},{'draft_questions':[]}]:
            self.assertEqual(self.client.patch(self.admin,data,format='json').status_code,400)
        self.training.refresh_from_db()
        self.assertEqual(self.training.draft_questions,[{'historical':'preserve'}])

    def test_retired_actions_do_not_create_or_change_quiz_data(self):
        result=self.legacy_result()
        for action in ['quiz-start','answer']:
            self.assertEqual(self.client.post(self.base+action+'/',{},format='json').status_code,410)
        self.client.force_authenticate(self.owner)
        with patch('ai.tasks.call_gemini_vision') as provider:
            self.assertEqual(self.client.post(self.admin+'suggestions/').status_code,410)
            provider.assert_not_called()
        result.refresh_from_db()
        self.assertEqual(result.score,100)
        self.assertEqual(QuizResult.objects.count(),1)
        self.assertEqual(QuizAnswer.objects.count(),1)

    def test_old_quiz_result_does_not_bypass_content_completion(self):
        self.legacy_result()
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':5},format='json').status_code,403)

    def test_legacy_incomplete_attempt_does_not_block_feedback_after_content(self):
        QuizResult.objects.create(training=self.training,user=self.user,version=self.training.current_version)
        self.complete()
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':4},format='json').status_code,201)
        self.assertIsNone(QuizResult.objects.get().finished_at)

    def test_existing_completion_can_send_feedback_directly(self):
        Participation.objects.filter(training=self.training,user=self.user).update(started_at=timezone.now(),completed_at=timezone.now())
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':4},format='json').status_code,201)

    def test_start_and_complete_are_idempotent(self):
        self.complete()
        first=self.client.get(self.base).data['progress']
        self.complete()
        again=self.client.get(self.base).data['progress']
        self.assertEqual(first,again)
        self.assertEqual(Participation.objects.count(),1)

    def test_feedback_validation_idempotency_and_database_constraint(self):
        self.complete()
        for body in [{'stars':0},{'stars':6},{'stars':5,'comment':'a'*501}]:
            self.assertEqual(self.client.post(self.base+'feedback/',body,format='json').status_code,400)
        body={'stars':4,'comment':'Muito claro.'}
        self.assertEqual(self.client.post(self.base+'feedback/',body,format='json').status_code,201)
        self.assertEqual(self.client.post(self.base+'feedback/',body,format='json').status_code,200)
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':3},format='json').status_code,409)
        self.assertEqual(Feedback.objects.count(),1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():Feedback.objects.create(training=self.training,user=self.user,stars=5)

    def test_optional_comment_and_reload_progress(self):
        self.complete()
        self.client.post(self.base+'feedback/',{'stars':5},format='json')
        progress=self.client.get(self.base).data['progress']
        self.assertEqual(progress['feedback']['comment'],'')
        self.assertIsNotNone(progress['completed_at'])
        for key in ['quiz_completed','results','can_retry','attempts_used']:self.assertNotIn(key,progress)

    def test_publication_preserves_started_content_and_old_results(self):
        self.client.post(self.base+'start/')
        part=Participation.objects.get(user=self.user,training=self.training)
        old_version=part.version_id
        result=self.legacy_result()
        self.client.force_authenticate(self.owner)
        Step.objects.filter(guide=self.guide).update(text='Conteúdo revisado')
        self.assertEqual(self.client.post(self.admin+'publish/').status_code,200)
        self.client.force_authenticate(self.user)
        self.assertNotEqual(self.client.get(self.base).data['content']['steps'][0]['text'],'Conteúdo revisado')
        self.client.force_authenticate(self.owner)
        self.client.post(self.admin+'assign/',{'emails':[self.other.email]},format='json')
        self.client.force_authenticate(self.other)
        self.client.post(self.base+'start/')
        self.assertEqual(self.client.get(self.base).data['content']['steps'][0]['text'],'Conteúdo revisado')
        result.refresh_from_db()
        self.assertEqual(result.version_id,old_version)
        self.assertEqual(QuizAnswer.objects.count(),1)
        self.assertEqual(QuizQuestion.objects.count(),1)

    def test_admin_contract_omits_quiz_and_still_inspects_feedback(self):
        self.complete()
        self.legacy_result()
        self.client.post(self.base+'feedback/',{'stars':5,'comment':'Excelente.'},format='json')
        self.client.force_authenticate(self.owner)
        details=self.client.get(self.admin).data
        self.assertEqual(details['summary']['completion_rate'],100)
        for key in ['draft_questions','max_attempts']:self.assertNotIn(key,details)
        for key in ['quiz_submitted','percent','score']:self.assertNotIn(key,details['participants'][0])
        inspection=self.client.get(self.admin+'participants/'+str(self.user.id)+'/').data
        self.assertEqual(inspection['feedback']['comment'],'Excelente.')
        self.assertNotIn('results',inspection)
        dashboard=self.client.get('/api/trainings/admin/dashboard/').data
        self.assertEqual(dashboard['metrics'],{'completed':1,'average_stars':5.0,'comments':1})
        self.assertNotIn('user_ranking',dashboard)
        self.assertNotIn('average_percent',dashboard['trainings'][0])
        self.assertNotIn('average_percent',dashboard['timeline'][0])
        self.assertEqual(dashboard['training_ranking'][0]['id'],self.training.id)
        self.assertEqual(dashboard['latest_comments'][0]['comment'],'Excelente.')

    def test_empty_dashboard_and_filters(self):
        self.client.force_authenticate(self.owner)
        data=self.client.get('/api/trainings/admin/dashboard/').data
        self.assertEqual(data['metrics'],{'completed':0,'average_stars':None,'comments':0})
        self.assertEqual(data['timeline'],[])
        self.assertEqual(data['training_ranking'],[])
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?start=bad').status_code,400)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?start=2026-12-01&end=2026-01-01').status_code,400)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/?training=999999').status_code,404)

    def test_filters_keep_completion_and_rating_semantics(self):
        self.complete()
        self.client.post(self.base+'feedback/',{'stars':4,'comment':'Bom.'},format='json')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.admin+'?rating=5').data['participants'],[])
        data=self.client.get('/api/trainings/admin/dashboard/?rating=5').data
        self.assertEqual(data['metrics']['completed'],1)
        self.assertIsNone(data['metrics']['average_stars'])
        data=self.client.get('/api/trainings/admin/dashboard/?start=2099-01-01').data
        self.assertEqual(data['metrics']['completed'],0)
        self.assertEqual(data['latest_comments'],[])

    def test_publication_rejects_empty_or_trashed_guide(self):
        self.client.force_authenticate(self.owner)
        versions=QuizVersion.objects.count()
        self.guide.trashed_at=timezone.now();self.guide.save()
        self.assertEqual(self.client.post(self.admin+'publish/').status_code,400)
        self.guide.trashed_at=None;self.guide.save();self.guide.steps.all().delete()
        self.assertEqual(self.client.post(self.admin+'publish/').status_code,400)
        self.assertEqual(QuizVersion.objects.count(),versions)

    def test_permissions_and_removed_member(self):
        self.assertEqual(self.client.get('/api/trainings/admin/').status_code,403)
        self.assertEqual(self.client.get('/api/trainings/admin/dashboard/').status_code,403)
        self.assertEqual(self.client.get(self.admin).status_code,404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.post(self.base+'feedback/',{'stars':5},format='json').status_code,404)
        self.assertEqual(self.client.post(self.base+'quiz-start/').status_code,404)
        self.client.force_authenticate(self.user)
        self.space.members.remove(self.user)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.get('/api/trainings/').data,[])

    def test_assignments_atomic_and_nonduplicated(self):
        self.client.force_authenticate(self.owner)
        response=self.client.post(self.admin+'assign/',{'emails':[self.other.email,'missing@example.com']},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Participation.objects.filter(user=self.other,training=self.training).exists())
        for _ in range(2):self.assertEqual(self.client.post(self.admin+'assign/',{'emails':[self.other.email]},format='json').status_code,200)
        self.assertEqual(Participation.objects.filter(user=self.other,training=self.training).count(),1)

    def test_workspace_manager_cannot_copy_private_draft(self):
        private=Guide.objects.create(owner=self.other,workspace=self.space,title='Privado')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post('/api/trainings/admin/',{'guide':private.id,'title':'Tentativa'},format='json').status_code,400)

    def test_archive_preserves_feedback_and_blocks_new_activity(self):
        self.complete()
        self.client.post(self.base+'feedback/',{'stars':4},format='json')
        self.client.force_authenticate(self.owner)
        self.client.post(self.admin+'archive/')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.base).status_code,200)
        for action,body in [('start',{}),('complete',{}),('feedback',{'stars':5})]:
            self.assertEqual(self.client.post(self.base+action+'/',body,format='json').status_code,400)
        self.assertEqual(Feedback.objects.get().stars,4)

    @override_settings(DEBUG=True)
    def test_seed_is_repeatable_and_creates_no_quiz(self):
        call_command('seed_trainings',verbosity=0)
        before=(Training.objects.count(),Participation.objects.count(),Feedback.objects.count(),QuizVersion.objects.count())
        self.assertEqual(QuizResult.objects.count(),0)
        self.assertEqual(QuizQuestion.objects.count(),0)
        demo=User.objects.get(username='octor_demo_admin');demo.set_password('Changed!Password77');demo.save()
        call_command('seed_trainings',verbosity=0)
        self.assertEqual(before,(Training.objects.count(),Participation.objects.count(),Feedback.objects.count(),QuizVersion.objects.count()))
        demo.refresh_from_db();self.assertTrue(demo.check_password('Changed!Password77'))

    @override_settings(DEBUG=False)
    def test_seed_blocked_outside_development(self):
        with self.assertRaises(CommandError):call_command('seed_trainings',verbosity=0)

    def test_anonymous_access_blocked(self):
        self.client.force_authenticate(None)
        for url in ['/api/trainings/','/api/trainings/admin/','/api/trainings/admin/dashboard/',self.base]:
            self.assertEqual(self.client.get(url).status_code,401)

    def test_guide_deletion_protects_training_history(self):
        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/guides/{self.guide.pk}/')
        self.assertEqual(self.client.post(f'/api/guides/{self.guide.pk}/permanent-delete/').status_code,409)
        self.assertTrue(Training.objects.filter(pk=self.training.pk).exists())
