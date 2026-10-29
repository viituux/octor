from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from guides.models import Guide, Step
from .models import GoogleAccount

@override_settings(GOOGLE_CLIENT_ID='test.apps.googleusercontent.com')
class AccountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client=APIClient()
        self.password='River!Lamp47Blue'
    def user(self,name='ana',email='ana@example.com'):
        return User.objects.create_user(username=name,email=email,password=self.password)
    def challenge(self):
        response=self.client.post('/api/auth/google/challenge/',{},format='json')
        self.assertEqual(response.status_code,200)
        return response.data
    def claims(self,attempt,subject='google-123',email='new@example.com'):
        return {'sub':subject,'email':email,'email_verified':True,'iss':'https://accounts.google.com','aud':'test.apps.googleusercontent.com','nonce':attempt['nonce'],'given_name':'Ana'}
    def google(self,attempt,claims,url='/api/auth/google/login/'):
        with patch('accounts.google_auth.verify_google_credential',return_value=claims):
            return self.client.post(url,{'credential':'signed-google-token','challenge':attempt['challenge']},format='json')
    def test_register_returns_session_and_hashes_password(self):
        r=self.client.post('/api/auth/register/',{'username':'ana2026','first_name':'Ana','email':'ana@example.com','password':self.password},format='json')
        self.assertEqual(r.status_code,201)
        self.assertTrue(r.data['access'])
        self.assertNotIn('password',r.data['user'])
        self.assertTrue(User.objects.get(username='ana2026').check_password(self.password))
    def test_duplicate_email_and_weak_password_are_rejected(self):
        self.user()
        data={'username':'other','first_name':'Tester','email':'ANA@example.com','password':self.password}
        self.assertEqual(self.client.post('/api/auth/register/',data,format='json').status_code,400)
        data.update(email='other@example.com',password='12345678')
        self.assertEqual(self.client.post('/api/auth/register/',data,format='json').status_code,400)
    def test_password_login_and_private_guides(self):
        owner=self.user();other=self.user('other','other@example.com')
        mine=Guide.objects.create(owner=owner,title='Mine');foreign=Guide.objects.create(owner=other,title='Other')
        r=self.client.post('/api/auth/login/',{'username':'ana','password':self.password},format='json')
        self.assertEqual(r.status_code,200)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+r.data['access'])
        self.assertEqual([g['id'] for g in self.client.get('/api/guides/').data],[mine.id])
        self.assertEqual(self.client.get(f'/api/guides/{foreign.id}/').status_code,404)
        step=Step.objects.create(guide=mine)
        self.assertEqual(self.client.patch(f'/api/guides/steps/{step.id}/',{'guide':foreign.id},format='json').status_code,400)
    def test_google_creates_user_then_returns_same_account(self):
        a=self.challenge();r=self.google(a,self.claims(a));self.assertEqual(r.status_code,200)
        user_id=r.data['user']['id'];self.assertFalse(User.objects.get(pk=user_id).has_usable_password())
        a=self.challenge();r=self.google(a,self.claims(a));self.assertEqual(r.data['user']['id'],user_id)
    def test_google_does_not_merge_existing_email(self):
        self.user(email='new@example.com');a=self.challenge()
        self.assertEqual(self.google(a,self.claims(a)).status_code,409)
        self.assertEqual(GoogleAccount.objects.count(),0)
    def test_authenticated_user_can_link_google(self):
        user=self.user();self.client.force_authenticate(user)
        a=self.challenge();r=self.google(a,self.claims(a),'/api/auth/google/link/')
        self.assertEqual(r.status_code,200);self.assertEqual(r.data['google_email'],'new@example.com')
        self.client.force_authenticate(None);a=self.challenge();r=self.google(a,self.claims(a))
        self.assertEqual(r.data['user']['id'],user.id)
    def test_google_rejects_wrong_nonce_and_replay(self):
        a=self.challenge();claims=self.claims(a);claims['nonce']='wrong'
        self.assertEqual(self.google(a,claims).status_code,400)
        claims=self.claims(a);self.assertEqual(self.google(a,claims).status_code,200)
        self.assertEqual(self.google(a,claims).status_code,400)
    def test_google_cannot_link_to_a_different_user(self):
        original=self.user();GoogleAccount.objects.create(user=original,subject='google-123',email='new@example.com')
        self.client.force_authenticate(self.user('other','other@example.com'));a=self.challenge()
        self.assertEqual(self.google(a,self.claims(a),'/api/auth/google/link/').status_code,409)
    @override_settings(GOOGLE_CLIENT_ID='')
    def test_unconfigured_google_does_not_offer_login(self):
        self.assertFalse(self.client.get('/api/auth/google/config/').data['enabled'])
        self.assertEqual(self.client.post('/api/auth/google/challenge/').status_code,503)
