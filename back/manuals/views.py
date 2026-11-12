"""APIs privadas por criador: coleta, geração, revisão e conversão em guia rascunho."""
from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions,serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from guides.models import Guide,Step
from .models import ManualRun,ManualCapture
from .serializers import RunInput,CaptureInput,DocumentInput,safe_url,equivalent_page
from .services import decode_capture,capture_fingerprints

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
        result.update(document=run.document,captures=[{'id':c.id,'title':c.title,'url':c.url,'order':c.order,'evidence':c.evidence} for c in run.captures.all()])
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
                same_view=all(old.get(key)==values['evidence'].get(key) for key in ['scroll_y','viewport_width','viewport_height'])
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
        if action=='generate':return self.generate(request,pk)
        if action=='approve':return self.approve(request,pk)
        with transaction.atomic():
            run=self.run(request,pk,True)
            if action=='canonical':
                if run.status not in ['waiting','capturing'] or run.captures.exists():raise serializers.ValidationError('Não é possível trocar a página de uma coleta já registrada.')
                url=serializers.URLField(max_length=2000,validators=[safe_url]).run_validation(request.data.get('url'))
                if not equivalent_page(run.url,url):raise serializers.ValidationError('O redirecionamento mudou o site ou a rota. Autorize uma nova coleta com a URL final.')
                run.url=url;run.message='Endereço final confirmado. Aguardando o conteúdo da página.'
            elif action=='progress':
                if run.status not in ['waiting','capturing']:return Response(data(run,True))
                run.message=serializers.CharField(max_length=500).run_validation(request.data.get('message'))
                run.status='capturing'
            elif action=='cancel':
                if run.status=='approved':raise serializers.ValidationError('O manual já foi convertido em guia.')
                run.status='cancelled';run.message='Coleta interrompida. Nenhum guia foi publicado.'
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
            guide=Guide.objects.create(owner=request.user,title=document['title'],description=document['summary']+'\nManual de referência das telas observadas. Ações não foram executadas automaticamente.',status='draft')
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
