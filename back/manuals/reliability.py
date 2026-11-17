"""Persist Gemini inputs before analysis; serialize and replay correlated decisions."""
import base64
import hashlib
import json
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from .models import ManualObservation
from .services import decode_capture

logger = logging.getLogger(__name__)


def action_checkpoint(view,request,pk,action):
    step_id=serializers.UUIDField().run_validation(request.data.get('step_id'))
    execution_id=serializers.UUIDField().run_validation(request.data.get('execution_id'))
    image=None
    if action == 'action-result':
        if request.data.get('stable') is not True or request.data.get('verified') is not True:
            raise serializers.ValidationError('Resultado sem estabilidade e verificação.')
        image=decode_capture(serializers.CharField(max_length=5_600_000).run_validation(request.data.get('screenshot')))
    with transaction.atomic():
        run=view.run(request,pk,True)
        observation=run.observations.filter(step_id=step_id,execution_id=execution_id,status='COMPLETED',capture__isnull=False).first()
        if run.status!='capturing' or not observation or observation.decision.get('reason')!='next':
            return Response({'detail':'Ação sem observação salva correspondente.'},status=409)
        if action == 'action-intent':
            if observation.action_status:
                return Response({'detail':'A ação já foi reservada. Não repita o comando.'},status=409)
            if run.observations.filter(action_status='EXECUTING').exists():
                # An unknown outcome requires fresh observation on Continue, never replay.
                return Response({'detail':'Confira a ação interrompida antes de continuar.'},status=409)
            observation.action_status='EXECUTING'
            observation.save(update_fields=['action_status'])
        else:
            if observation.action_status=='COMPLETED':
                with observation.result_screenshot.open('rb') as saved:
                    same=hashlib.sha256(saved.read()).digest()==hashlib.sha256(image.read()).digest()
                if not same:
                    return Response({'detail':'Resultado já confirmado com outra captura.'},status=409)
                return Response({'id':observation.pk,'step_id':str(step_id),'execution_id':str(execution_id)})
            if observation.action_status!='EXECUTING':
                return Response({'detail':'Ação sem reserva de execução.'},status=409)
            observation.result_screenshot=image
            observation.action_status='COMPLETED'
            observation.save(update_fields=['result_screenshot','action_status'])
    logger.info('manual_step execution_id=%s step_id=%s action_state=%s timestamp=%s',
                execution_id,step_id,observation.action_status,timezone.now().isoformat())
    return Response({'id':observation.pk,'step_id':str(step_id),'execution_id':str(execution_id)})


def correlated_plan(view, request, pk):
    # Existing clients retain their contract; upgraded clients must send both IDs.
    correlated = 'step_id' in request.data or 'execution_id' in request.data
    if not correlated and not request.data.get('screenshot'):
        return view.plan(request, pk, request.data)
    step_id = serializers.UUIDField().run_validation(request.data.get('step_id')) if correlated else None
    execution_id = serializers.UUIDField().run_validation(request.data.get('execution_id')) if correlated else None
    screenshot = serializers.CharField(max_length=5_600_000).run_validation(request.data.get('screenshot'))
    image = decode_capture(screenshot)
    digest = hashlib.sha256(json.dumps(request.data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    with transaction.atomic():
        run = view.run(request, pk, True)
        if run.status != 'capturing':
            return Response({'detail': 'Coleta indisponível.'}, status=409)
        if step_id:
            previous = ManualObservation.objects.filter(step_id=step_id).first()
            if previous:
                if previous.run_id != run.pk or previous.execution_id != execution_id or previous.request_hash != digest:
                    return Response({'detail': 'Identificador reutilizado com outra observação.'}, status=409)
                if previous.status == 'COMPLETED':
                    return Response({**previous.decision, 'step_id': str(step_id), 'execution_id': str(execution_id)})
                return Response({'detail': 'Observação em processamento ou interrompida. Confira a coleta.'}, status=409)
        if run.observations.filter(status='ANALYZING', created_at__gt=timezone.now()-timedelta(seconds=60)).exists():
            return Response({'detail': 'Já existe uma análise em andamento.'}, status=409)
        if run.observations.filter(action_status='EXECUTING').exists() and request.data.get('recover_interrupted') is not True:
            return Response({'detail':'Uma ação anterior ainda não foi confirmada.'},status=409)
        # An expired reservation is never rerun: its response may still arrive.
        run.observations.filter(status='ANALYZING').update(status='FAILED')
        from uuid import uuid4
        observation = ManualObservation(run=run, step_id=step_id or uuid4(),
            execution_id=execution_id or uuid4(), request_hash=digest)
        observation.screenshot = image
        observation.save()
        if request.data.get('recover_interrupted') is True:
            run.observations.filter(action_status='EXECUTING').update(action_status='INTERRUPTED')
        observed_url = run.url
    logger.info('manual_step execution_id=%s step_id=%s state=ANALYZING timestamp=%s',
                observation.execution_id, observation.step_id, timezone.now().isoformat())
    try:
        # Read the actual saved file. A storage failure cannot silently reach Gemini.
        with observation.screenshot.open('rb') as saved:
            persisted = 'data:image/jpeg;base64,' + base64.b64encode(saved.read()).decode()
        payload = request.data.copy()
        payload['screenshot'] = persisted
        payload['_observation_id'] = observation.pk
        response = view.plan(request, pk, payload)
        with transaction.atomic():
            current = view.run(request, pk, True)
            observation.refresh_from_db()
            if current.status != 'capturing' or current.url != observed_url or observation.status != 'ANALYZING':
                observation.status = 'FAILED'
                observation.save(update_fields=['status'])
                return Response({'detail': 'Resposta antiga descartada.'}, status=409)
            observation.decision = dict(response.data)
            observation.status = 'COMPLETED' if response.status_code == 200 else 'FAILED'
            observation.save(update_fields=['decision', 'status'])
        logger.info('manual_step execution_id=%s step_id=%s state=%s storage=confirmed timestamp=%s',
                    observation.execution_id, observation.step_id, observation.status, timezone.now().isoformat())
        if correlated:
            response.data = {**response.data, 'step_id': str(step_id), 'execution_id': str(execution_id)}
        return response
    except Exception:
        ManualObservation.objects.filter(pk=observation.pk).update(status='FAILED')
        logger.warning('manual_step execution_id=%s step_id=%s state=FAILED reason=analysis_or_storage',
                       observation.execution_id, observation.step_id)
        raise
