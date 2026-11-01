# Testes de regressão: dados isolados e dependências simuladas verificam permissões, validações e preservação de estado nas falhas.
# Dependência: datas e intervalos usados por expiração e filtros.
from datetime import timedelta
# Dependência: resumos criptográficos para identificar conteúdo ou tokens sem guardar seu texto em claro.
import hashlib
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: tempo e utilitários compatíveis com a configuração Django.
from django.utils import timezone
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.test import APITestCase
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import Guide, Step, Workspace, WorkspaceInvitation, GuideShare

class LibraryTests(APITestCase):
    # Cria usuários e registros isolados necessários aos cenários desta classe de testes.
    # Retorno: None; o efeito está nas operações do corpo.
    def setUp(self):
        self.owner=User.objects.create_user('owner',email='owner@test.com')
        self.reader=User.objects.create_user('reader',email='reader@test.com')
        self.other=User.objects.create_user('other',email='other@test.com')
        self.space=Workspace.objects.create(name='Equipe',owner=self.owner)
        self.space.members.add(self.owner,self.reader)
        self.guide=Guide.objects.create(owner=self.owner,title='Procedimento',workspace=self.space)
        self.step=Step.objects.create(guide=self.guide,text='Clique')
        self.url=f'/api/guides/{self.guide.id}/'
        self.client.force_authenticate(self.owner)
    # Regressão de LibraryTests: cenário `list_contract`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_list_contract(self):
        response=self.client.get('/api/guides/')
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.data[0]['can_edit'])
        self.assertEqual(response.data[0]['workspace_name'],'Equipe')
    # Regressão de LibraryTests: cenário `team_draft_private_published_read_only`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_team_draft_private_published_read_only(self):
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get(self.url).status_code,404)
        self.guide.status='published';self.guide.save()
        self.assertFalse(self.client.get(self.url).data['can_edit'])
        self.assertEqual(self.client.patch(self.url,{'title':'alterado'}).status_code,403)
        self.assertEqual(self.client.patch(f'/api/guides/steps/{self.step.id}/',{'text':'alterado'}).status_code,403)
        self.assertEqual(self.client.delete(f'/api/guides/steps/{self.step.id}/').status_code,403)
        self.assertEqual(self.client.post(self.url+'steps/',{'text':'novo'}).status_code,403)
    # Regressão de LibraryTests: cenário `direct_share_revoke_and_personal_favorite`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_direct_share_revoke_and_personal_favorite(self):
        self.assertEqual(self.client.post(self.url+'share/',{'email':self.other.email}).status_code,200)
        self.client.force_authenticate(self.other)
        self.assertTrue(self.client.get(self.url).data['shared_directly'])
        self.assertEqual(self.client.post(self.url+'favorite/',{'favorite':True},format='json').status_code,200)
        self.assertTrue(self.guide.starred_by.filter(pk=self.other.pk).exists())
        self.assertFalse(self.guide.starred_by.filter(pk=self.owner.pk).exists())
        self.assertEqual(self.client.get(self.url+'share/').status_code,403)
        self.client.force_authenticate(self.owner)
        self.client.delete(self.url+'share/',{'user_id':self.other.id},format='json')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,404)
    # Regressão de LibraryTests: cenário `soft_delete_restore_and_permanent_delete`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_soft_delete_restore_and_permanent_delete(self):
        GuideShare.objects.create(guide=self.guide,user=self.other)
        self.assertEqual(self.client.post(self.url+'permanent-delete/').status_code,404)
        self.assertEqual(self.client.delete(self.url).status_code,204)
        self.assertEqual(len(self.client.get('/api/guides/').data),0)
        self.assertEqual(len(self.client.get('/api/guides/?include_trash=1').data),1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,404)
        self.assertEqual(len(self.client.get('/api/guides/?include_trash=1').data),0)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.url+'restore/').status_code,200)
        self.client.delete(self.url)
        self.assertEqual(self.client.post(self.url+'permanent-delete/').status_code,204)
        self.assertFalse(Guide.objects.filter(pk=self.guide.pk).exists())
    # Regressão de LibraryTests: cenário `workspace_creation_and_unauthorized_assignment`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_workspace_creation_and_unauthorized_assignment(self):
        response=self.client.post('/api/workspaces/',{'name':'Nova'})
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['role'],'owner')
        self.assertTrue(Workspace.objects.get(pk=response.data['id']).members.filter(pk=self.owner.pk).exists())
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/guides/',{'title':'Teste','workspace':self.space.id}).status_code,400)
    # Regressão de LibraryTests: cenário `member_cannot_manage_team`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_member_cannot_manage_team(self):
        self.client.force_authenticate(self.reader)
        base=f'/api/workspaces/{self.space.id}/'
        self.assertEqual(self.client.patch(base,{'name':'Troca'}).status_code,403)
        self.assertEqual(self.client.post(base+'invitations/',{'email':self.other.email}).status_code,403)
        self.assertEqual(self.client.delete(base+'members/',{'user_id':self.owner.id}).status_code,403)
    # Regressão de LibraryTests: cenário `invitation_email_expiry_hash_and_accept`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_invitation_email_expiry_hash_and_accept(self):
        response=self.client.post(f'/api/workspaces/{self.space.id}/invitations/',{'email':self.other.email})
        self.assertEqual(response.status_code,201)
        token=response.data['token'];invite=WorkspaceInvitation.objects.get(pk=response.data['id'])
        self.assertEqual(invite.token_hash,hashlib.sha256(token.encode()).hexdigest())
        url=f'/api/workspaces/invitations/{token}/'
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.post(url).status_code,403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url).status_code,200)
        self.assertEqual(self.client.post(url).status_code,200)
        self.assertTrue(self.space.members.filter(pk=self.other.pk).exists())
        invite.expires_at=timezone.now()-timedelta(seconds=1);invite.save()
        self.assertEqual(self.client.post(url).status_code,403)
    # Regressão de LibraryTests: cenário `revoked_invitation_cannot_be_used`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_revoked_invitation_cannot_be_used(self):
        result=self.client.post(f'/api/workspaces/{self.space.id}/invitations/',{'email':self.other.email}).data
        self.client.delete(f'/api/workspaces/{self.space.id}/invitations/',{'invitation_id':result['id']},format='json')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f"/api/workspaces/invitations/{result['token']}/").status_code,403)
    # Regressão de LibraryTests: cenário `removed_member_loses_team_access`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_removed_member_loses_team_access(self):
        self.guide.status='published';self.guide.save()
        base=f'/api/workspaces/{self.space.id}/members/'
        self.assertEqual(self.client.delete(base,{'user_id':self.owner.id},format='json').status_code,400)
        self.assertEqual(self.client.delete(base,{'user_id':'bad'},format='json').status_code,400)
        self.client.delete(base,{'user_id':self.reader.id},format='json')
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get(self.url).status_code,404)

    # Regressão de LibraryTests: cenário `removed_invitee_cannot_rejoin_with_old_link`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_removed_invitee_cannot_rejoin_with_old_link(self):
        result=self.client.post(f'/api/workspaces/{self.space.id}/invitations/',{'email':self.other.email}).data
        url=f"/api/workspaces/invitations/{result['token']}/"
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url).status_code,200)
        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/workspaces/{self.space.id}/members/',{'user_id':self.other.id},format='json')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url).status_code,403)

    # Regressão de LibraryTests: cenário `creator_can_add_manual_step`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_creator_can_add_manual_step(self):
        response=self.client.post(self.url+'steps/',{'text':'Descreva esta etapa.','action_type':'click'})
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['order'],2)
