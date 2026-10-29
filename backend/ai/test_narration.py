import json
import tempfile
from unittest.mock import patch, Mock
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from guides.models import Guide, Step
from .narration import prepare_narration, transcript_for
from .tasks import get_step_prompt, GenerationError

@override_settings(LLM_PROVIDER='gemini', LLM_API_KEY='server-test', LLM_MODEL='test-audio')
class NarratedInstructionTests(TestCase):
    def setUp(self):
        self.override=override_settings(STORAGES={'default':{'BACKEND':'django.core.files.storage.InMemoryStorage'}})
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.owner=User.objects.create_user(username='voice-author')
        self.guide=Guide.objects.create(owner=self.owner,title='Teste narrado',capture_audio=SimpleUploadedFile('capture.webm',b'\x1aE\xdf\xa3audio'))
        self.first=Step.objects.create(guide=self.guide,text='Texto 1',annotations=[{'type':'live_narration','start':0,'end':2}])
        self.second=Step.objects.create(guide=self.guide,text='Texto 2',annotations=[{'type':'live_narration','start':2,'end':4}])
        self.client=APIClient();self.client.force_authenticate(self.owner)
        self.url=f'/api/guides/{self.guide.id}/prepare-narration/'

    def response(self, post, items=None):
        post.return_value=Mock(ok=True,status_code=200)
        if items is None:items=[{'step_id':self.first.id,'transcript':'Abra o menu de clientes.'},{'step_id':self.second.id,'transcript':'Selecione o novo cadastro.'}]
        post.return_value.json.return_value={'candidates':[{'content':{'parts':[{'text':json.dumps({'steps':items})}]}}]}

    @patch('ai.narration.requests.post')
    def test_speech_is_mapped_to_each_step_once_and_cached(self,post):
        self.response(post)
        result=self.client.post(self.url,{},format='json')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.data['prepared'],2)
        self.first.refresh_from_db();self.second.refresh_from_db()
        self.assertEqual(transcript_for(self.first),'Abra o menu de clientes.')
        self.assertIn('Abra o menu',get_step_prompt(self.first))
        self.assertNotIn('Selecione o novo',get_step_prompt(self.first))
        self.assertEqual(self.first.text,'Texto 1')
        payload=post.call_args.kwargs['json']['contents'][0]['parts']
        self.assertEqual(payload[1]['inlineData']['mimeType'],'audio/webm')
        self.assertIn('"start": 2.0',payload[0]['text'])
        self.assertEqual(self.client.post(self.url,{},format='json').data['prepared'],0)
        self.assertEqual(post.call_count,1)

    @patch('ai.narration.requests.post')
    def test_incomplete_or_wrong_mapping_does_not_change_any_step(self,post):
        self.response(post,[{'step_id':99999,'transcript':'Wrong'}])
        self.assertEqual(self.client.post(self.url,{},format='json').status_code,503)
        self.first.refresh_from_db();self.second.refresh_from_db()
        self.assertEqual(transcript_for(self.first),'')
        self.assertEqual(self.first.text,'Texto 1')
        self.assertEqual(transcript_for(self.second),'')

    @patch('ai.narration.requests.post')
    def test_provider_failure_preserves_audio_and_text(self,post):
        post.return_value=Mock(ok=False,status_code=503)
        response=self.client.post(self.url,{},format='json')
        self.assertEqual(response.status_code,503)
        self.first.refresh_from_db();self.guide.refresh_from_db()
        self.assertEqual(self.first.text,'Texto 1')
        self.assertTrue(self.guide.capture_audio)

    @patch('ai.narration.requests.post')
    def test_foreign_guide_and_foreign_step_are_rejected(self,post):
        other=User.objects.create_user(username='stranger')
        foreign=Guide.objects.create(owner=other)
        foreign_step=Step.objects.create(guide=foreign)
        self.assertEqual(self.client.post(f'/api/guides/{foreign.id}/prepare-narration/',{},format='json').status_code,404)
        self.assertEqual(self.client.post(self.url,{'step_id':foreign_step.id},format='json').status_code,404)
        post.assert_not_called()

    @patch('ai.narration.requests.post')
    def test_revised_interval_does_not_use_old_transcript(self,post):
        self.response(post);prepare_narration(self.guide)
        self.first.refresh_from_db()
        self.first.annotations[0]['end']=1
        self.first.save(update_fields=['annotations'])
        self.assertEqual(transcript_for(self.first),'')

    @patch('ai.narration.requests.post')
    def test_individual_narration_overrides_shared_audio(self,post):
        self.first.narration=SimpleUploadedFile('step.ogg',b'OggSaudio');self.first.save()
        self.response(post,[{'step_id':self.first.id,'transcript':'Confira o campo.'}])
        response=self.client.post(self.url,{'step_id':self.first.id},format='json')
        self.assertEqual(response.status_code,200)
        parts=post.call_args.kwargs['json']['contents'][0]['parts']
        self.assertEqual(parts[1]['inlineData']['mimeType'],'audio/ogg')
        self.assertIn('"start": null',parts[0]['text'])

    @patch('ai.narration.requests.post')
    def test_silence_does_not_invent_narration(self,post):
        self.response(post,[{'step_id':self.first.id,'transcript':''},{'step_id':self.second.id,'transcript':''}])
        prepare_narration(self.guide);self.first.refresh_from_db()
        self.assertEqual(transcript_for(self.first),'')
        self.assertNotIn('fala_do_autor_neste_passo',get_step_prompt(self.first))

    @patch('ai.narration.requests.post')
    def test_guide_without_audio_needs_no_transcription(self,post):
        self.guide.capture_audio=None;self.guide.save()
        self.assertEqual(prepare_narration(self.guide),0)
        post.assert_not_called()

    @patch('ai.narration.requests.post')
    def test_oversized_audio_is_rejected_without_sending(self, post):
        from .narration import transcribe_audio
        with self.assertRaises(GenerationError):
            transcribe_audio(Mock(size=15*1024*1024), [{'step_id':self.first.id,'start':0,'end':2}])
        post.assert_not_called()

    @override_settings(LLM_PROVIDER='openai')
    @patch('ai.narration.requests.post')
    def test_unsupported_voice_provider_returns_clear_error(self, post):
        response=self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code,503)
        self.assertIn('Gemini',response.data['detail'])
        post.assert_not_called()
