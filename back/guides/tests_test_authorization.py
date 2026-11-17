"""Integração das permissões de teste com atribuição, versões e API."""
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.training_consent import TERM_VERSION
from guides.models import Guide, GuideShare, Workspace, Step
from trainings.models import Training, QuizVersion, Participation
from trainings.archive_views import require_version_access
from rest_framework.exceptions import PermissionDenied

class TestAuthorizationTests(APITestCase):
    def setUp(self):
        self.owner=User.objects.create_user('creator')
        self.student=User.objects.create_user('student')
        self.other=User.objects.create_user('other',is_staff=True)
        self.space=Workspace.objects.create(owner=self.other,name='Equipe')
        self.space.members.add(self.owner,self.student,self.other)
        self.guide=Guide.objects.create(owner=self.owner,workspace=self.space,title='Guia',status='published',playback_environment='test')
        Step.objects.create(guide=self.guide,text='Abra o menu.',url='https://example.com',selector='button')
        self.training=Training.objects.create(owner=self.owner,guide=self.guide,workspace=self.space,title='Treinamento',status='published')
        self.version=QuizVersion.objects.create(training=self.training,number=1,content={'title':'Treinamento','steps':[{'text':'Abra o menu.','url':'https://example.com'}]})
        self.training.current_version=self.version;self.training.save()
        self.part=Participation.objects.create(training=self.training,user=self.student)
        self.base=f'/api/trainings/{self.training.pk}/'
        self.guide_url=f'/api/guides/{self.guide.pk}/'

    def approve(self):
        self.client.force_authenticate(self.owner)
        response=self.client.post(self.guide_url+'authorize-test/')
        self.assertEqual(response.status_code,200,response.data)
        return response

    def test_old_environment_is_not_authorization_and_direct_routes_are_blocked(self):
        self.client.force_authenticate(self.student)
        listing=self.client.get('/api/trainings/').data[0]
        self.assertFalse(listing['test_authorized'])
        self.assertNotIn('content',listing)
        response = self.client.get(self.base)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['test_authorized'])
        self.assertNotIn('url', response.data['content']['steps'][0])
        self.assertEqual(self.client.get(self.base+'versions/1/legacy-media/0/narration_url/').status_code,403)
        self.assertFalse(self.client.get(self.guide_url).data['can_start_playback'])
        for action in ['start','playback','complete','quiz-start','quiz-state','answer','feedback']:
            self.assertEqual(self.client.post(self.base+action+'/').status_code,403,action)
        self.assertEqual(self.client.get(self.guide_url+'playback-access/').status_code,403)
        self.part.refresh_from_db();self.assertIsNone(self.part.started_at)
        with self.assertRaises(PermissionDenied):require_version_access(self.student,self.version)

    def test_only_creator_even_workspace_admin_can_authorize(self):
        for user in [self.student,self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(self.guide_url+'authorize-test/').status_code,403)
        self.guide.refresh_from_db();self.assertIsNone(self.guide.test_authorized_at)

    def test_patch_cannot_forge_authorization(self):
        self.client.force_authenticate(self.owner)
        self.client.patch(self.guide_url,{'test_authorized_at':timezone.now().isoformat(),'test_authorized_by':self.owner.pk,'playback_environment':'test'},format='json')
        self.guide.refresh_from_db();self.assertIsNone(self.guide.test_authorized_at)

    def test_approval_records_actor_time_and_is_idempotent(self):
        first=self.approve().data
        second=self.approve().data
        self.assertEqual(first['test_authorized_at'],second['test_authorized_at'])
        self.assertEqual(first['test_authorized_by'],self.owner.pk)
        self.assertTrue(first['test_authorized'])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.base).status_code,200)
        self.assertEqual(self.client.get(self.guide_url+'playback-access/').data['training_id'],self.training.pk)
        self.assertEqual(self.client.post(self.base+'playback/').status_code,403)
        result=self.client.post(self.base+'start/',{'consent_version':TERM_VERSION},format='json')
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(self.client.post(self.base+'playback/').status_code,200)
        self.assertEqual(self.client.post(self.base+'complete/').status_code,200)
        require_version_access(self.student,self.version)
        self.part.refresh_from_db();self.assertEqual(self.part.version_id,self.version.pk)

    def test_unassigned_cannot_use_shared_guide_or_direct_training(self):
        self.approve();self.client.force_authenticate(self.other)
        self.assertFalse(self.client.get(self.guide_url).data['can_start_playback'])
        self.assertEqual(self.client.get(self.guide_url+'playback-access/').status_code,403)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.post(self.base+'start/').status_code,404)

    def test_assignment_and_workspace_permissions_rechecked(self):
        self.approve();self.space.members.remove(self.student)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.base).status_code,404)
        self.assertEqual(self.client.post(self.base+'playback/').status_code,404)

    def test_draft_still_requires_publication_and_history_is_unchanged(self):
        original=self.version.content.copy();self.approve()
        self.training.status='draft';self.training.save()
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.base).status_code,403)
        self.assertEqual(self.client.get(self.base+'versions/1/legacy-media/0/narration_url/').status_code,403)
        self.assertEqual(self.client.post(self.base+'start/').status_code,400)
        self.version.refresh_from_db();self.assertEqual(self.version.content,original)

    def test_admin_audit_remains_available_before_authorization(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(f'/api/trainings/admin/{self.training.pk}/versions/1/').status_code,200)

    def test_revoke_preserves_progress_and_can_reactivate(self):
        self.approve()
        self.client.force_authenticate(self.student)
        self.client.post(self.base+'start/',{'consent_version':TERM_VERSION},format='json')
        self.part.refresh_from_db()
        started, version = self.part.started_at, self.part.version_id
        self.client.force_authenticate(self.owner)
        response=self.client.post(self.guide_url+'authorize-test/',{'enabled':False},format='json')
        self.assertFalse(response.data['test_authorized'])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.base).status_code, 200)
        self.assertFalse(self.client.get(self.base+'access/').data['test_authorized'])
        for path in [self.guide_url+'playback-access/']:
            self.assertEqual(self.client.get(path).status_code,403)
        self.assertEqual(self.client.post(self.base+'playback/').status_code,403)
        self.assertFalse(self.client.get(self.guide_url).data['can_start_playback'])
        self.part.refresh_from_db()
        self.assertEqual(self.part.started_at,started)
        self.assertEqual(self.part.version_id,version)
        self.approve()
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.base+'access/').status_code,200)
        self.assertEqual(self.client.post(self.base+'playback/').status_code,200)

    def test_preview_owner_only_without_release(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.guide_url+'preview-training/').status_code,200)
        self.guide.refresh_from_db()
        self.assertIsNone(self.guide.test_authorized_at)
        for user in [self.student,self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.guide_url+'preview-training/').status_code,403)

    def test_toggle_requires_boolean_and_creator(self):
        self.approve()
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(self.guide_url+'authorize-test/',{'enabled':False},format='json').status_code,403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.guide_url+'authorize-test/',{'enabled':'false'},format='json').status_code,400)
        self.guide.refresh_from_db()
        self.assertIsNotNone(self.guide.test_authorized_at)

    def test_approval_requires_completed_participation_and_manager_but_not_test_release(self):
        endpoint = self.guide_url + 'training-approvals/'
        payload = {'participation_id': self.part.pk}
        self.client.force_authenticate(self.owner)
        self.assertFalse(self.client.get(endpoint).data[0]['eligible'])
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 404)
        self.part.completed_at = timezone.now()
        self.part.save(update_fields=['completed_at'])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(endpoint).data[0]['id'], self.part.pk)
        response = self.client.post(endpoint, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.post(endpoint, payload, format='json').data, response.data)
        self.assertTrue(self.client.get(endpoint).data[0]['approved'])
        self.part.refresh_from_db()
        self.assertEqual(self.part.approved_by, self.other)
        self.guide.refresh_from_db()
        self.assertFalse(self.guide.valido_para_teste)

    def test_bulk_approval_excludes_incomplete_and_rejects_invalid_selection_atomically(self):
        endpoint = self.guide_url + 'training-approvals/'
        self.part.completed_at = timezone.now()
        self.part.save(update_fields=['completed_at'])
        incomplete = Participation.objects.create(training=self.training, user=self.other)
        self.client.force_authenticate(self.owner)
        result = self.client.post(endpoint, {'participation_ids': [self.part.pk, incomplete.pk]}, format='json')
        self.assertEqual(result.status_code, 404)
        self.part.refresh_from_db()
        self.assertIsNone(self.part.approved_at)
        self.assertEqual(self.client.post(endpoint, {'all': True}, format='json').data['approved_count'], 1)
        incomplete.refresh_from_db()
        self.assertIsNone(incomplete.approved_at)
