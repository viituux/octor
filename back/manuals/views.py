"""APIs privadas por criador: coleta, geração, revisão e conversão em guia rascunho."""
from datetime import timedelta
from uuid import uuid4
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from rest_framework import permissions,serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from guides.models import Guide,Step
from .models import ManualRun,ManualCapture
from .serializers import RunInput,CaptureInput,DocumentInput,safe_url,equivalent_page
from .services import decode_capture,capture_fingerprints,plan_manual_navigation

class ManualThrottle(UserRateThrottle):
    scope='manuals'
    rate='12/min'

class ManualProgressThrottle(UserRateThrottle):
    scope='manual_progress'
    rate='120/min'

class Base(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def run(self,request,pk,lock=False):
        query=ManualRun.objects.filter(owner=request.user)
        return get_object_or_404(query.select_for_update() if lock else query,pk=pk)

def data(run,details=False):
    result={'id':str(run.id),'url':run.url,'objective':run.objective,'status':run.status,'message':run.message,'guide_id':run.guide_id,'created_at':run.created_at}
    if details:
        result.update(agent_state=run.agent_state,document=run.document,captures=[{'id':c.id,'title':c.title,'url':c.url,'order':c.order,'evidence':c.evidence} for c in run.captures.all()])
    return result

class Runs(Base):
    throttle_classes=[ManualThrottle]
    def get(self,request):
        return Response([data(r) for r in ManualRun.objects.filter(owner=request.user)[:30]])
    def post(self,request):
        form=RunInput(data=request.data);form.is_valid(raise_exception=True)
        if ManualRun.objects.filter(owner=request.user,status__in=['waiting','capturing','queued','generating']).count()>=5:
            raise serializers.ValidationError('Finalize ou interrompa as coletas pendentes antes de iniciar outra.')
        run=ManualRun.objects.create(owner=request.user,url=form.validated_data['url'],objective=form.validated_data['objective'])
        return Response(data(run,True),status=201)

class Detail(Base):
    def get(self,request,pk):return Response(data(self.run(request,pk),True))

    def delete(self, request, pk):
        with transaction.atomic():
            run = self.run(request, pk, True)
            if run.status in {'waiting', 'capturing', 'queued', 'generating'}:
                return Response({'detail': 'Interrompa a coleta ou geração antes de excluir o manual.'}, status=409)
            screenshots = [capture.screenshot for capture in run.captures.all() if capture.screenshot]
            run.delete()
            for screenshot in screenshots:
                transaction.on_commit(lambda file=screenshot: file.storage.delete(file.name), robust=True)
        return Response(status=204)


class Capture(Base):
    def post(self,request,pk):
        form=CaptureInput(data=request.data);form.is_valid(raise_exception=True);values=dict(form.validated_data)
        image=decode_capture(values.pop('screenshot_base64'))
        with transaction.atomic():
            run=self.run(request,pk,True)
            existing=run.captures.filter(key=values['key']).first()
            if existing:return Response({'id':existing.id,'duplicate':True})
            if run.status not in ['waiting','capturing']:raise serializers.ValidationError('Esta coleta já foi encerrada.')
            # A extensão lê somente a página solicitada; redirects não autorizam outra origem silenciosamente.
            if values['url'].split('#')[0]!=run.url.split('#')[0]:raise serializers.ValidationError('A página mudou. Inicie uma coleta com a nova URL.')
            if run.captures.count()>=6 or run.captures.filter(order=values['order']).exists():raise serializers.ValidationError('Limite ou ordem de captura inválida.')
            image_hash,content_hash=capture_fingerprints(image,values['evidence'])
            for prior in run.captures.all():
                old=prior.evidence
                same_view=prior.url == values['url'] and all(old.get(key)==values['evidence'].get(key) for key in ['scroll_y','viewport_width','viewport_height'])
                if old.get('image_hash')==image_hash or (content_hash and old.get('content_hash')==content_hash and same_view and old.get('quality',{}).get('visual_content',True) is False and values['evidence'].get('quality',{}).get('visual_content',True) is False):
                    return Response({'id':prior.id,'duplicate':True})
            values['evidence'].update(image_hash=image_hash,content_hash=content_hash)
            capture=ManualCapture(run=run,**values);capture.screenshot=image;capture.save()
            run.status='capturing';run.message='Capturando as seções visíveis.';run.save()
        return Response({'id':capture.id,'duplicate':False},status=201)

class ImageView(Base):
    def get(self,request,pk,capture_id):
        capture=get_object_or_404(self.run(request,pk).captures,pk=capture_id)
        response=FileResponse(capture.screenshot.open('rb'),content_type='image/jpeg')
        response['Cache-Control']='private, no-store';response['X-Content-Type-Options']='nosniff'
        return response

class Action(Base):
    throttle_classes=[ManualThrottle]
    def get_throttles(self):
        if self.kwargs.get('action') in ['progress','attention','canonical']:return [ManualProgressThrottle()]
        return super().get_throttles()
    def post(self,request,pk,action):
        if action == 'plan':
            run = self.run(request, pk)
            regenerating = bool(run.agent_state.get('pending') and run.agent_state.get('regenerate_requested'))
            resume_url = run.agent_state.get('resume_required')
            if resume_url and (
                not run.agent_state.get('observation_ticket')
                or request.data.get('observation_ticket') != run.agent_state['observation_ticket']
                or request.data.get('observed_url') != resume_url
                or not request.data.get('screenshot')
            ):
                return Response({'index': None, 'reason': 'pending'})
            if run.agent_state.get('pending') and not regenerating:
                return Response({'index': None, 'reason': 'pending'})
            if run.status != 'capturing':
                raise serializers.ValidationError('Coleta indisponivel.')
            label = serializers.CharField(max_length=120)
            control = serializers.DictField(child=label)
            controls = serializers.ListField(child=control, max_length=40).run_validation(request.data.get('controls'))
            visited = serializers.ListField(child=serializers.CharField(max_length=120), max_length=5).run_validation(request.data.get('visited', []))
            if any(set(item) != {'label', 'kind'} or item['kind'] not in {'page', 'menu', 'search'} for item in controls):
                raise serializers.ValidationError('Controles invalidos.')
            page_fields = serializers.DictField(
                child=serializers.CharField(max_length=700, allow_blank=True),
            ).run_validation(request.data.get('page', {}))
            page = {
                'title': page_fields.get('title', '')[:200],
                'text': page_fields.get('text', ''),
                'url': urlsplit(run.url).hostname or '',
            }
            screenshot = serializers.CharField(max_length=5_600_000, required=False).run_validation(
                request.data.get('screenshot', ''),
            ) if 'screenshot' in request.data else None
            state = run.agent_state
            objective = run.objective
            if state.get('answer'):
                objective += '\nEsclarecimento do usuário: ' + state['answer']
            elif state.get('approved_plan'):
                objective = state['approved_plan'][len(state.get('procedures', []))]['title'] if len(state.get('procedures', [])) < len(state['approved_plan']) else run.objective
            decision = plan_manual_navigation(objective, controls, [] if resume_url else visited, page, screenshot,
                                              classify=regenerating or not state.get('classification'))
            with transaction.atomic():
                current = self.run(request, pk, True)
                if current.status != 'capturing' or current.agent_state != state or current.url != run.url:
                    return Response({'index': None, 'reason': 'pending'})
                reason = decision['reason']
                if reason in ('plan', 'question'):
                    current.agent_state = {
                        'classification': 'amplo' if reason == 'plan' else 'ambiguo',
                        'pending': {
                            'kind': reason, 'url': run.url,
                            'expires_at': (timezone.now() + timedelta(hours=settings.PENDENCIA_TTL_HORAS)).isoformat(),
                            **({'items': decision['items']} if reason == 'plan' else {'question': decision['message']}),
                        },
                    }
                    current.save(update_fields=['agent_state', 'updated_at'])
                    return Response({'index': None, 'reason': 'pending'})
                if regenerating:
                    current.agent_state = {key: value for key, value in state.items() if key != 'regenerate_requested'}
                    current.save(update_fields=['agent_state', 'updated_at'])
                    return Response({'index': None, 'reason': 'pending'})
                if resume_url and reason != 'error':
                    current.agent_state = {
                        key: value for key, value in state.items()
                        if key not in {'observation_ticket', 'resume_required'}
                    }
                    current.save(update_fields=['agent_state', 'updated_at'])
                if reason != 'error' and not state.get('classification'):
                    current.agent_state = {**state, 'classification': 'especifico'}
                    current.save(update_fields=['agent_state', 'updated_at'])
            return Response(decision)
        if action=='generate':return self.generate(request,pk)
        if action=='approve':return self.approve(request,pk)
        with transaction.atomic():
            run=self.run(request,pk,True)
            if action in {'approve-plan', 'answer-question'}:
                pending = run.agent_state.get('pending')
                expected = 'plan' if action == 'approve-plan' else 'question'
                if run.status != 'capturing' or not pending or pending['kind'] != expected:
                    return Response({'detail': 'Pendência indisponível.'}, status=409)
                if parse_datetime(pending['expires_at']) <= timezone.now():
                    return Response({'detail': 'A pendência expirou. Solicite um novo plano ou pergunta.'}, status=409)
                state = {key: value for key, value in run.agent_state.items() if key != 'pending'}
                if expected == 'plan':
                    class Selection(serializers.Serializer):
                        index = serializers.IntegerField(min_value=0, max_value=len(pending['items']) - 1)
                        title = serializers.CharField(max_length=200)

                    selection = Selection(data=request.data.get('items'), many=True, allow_empty=False, max_length=5)
                    selection.is_valid(raise_exception=True)
                    items = list(selection.validated_data)
                    if len({item['index'] for item in items}) != len(items):
                        raise serializers.ValidationError('Selecione cada procedimento apenas uma vez.')
                    state['approved_plan'] = items
                else:
                    state['answer'] = serializers.CharField(max_length=1000).run_validation(request.data.get('answer'))
                # A aprovação não autoriza reutilizar controles de uma observação anterior.
                run.agent_state = {**state, 'resume_required': pending['url']}
            elif action == 'resume-agent':
                expected_url = run.agent_state.get('resume_required')
                if run.status != 'capturing' or not expected_url or run.agent_state.get('pending'):
                    return Response({'detail': 'Não há execução aprovada para retomar.'}, status=409)
                url = serializers.URLField(max_length=2000, validators=[safe_url]).run_validation(request.data.get('url'))
                if url.split('#')[0] != expected_url.split('#')[0]:
                    return Response({
                        'detail': 'A aba mudou. Solicite um novo plano para o endereço atual.',
                        'code': 'url_changed',
                    }, status=409)
                run.agent_state = {**run.agent_state, 'observation_ticket': uuid4().hex}
            elif action == 'regenerate-plan':
                if not (run.agent_state.get('pending') or run.agent_state.get('resume_required')) or run.status != 'capturing':
                    return Response({'detail': 'Nenhum plano ou pergunta pendente.'}, status=409)
                active_url = serializers.URLField(max_length=2000, validators=[safe_url]).run_validation(request.data.get('url'))
                if active_url.split('#')[0] != run.url.split('#')[0]:
                    return Response({'detail': 'A aba mudou. Inicie uma nova coleta usando o endereço atual.'}, status=409)
                if run.agent_state.get('pending'):
                    run.agent_state = {**run.agent_state, 'regenerate_requested': True}
                else:
                    run.agent_state = {}
            elif action=='canonical':
                if run.status not in ['waiting','capturing']:raise serializers.ValidationError('Não é possível trocar a página de uma coleta já registrada.')
                url=serializers.URLField(max_length=2000,validators=[safe_url]).run_validation(request.data.get('url'))
                if not equivalent_page(run.url,url):raise serializers.ValidationError('O endereço final está fora do escopo desta coleta. Inicie outra coleta com a URL final.')
                run.url=url;run.message='Endereço final confirmado. Aguardando o conteúdo da página.'
            elif action=='progress':
                if run.status not in ['waiting','capturing']:return Response(data(run,True))
                run.message=serializers.CharField(max_length=500).run_validation(request.data.get('message'))
                run.status='capturing'
            elif action=='cancel':
                if run.status=='approved':raise serializers.ValidationError('O manual já foi convertido em guia.')
                run.status='cancelled';run.message='Coleta interrompida. Nenhum guia foi publicado.'
            elif action == 'finish-procedure':
                state = run.agent_state
                if run.status != 'capturing' or state.get('pending') or state.get('resume_required'):
                    return Response({'detail': 'A execução não está disponível.'}, status=409)
                result = serializers.ChoiceField(choices=['concluido', 'precisa_usuario', 'bloqueado']).run_validation(request.data.get('state'))
                reason = serializers.CharField(max_length=500).run_validation(request.data.get('reason'))
                capture_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('capture_id'))
                if not run.captures.filter(id=capture_id).exists():
                    raise serializers.ValidationError('O print precisa pertencer à execução.')
                procedures = state.get('procedures', [])
                if any(item['capture_id'] == capture_id for item in procedures):
                    return Response(data(run, True))
                queue = state.get('approved_plan') or [{'title': run.objective}]
                if len(procedures) >= len(queue):
                    return Response({'detail': 'Todos os procedimentos já foram registrados.'}, status=409)
                run.agent_state = {**state, 'procedures': [*procedures, {
                    'title': queue[len(procedures)]['title'], 'state': result,
                    'reason': reason, 'capture_id': capture_id,
                }]}
            elif action=='captured':
                if run.status=='captured':return Response(data(run,True))
                if run.status not in ['waiting','capturing'] or not run.captures.exists():raise serializers.ValidationError('Não há uma coleta ativa com capturas.')
                run.status='captured';run.message='Capturas prontas. Confira as imagens antes de gerar o manual.'
            elif action=='attention':
                if run.status not in ['waiting','capturing']:return Response(data(run,True))
                run.message=serializers.CharField(max_length=500).run_validation(request.data.get('message','A coleta precisa de atenção. Confira a aba e continue pela extensão.'))
            else:raise serializers.ValidationError('Ação inválida.')
            run.save()
        return Response(data(run,True))

    def generate(self,request,pk):
        with transaction.atomic():
            run=self.run(request,pk,True)
            if run.status in ['review','approved']:return Response(data(run,True))
            if run.status in ['queued', 'generating']:
                return Response(data(run, True), status=202)
            if run.status not in ['captured','failed']:raise serializers.ValidationError('Aguarde o fim da coleta antes de gerar.')
            if not run.captures.exists():raise serializers.ValidationError('Nenhuma captura disponível.')
            run.status = 'queued'
            run.message = 'Manual na fila. Você pode sair desta página e voltar para acompanhar.'
            run.save(update_fields=['status', 'message', 'updated_at'])
        return Response(data(run, True), status=202)

    def approve(self,request,pk):
        with transaction.atomic():
            run=self.run(request,pk,True)
            if run.status=='approved':return Response(data(run,True))
            if run.status!='review':raise serializers.ValidationError('Gere e revise o manual antes de aprovar.')
            form=DocumentInput(data=request.data.get('document'),context={'capture_ids':set(run.captures.values_list('id',flat=True)),'capture_controls':{c.id:c.evidence.get('controls',[]) for c in run.captures.all()}});form.is_valid(raise_exception=True)
            if request.data.get('reviewed') is not True:raise serializers.ValidationError('Confirme que revisou as imagens e instruções.')
            document=dict(form.validated_data)
            guide=Guide.objects.create(owner=request.user,title=document['title'],description=document['summary'],status='draft')
            captures={c.id:c for c in run.captures.all()};order=0
            for section in document['sections']:
                for item in section['steps']:
                    order+=1;capture=captures[item['capture_id']]
                    control_index=item.get('control_index');control=capture.evidence.get('controls',[])[control_index] if control_index is not None else None
                    step=Step(guide=guide,order=order,text=item['text'],url=capture.url,action_type='reference',annotations=[{'type':'manual_section','title':section['title']},{'type':'manual_evidence','capture_id':capture.id,'interaction_verified':False,'kind':item.get('kind','guidance')}])
                    meta={'type':'capture_metadata','viewport_width':capture.evidence['viewport_width'],'viewport_height':capture.evidence['viewport_height']}
                    if control:
                        meta['element_rect']=control['rect'];step.element_text=control['label']
                    step.annotations.extend([meta,{'type':'image_view','zoom':1}])
                    # Imagens aprovadas seguem o armazenamento de guias existente; as capturas brutas seguem privadas.
                    with capture.screenshot.open('rb') as image:step.screenshot.save(f'manual-{run.id}-{order}.jpg',image,save=False)
                    step.save()
            run.guide=guide;run.document=document;run.status='approved';run.message='Manual revisado e salvo como guia rascunho.';run.save()
        return Response(data(run,True))
