from unittest.mock import patch, Mock
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from guides.models import Guide, Step
from .tasks import get_step_prompt, call_gemini_vision

@override_settings(LLM_PROVIDER='gemini', LLM_API_KEY='server-test-secret', LLM_MODEL='test-vision')
class StepGenerationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='author')
        self.guide = Guide.objects.create(owner=self.user, title='Cadastrar cliente')
        self.step = Step.objects.create(guide=self.guide, order=1, text='Texto original', element_text='Salvar', url='https://example.com/profile?token=private', selector='#save')
        self.other = Step.objects.create(guide=self.guide, order=2, text='Segundo passo')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = f'/api/guides/{self.guide.id}/steps/{self.step.id}/generate-text/'

    @patch('ai.tasks.call_gemini_vision', return_value=('Clique em Salvar. Confira o nome do botão antes de continuar. Esta ação envia o formulário.', None))
    def test_generates_only_requested_step_with_server_key_and_custom_prompt(self, provider):
        self.user.settings.llm_api_key = 'obsolete-user-key'
        self.user.settings.save()
        response = self.client.post(self.url, {'prompt':'Explique para iniciantes.'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['generation_prompt'], 'Explique para iniciantes.')
        args = provider.call_args.args
        self.assertEqual(args[0], 'server-test-secret')
        self.assertIn('Explique para iniciantes.', args[1])
        self.assertIn('Salvar', args[1])
        self.assertNotIn('token=private', args[1])
        self.other.refresh_from_db()
        self.assertEqual(self.other.text, 'Segundo passo')
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, response.data['text'])

    @patch('ai.tasks.call_gemini_vision', side_effect=Exception('secret provider diagnostic'))
    def test_failure_keeps_existing_text_and_hides_provider_details(self, provider):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('secret', str(response.data))
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, 'Texto original')

    @override_settings(LLM_API_KEY='')
    @patch('ai.tasks.call_gemini_vision')
    def test_unconfigured_server_preserves_text(self, provider):
        self.assertEqual(self.client.post(self.url, {}, format='json').status_code, 503)
        provider.assert_not_called()
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, 'Texto original')

    @patch('ai.tasks.call_gemini_vision', return_value=('', None))
    def test_empty_response_is_not_saved(self, provider):
        self.assertEqual(self.client.post(self.url, {}, format='json').status_code, 503)
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, 'Texto original')

    @patch('ai.tasks.call_gemini_vision')
    def test_other_users_cannot_generate_or_access_foreign_steps(self, provider):
        stranger = User.objects.create_user(username='stranger')
        foreign = Guide.objects.create(owner=stranger)
        foreign_step = Step.objects.create(guide=foreign)
        self.assertEqual(self.client.post(f'/api/guides/{foreign.id}/steps/{foreign_step.id}/generate-text/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'/api/guides/{self.guide.id}/steps/{foreign_step.id}/generate-text/', {}, format='json').status_code, 404)
        provider.assert_not_called()

    @patch('ai.tasks.call_gemini_vision')
    def test_invalid_prompt_is_rejected_before_generation(self, provider):
        self.assertEqual(self.client.post(self.url, {'prompt':'a'*3001}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'prompt':{}}, format='json').status_code, 400)
        provider.assert_not_called()

    @patch('ai.tasks.call_gemini_vision', side_effect=[('New first', None), (None, 'Failure')])
    def test_bulk_failure_does_not_partially_overwrite_guide(self, provider):
        response = self.client.post(f'/api/guides/{self.guide.id}/generate-text/', {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, 'Texto original')

    def test_account_api_does_not_expose_or_accept_keys(self):
        self.user.settings.llm_api_key = 'private-key-test'
        self.user.settings.save()
        response = self.client.get('/api/auth/me/')
        self.assertNotIn('api_key', str(response.data))
        self.assertNotIn('private-key', str(response.data))
        self.assertEqual(self.client.patch('/api/auth/settings/', {'llm_api_key':'new-key'}, format='json').status_code, 400)
        self.user.settings.refresh_from_db()
        self.assertEqual(self.user.settings.llm_api_key, 'private-key-test')

    @patch('ai.tasks.requests.post')
    def test_gemini_sends_key_only_in_header_and_image_with_prompt(self, post):
        post.return_value = Mock(ok=True, status_code=200)
        post.return_value.json.return_value = {'candidates':[{'content':{'parts':[{'text':'Passo detalhado'}]}}]}
        result = call_gemini_vision('private-key', get_step_prompt(self.step), b'image-data')
        self.assertEqual(result[0], 'Passo detalhado')
        args, kwargs = post.call_args
        self.assertNotIn('private-key', args[0])
        self.assertEqual(kwargs['headers']['x-goog-api-key'], 'private-key')
        self.assertEqual(len(kwargs['json']['contents'][0]['parts']), 2)

    @patch('ai.tasks.call_gemini_vision')
    def test_timeout_has_actionable_message_and_preserves_text(self, provider):
        import requests
        provider.side_effect = requests.exceptions.ReadTimeout('sensitive diagnostic')
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('demorou', response.data['detail'])
        self.assertNotIn('sensitive', response.data['detail'])
        self.step.refresh_from_db()
        self.assertEqual(self.step.text, 'Texto original')

    @patch('ai.tasks.requests.post')
    def test_provider_overload_is_reported_without_response_body(self, post):
        post.return_value = Mock(ok=False, status_code=503, text='provider secret')
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('sobrecarregado', response.data['detail'])
        self.assertNotIn('secret', str(response.data))

    def test_http_failures_have_safe_distinct_messages(self):
        from .tasks import provider_error
        for code, expected in [(401, 'credencial'), (403, 'permissão'), (404, 'modelo'), (429, 'limite'), (503, 'sobrecarregado')]:
            self.assertIn(expected, provider_error(code))

    @patch('ai.tasks.time.sleep')
    @patch('ai.tasks.requests.post')
    def test_transient_overload_retries_once_then_succeeds(self, post, sleep):
        failed = Mock(ok=False, status_code=503)
        success = Mock(ok=True, status_code=200)
        success.json.return_value = {'candidates':[{'content':{'parts':[{'text':'Clique em Salvar.'}]}}]}
        post.side_effect = [failed, success]
        result = call_gemini_vision('server-key', 'Escreva um passo.', None)
        self.assertEqual(result, ('Clique em Salvar.', None))
        self.assertEqual(post.call_count, 2)
        sleep.assert_called_once_with(1)
