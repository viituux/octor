"""Run with python manage.py test manuals.reliability_tests (PostgreSQL)."""
import base64
import io
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from PIL import Image, ImageDraw
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from .models import ManualRun, ManualCapture, ManualObservation
from .services import decode_capture
from .views import Action, Capture


def screenshot():
    image = Image.new('RGB', (400, 300), 'white')
    ImageDraw.Draw(image).rectangle((20, 20, 200, 120), fill='blue')
    output = io.BytesIO(); image.save(output, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()


class ReliabilityTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.owner = get_user_model().objects.create_user(username='manual-test')
        self.run = ManualRun.objects.create(owner=self.owner, url='https://example.com/', objective='Abrir menu', status='capturing')
        self.image = screenshot()
        self.payload = {'execution_id':str(uuid4()), 'step_id':str(uuid4()), 'controls':[{'label':'Menu','kind':'menu'}],
                        'visited':[], 'page':{}, 'screenshot':self.image}
        self.temp = tempfile.TemporaryDirectory()
        self.storages = [ManualCapture._meta.get_field('screenshot').storage, ManualObservation._meta.get_field('screenshot').storage,
                         ManualObservation._meta.get_field('result_screenshot').storage]
        self.locations = [(storage, storage.base_location, storage.__dict__.get('location')) for storage in self.storages]
        for storage in self.storages:
            storage.base_location = self.temp.name;storage.__dict__['location'] = self.temp.name

    def tearDown(self):
        for storage, base, location in self.locations:
            storage.base_location = base
            if location is None: storage.__dict__.pop('location',None)
            else: storage.__dict__['location'] = location
        self.temp.cleanup()

    def post(self, payload=None, action='plan', user=None):
        request = APIRequestFactory().post('/', payload or self.payload, format='json')
        force_authenticate(request, user=user or self.owner)
        return Action.as_view()(request, pk=self.run.pk, action=action)

    def capture(self, **changes):
        body = {'key':'viewport-1','order':1,'url':self.run.url,'title':'Tela','screenshot_base64':self.image,
                'execution_id':self.payload['execution_id'],'step_id':self.payload['step_id'],
                'evidence':{'heading':'Tela','text':'Conteúdo observado','controls':[], 'scroll_y':0,
                            'viewport_width':400,'viewport_height':300,'quality':{'stable':True}}}
        body.update(changes)
        request=APIRequestFactory().post('/',body,format='json');force_authenticate(request,user=self.owner)
        return Capture.as_view()(request,pk=self.run.pk)

    @patch('manuals.views.plan_manual_navigation', return_value={'index':0,'reason':'next'})
    def test_analysis_reads_saved_validated_image_and_replays_decision(self, provider):
        def check(*args, **kwargs):
            observation = self.run.observations.get()
            self.assertTrue(observation.screenshot.storage.exists(observation.screenshot.name))
            with observation.screenshot.open('rb') as file:
                self.assertEqual(decode_capture(args[4]).read(), decode_capture('data:image/jpeg;base64,'+base64.b64encode(file.read()).decode()).read())
            return {'index':0,'reason':'next'}
        provider.side_effect=check
        first=self.post();second=self.post()
        self.assertEqual(first.status_code,200);self.assertEqual(first.data,second.data);self.assertEqual(provider.call_count,1)
        self.assertEqual(first.data['step_id'],self.payload['step_id'])

    @patch('manuals.views.plan_manual_navigation', return_value={'index':0,'reason':'next'})
    def test_same_id_different_input_is_rejected(self, provider):
        self.assertEqual(self.post().status_code,200)
        self.assertEqual(self.post({**self.payload,'visited':['Menu']}).status_code,409)
        self.assertEqual(provider.call_count,1)

    def test_corrupt_or_blank_image_never_reaches_provider(self):
        for image in ['data:image/jpeg;base64,AAAA','wrong']:
            with patch('manuals.views.plan_manual_navigation') as provider:
                self.assertEqual(self.post({**self.payload,'screenshot':image}).status_code,400);provider.assert_not_called()
        output=io.BytesIO();Image.new('RGB',(200,200),'white').save(output,'PNG')
        self.assertEqual(self.post({**self.payload,'screenshot':'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()}).status_code,400)
        self.assertEqual(self.run.observations.count(),0)

    @patch('manuals.views.plan_manual_navigation', return_value={'index':0,'reason':'next'})
    def test_capture_association_idempotency_and_key_conflict(self, provider):
        self.post()
        first=self.capture();second=self.capture()
        self.assertEqual(first.status_code,201);self.assertEqual(second.data['id'],first.data['id'])
        self.assertEqual(self.run.observations.get().capture_id,first.data['id'])
        self.assertEqual(self.run.captures.count(),1)
        self.assertEqual(self.capture(step_id=str(uuid4())).status_code,409)

    def test_unstable_capture_not_saved(self):
        evidence={'heading':'Tela','text':'','controls':[],'scroll_y':0,'viewport_width':400,'viewport_height':300,'quality':{'stable':False}}
        self.assertEqual(self.capture(evidence=evidence).status_code,400);self.assertFalse(self.run.captures.exists())

    def test_storage_failure_prevents_gemini(self):
        with patch.object(self.storages[1], 'save', side_effect=OSError('storage unavailable')), patch('manuals.views.plan_manual_navigation') as provider:
            with self.assertRaises(OSError):self.post()
            provider.assert_not_called()
        self.assertFalse(self.run.observations.exists())

    def test_concurrent_duplicate_calls_only_once(self):
        entered=threading.Event();release=threading.Event()
        def slow(*args,**kwargs):
            entered.set();self.assertTrue(release.wait(10));return {'index':0,'reason':'next'}
        def first_request():
            close_old_connections()
            try:return self.post()
            finally:close_old_connections()
        with patch('manuals.views.plan_manual_navigation',side_effect=slow) as provider,ThreadPoolExecutor(max_workers=1) as pool:
            first=pool.submit(first_request)
            try:
                self.assertTrue(entered.wait(10))
                self.assertEqual(self.post().status_code,409)
                self.assertEqual(self.post({**self.payload,'step_id':str(uuid4())}).status_code,409)
            finally:release.set()
            self.assertEqual(first.result(timeout=10).status_code,200);self.assertEqual(provider.call_count,1)

    def test_cancel_during_delayed_response_discards_result(self):
        def cancelled(*args,**kwargs):
            ManualRun.objects.filter(pk=self.run.pk).update(status='cancelled')
            return {'index':0,'reason':'next'}
        with patch('manuals.views.plan_manual_navigation',side_effect=cancelled):self.assertEqual(self.post().status_code,409)
        self.assertEqual(self.run.observations.get().status,'FAILED')

    def test_expired_observation_never_replays_old_work(self):
        with patch('manuals.views.plan_manual_navigation',return_value={'index':0,'reason':'next'}):self.post()
        observation=self.run.observations.get();observation.status='ANALYZING';observation.created_at=timezone.now()-timedelta(minutes=2);observation.save()
        self.assertEqual(self.post().status_code,409)
        with patch('manuals.views.plan_manual_navigation',return_value={'index':None,'reason':'done'}):
            self.assertEqual(self.post({**self.payload,'step_id':str(uuid4())}).status_code,200)
        observation.refresh_from_db();self.assertEqual(observation.status,'FAILED')

    def test_legacy_contract_without_ids(self):
        legacy={key:value for key,value in self.payload.items() if key not in {'step_id','execution_id'}}
        with patch('manuals.views.plan_manual_navigation',return_value={'index':0,'reason':'next'}):
            response=self.post(legacy)
        self.assertEqual(response.data,{'index':0,'reason':'next'})

    def test_other_owner_cannot_read_or_reserve_run(self):
        other=get_user_model().objects.create_user(username='other')
        self.assertEqual(self.post(user=other).status_code,404);self.assertFalse(self.run.observations.exists())

    def checkpoint(self,action,**extra):
        return self.post({'step_id':self.payload['step_id'],'execution_id':self.payload['execution_id'],**extra},action)

    @patch('manuals.views.plan_manual_navigation',return_value={'index':0,'reason':'next'})
    def test_action_requires_saved_source_and_reserves_dispatch_once(self,provider):
        self.post()
        self.assertEqual(self.checkpoint('action-intent').status_code,409)
        self.capture()
        self.assertEqual(self.checkpoint('action-intent').status_code,200)
        self.assertEqual(self.checkpoint('action-intent').status_code,409)
        self.assertEqual(self.run.observations.get().action_status,'EXECUTING')
        self.assertEqual(self.post({'message':'done'},'captured').status_code,409)
        self.assertEqual(self.post({**self.payload,'step_id':str(uuid4())}).status_code,409)

    @patch('manuals.views.plan_manual_navigation',return_value={'index':0,'reason':'next'})
    def test_result_must_be_verified_and_saved_before_complete(self,provider):
        self.post();self.capture();self.checkpoint('action-intent')
        self.assertEqual(self.checkpoint('action-result',screenshot=self.image,stable=True).status_code,400)
        storage=ManualObservation._meta.get_field('result_screenshot').storage
        with patch.object(storage,'save',side_effect=OSError('temporary storage failure')):
            with self.assertRaises(OSError):self.checkpoint('action-result',screenshot=self.image,stable=True,verified=True)
        self.assertEqual(self.run.observations.get().action_status,'EXECUTING')
        result=self.checkpoint('action-result',screenshot=self.image,stable=True,verified=True)
        self.assertEqual(result.status_code,200)
        observation=self.run.observations.get()
        self.assertEqual(observation.action_status,'COMPLETED')
        self.assertTrue(observation.result_screenshot.storage.exists(observation.result_screenshot.name))
        self.assertEqual(self.checkpoint('action-result',screenshot=self.image,stable=True,verified=True).data,result.data)
        self.assertEqual(self.post({'message':'done'},'captured').status_code,200)

    @patch('manuals.views.plan_manual_navigation',return_value={'index':0,'reason':'next'})
    def test_explicit_recovery_observes_again_without_replaying_old_action(self,provider):
        self.post();self.capture();self.checkpoint('action-intent')
        response=self.post({**self.payload,'step_id':str(uuid4()),'recover_interrupted':True,'visited':['Menu']})
        self.assertEqual(response.status_code,200)
        old=ManualObservation.objects.get(step_id=self.payload['step_id'])
        self.assertEqual(old.action_status,'INTERRUPTED')
        self.assertEqual(self.checkpoint('action-intent').status_code,409)

    def test_same_pixels_on_different_pages_do_not_lose_destination(self):
        first=self.capture()
        self.assertEqual(first.status_code,201)
        ManualRun.objects.filter(pk=self.run.pk).update(url='https://example.com/next')
        second=self.capture(key='viewport-2',order=2,url='https://example.com/next',step_id=str(uuid4()))
        self.assertEqual(second.status_code,201)
        self.assertNotEqual(second.data['id'],first.data['id'])

    def test_same_step_cannot_be_saved_under_another_order(self):
        self.assertEqual(self.capture().status_code,201)
        self.assertEqual(self.capture(key='viewport-2',order=2).status_code,409)
        self.assertEqual(self.run.captures.count(),1)

    def test_same_text_with_visual_change_is_not_deduplicated(self):
        evidence={'heading':'Tela','text':'Mesmo texto observado para os controles da página. '*5,'controls':[],
                  'scroll_y':0,'viewport_width':400,'viewport_height':300,'quality':{'stable':True,'visual_content':False}}
        self.assertEqual(self.capture(evidence=evidence).status_code,201)
        image=Image.new('RGB',(400,300),'white');ImageDraw.Draw(image).rectangle((20,20,200,120),fill='red')
        output=io.BytesIO();image.save(output,'PNG')
        updated='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
        result=self.capture(key='viewport-2',order=2,step_id=str(uuid4()),evidence=evidence,screenshot_base64=updated)
        self.assertEqual(result.status_code,201);self.assertEqual(self.run.captures.count(),2)
