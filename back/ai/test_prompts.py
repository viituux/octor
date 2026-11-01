# Testes de regressão: dados isolados e dependências simuladas verificam permissões, validações e preservação de estado nas falhas.
# Dependência: simulações de dependências e asserções dos testes.
from unittest.mock import patch
# Dependência: fixtures, isolamento de banco e verificações de regressão Django.
from django.test import TestCase, override_settings
# Dependência: usuários, validação de senha e autenticação do Django.
from django.contrib.auth.models import User
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework.test import APIClient
# Dependência: contratos e funções do módulo guides.models reutilizados neste fluxo.
from guides.models import Guide, Step
# Dependência: contratos e funções do módulo .prompts reutilizados neste fluxo.
from .prompts import build_generation_brief, has_custom_prompt, DEFAULT_STEP_PROMPT

@override_settings(LLM_PROVIDER='gemini',LLM_API_KEY='test-key',LLM_MODEL='test-model')
class AutomaticBriefTests(TestCase):
    # Cria usuários e registros isolados necessários aos cenários desta classe de testes.
    # Retorno: None; o efeito está nas operações do corpo.
    def setUp(self):
        self.user=User.objects.create_user(username='brief-author')
        self.guide=Guide.objects.create(owner=self.user,title='Cadastro de clientes')
        self.step=Step.objects.create(guide=self.guide,order=1,action_type='click',element_text='Salvar',input_value='sensitive-value')
        self.client=APIClient();self.client.force_authenticate(self.user)
        self.url=f'/api/guides/{self.guide.id}/steps/{self.step.id}/generate-text/'

    # Regressão de AutomaticBriefTests: cenário `brief_is_specific_to_action_and_guide`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_brief_is_specific_to_action_and_guide(self):
        first=build_generation_brief(self.step)
        self.assertIn('Cadastro de clientes',first)
        self.assertIn('clicar em',first)
        self.assertIn('Salvar',first)
        self.assertNotIn('sensitive-value',first)
        self.step.action_type='input';self.step.element_text='E-mail';self.step.order=2
        second=build_generation_brief(self.step)
        self.assertIn('preencher',second);self.assertIn('E-mail',second);self.assertIn('passo 2',second)
        self.assertNotEqual(first,second)

    # Regressão de AutomaticBriefTests: cenário `missing_image_does_not_invent_visual_location`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_missing_image_does_not_invent_visual_location(self):
        self.assertIn('sem captura',build_generation_brief(self.step))
        self.step.screenshot='test.png'
        self.assertIn('Analise esta captura',build_generation_brief(self.step))

    # Regressão de AutomaticBriefTests: cenário `voice_guidance_is_included_only_when_narration_exists`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_voice_guidance_is_included_only_when_narration_exists(self):
        self.assertNotIn('fala transcrita',build_generation_brief(self.step))
        self.step.narration='narration.webm'
        self.assertIn('fala transcrita',build_generation_brief(self.step))

    # Regressão de AutomaticBriefTests: cenário `guide_read_provides_suggestion_without_writing_or_generating`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_guide_read_provides_suggestion_without_writing_or_generating(self):
        response=self.client.get(f'/api/guides/{self.guide.id}/')
        self.assertEqual(response.status_code,200)
        item=response.data['steps'][0]
        self.assertIn('Salvar',item['generation_prompt_suggestion'])
        self.assertEqual(item['generation_prompt_mode'],'automatic')
        self.step.refresh_from_db();self.assertEqual(self.step.generation_prompt,'')

    # Regressão de AutomaticBriefTests: cenário `legacy_generic_prompt_is_automatic_but_custom_text_is_preserved`; as asserções abaixo delimitam o comportamento esperado.
    # Retorno: None; o efeito está nas operações do corpo.
    def test_legacy_generic_prompt_is_automatic_but_custom_text_is_preserved(self):
        self.step.generation_prompt=DEFAULT_STEP_PROMPT
        self.assertFalse(has_custom_prompt(self.step))
        self.step.generation_prompt='Explique para a equipe de suporte.'
        self.assertTrue(has_custom_prompt(self.step))

    # Regressão de AutomaticBriefTests: cenário `automatic_brief_is_used_and_remains_automatic`; as asserções abaixo delimitam o comportamento esperado.
    # Parâmetros — provider: argumento fornecido pelo chamador no contrato desta função.
    # Retorno: None; o efeito está nas operações do corpo.
    @patch('ai.tasks.call_gemini_vision',return_value=('Clique em Salvar para enviar os dados.',None))
    def test_automatic_brief_is_used_and_remains_automatic(self,provider):
        result=self.client.post(self.url,{'prompt_mode':'automatic'},format='json')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.data['generation_prompt_mode'],'automatic')
        self.assertIn('Salvar',result.data['generation_prompt'])
        self.assertIn(result.data['generation_prompt'],provider.call_args.args[1])
        self.step.refresh_from_db();self.assertFalse(has_custom_prompt(self.step))

    # Regressão de AutomaticBriefTests: cenário `custom_prompt_is_kept_until_author_chooses_automatic`; as asserções abaixo delimitam o comportamento esperado.
    # Parâmetros — provider: argumento fornecido pelo chamador no contrato desta função.
    # Retorno: None; o efeito está nas operações do corpo.
    @patch('ai.tasks.call_gemini_vision',return_value=('Instrução gerada.',None))
    def test_custom_prompt_is_kept_until_author_chooses_automatic(self,provider):
        custom='Explique para um administrador experiente.'
        self.client.post(self.url,{'prompt':custom,'prompt_mode':'manual'},format='json')
        repeated=self.client.post(self.url,{},format='json')
        self.assertEqual(repeated.data['generation_prompt'],custom)
        self.assertEqual(repeated.data['generation_prompt_mode'],'manual')
        reset=self.client.post(self.url,{'prompt_mode':'automatic'},format='json')
        self.assertEqual(reset.data['generation_prompt_mode'],'automatic')
        self.assertNotEqual(reset.data['generation_prompt'],custom)

    # Regressão de AutomaticBriefTests: cenário `automatic_brief_refreshes_when_guide_title_changes`; as asserções abaixo delimitam o comportamento esperado.
    # Parâmetros — provider: argumento fornecido pelo chamador no contrato desta função.
    # Retorno: None; o efeito está nas operações do corpo.
    @patch('ai.tasks.call_gemini_vision',return_value=('Instrução gerada.',None))
    def test_automatic_brief_refreshes_when_guide_title_changes(self,provider):
        self.client.post(self.url,{'prompt_mode':'automatic'},format='json')
        self.guide.title='Novo procedimento';self.guide.save()
        result=self.client.post(self.url,{'prompt_mode':'automatic'},format='json')
        self.assertIn('Novo procedimento',result.data['generation_prompt'])
        self.assertEqual(result.data['generation_prompt_mode'],'automatic')
