from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APITestCase
from .models import GoogleAccount
from .sessions import session_tokens

class AccountSettingsTests(APITestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.password='River!Lamp47Blue'
        self.new_password='Forest!Stone95Cloud'
        self.user=User.objects.create_user(username='ana',first_name='Ana',email='ana@test.com',password=self.password)
        self.tokens=session_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+self.tokens['access'])
    def test_profile_changes_only_current_user_and_preserves_privileges(self):
        other=User.objects.create_user('other',email='other@test.com')
        result=self.client.patch('/api/auth/profile/',{'id':other.id,'first_name':'Mariana','last_name':'Silva','is_staff':True,'is_superuser':True},format='json')
        self.assertEqual(result.status_code,200)
        self.user.refresh_from_db();other.refresh_from_db()
        self.assertEqual(self.user.first_name,'Mariana');self.assertEqual(other.first_name,'')
        self.assertFalse(self.user.is_staff);self.assertFalse(self.user.is_superuser)
        self.assertNotIn('password',result.data)
    def test_sensitive_profile_changes_require_password(self):
        for data in [{'username':'nova'},{'email':'novo@test.com'}]:
            self.assertEqual(self.client.patch('/api/auth/profile/',data,format='json').status_code,400)
            data['current_password']=self.password
            self.assertEqual(self.client.patch('/api/auth/profile/',data,format='json').status_code,200)
        result=self.client.post('/api/auth/login/',{'username':'nova','password':self.password},format='json')
        self.assertEqual(result.status_code,200)
    def test_duplicate_case_and_invalid_username_rejected(self):
        User.objects.create_user('Other',email='other@test.com')
        for data in [{'username':'OTHER'},{'username':'bad name'},{'email':'OTHER@test.com'},{'email':'bad'},{'first_name':''}]:
            self.assertEqual(self.client.patch('/api/auth/profile/',{**data,'current_password':self.password},format='json').status_code,400)
    def test_google_binding_not_modified_by_contact_email(self):
        GoogleAccount.objects.create(user=self.user,subject='sub1',email='google@test.com')
        result=self.client.patch('/api/auth/profile/',{'email':'NEW@test.com','current_password':self.password},format='json')
        self.assertEqual(result.status_code,200);self.assertEqual(result.data['email'],'new@test.com');self.assertEqual(result.data['google_email'],'google@test.com')
    def test_password_validation_and_current_password(self):
        for current,new,confirm in [('wrong',self.new_password,self.new_password),(self.password,'12345678','12345678'),(self.password,self.new_password,'different'),(self.password,self.password,self.password)]:
            response=self.client.post('/api/auth/password/',{'current_password':current,'new_password':new,'confirmation':confirm},format='json')
            self.assertEqual(response.status_code,400)
        self.user.refresh_from_db();self.assertTrue(self.user.check_password(self.password))
    def test_password_change_revokes_access_and_refresh_and_returns_working_session(self):
        response=self.client.post('/api/auth/password/',{'current_password':self.password,'new_password':self.new_password,'confirmation':self.new_password},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/api/auth/me/').status_code,401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/auth/refresh/',{'refresh':self.tokens['refresh']}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login/',{'username':'ana','password':self.password}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login/',{'username':'ana','password':self.new_password}).status_code,200)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+response.data['access'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code,200)
        self.assertEqual(self.client.post('/api/auth/refresh/',{'refresh':response.data['refresh']}).status_code,200)
    def test_revoke_other_sessions_preserves_password(self):
        other=session_tokens(self.user)
        response=self.client.post('/api/auth/sessions/revoke/',{'current_password':self.password},format='json')
        self.assertEqual(response.status_code,200)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+other['access'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code,401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+response.data['access'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code,200)
        self.user.refresh_from_db();self.assertTrue(self.user.check_password(self.password))
    def test_revocation_requires_correct_password(self):
        self.assertEqual(self.client.post('/api/auth/sessions/revoke/',{'current_password':'wrong'}).status_code,400)
        self.assertEqual(self.client.get('/api/auth/me/').status_code,200)
    def test_google_only_requires_verified_matching_identity(self):
        self.user.set_unusable_password();self.user.save()
        GoogleAccount.objects.create(user=self.user,subject='sub1',email='google@test.com')
        data={'new_password':self.new_password,'confirmation':self.new_password}
        self.assertEqual(self.client.post('/api/auth/password/',data,format='json').status_code,400)
        with patch('accounts.google_auth.checked_claims',return_value={'sub':'someone-else'}):
            self.assertEqual(self.client.post('/api/auth/password/',data,format='json').status_code,400)
        with patch('accounts.google_auth.checked_claims',return_value={'sub':'sub1'}):
            response=self.client.post('/api/auth/password/',data,format='json')
        self.assertEqual(response.status_code,200);self.assertTrue(response.data['user']['has_password'])
        self.user.refresh_from_db();self.assertTrue(self.user.check_password(self.new_password))
    def test_anonymous_cannot_manage_accounts(self):
        self.client.credentials()
        for url in ['/api/auth/profile/','/api/auth/password/','/api/auth/sessions/revoke/']:
            response=self.client.patch(url,{}) if 'profile' in url else self.client.post(url,{})
            self.assertEqual(response.status_code,401)
    def test_legacy_tokens_work_until_explicit_revocation(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        legacy=RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+str(legacy.access_token))
        self.assertEqual(self.client.get('/api/auth/me/').status_code,200)
        self.assertEqual(self.client.post('/api/auth/sessions/revoke/',{'current_password':self.password}).status_code,200)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/auth/refresh/',{'refresh':str(legacy)}).status_code,401)

    def test_invalid_revocation_input_does_not_crash_or_revoke(self):
        for value in [{'nested':'invalid'},['invalid'],None]:
            self.assertEqual(self.client.post('/api/auth/sessions/revoke/',{'current_password':value},format='json').status_code,400)
        self.assertEqual(self.client.get('/api/auth/me/').status_code,200)
