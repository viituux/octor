/** Participante: conteúdo → avaliação. O servidor confirma a conclusão e impede feedback duplicado. */
import {Component, OnInit, NgZone} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService, Training, trainingError} from '../../services/training.service';
import {TrainingNavComponent} from './training-nav.component';
import {StepCaptureComponent} from '../guide-editor/step-capture.component';
import {StepNarrationComponent} from '../guide-editor/step-narration.component';

@Component({standalone:true, imports:[CommonModule, FormsModule, RouterModule, TrainingNavComponent,
  StepCaptureComponent, StepNarrationComponent], templateUrl:'./training-player.component.html', styleUrls:['./trainings.css']})
export class TrainingPlayerComponent implements OnInit {
  id=0; training:Training|null=null; loading=true; busy=false; error=''; notice='';
  /** A etapa reflete o progresso confirmado na API, sem perguntas ou pontuação. */
  stage:'content'|'feedback'|'done'='content';
  stars=0; comment=''; stepIndex=0;

  constructor(private service:TrainingService, private route:ActivatedRoute, private zone:NgZone) {}

  /** Obtém o identificador da rota e carrega o progresso do participante. */
  ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'));this.load();}
  get steps(){return this.training?.content?.steps||[];}
  get step(){return this.steps[this.stepIndex];}
  get completedFeedback(){return this.training?.progress?.feedback;}
  /** Retorna a confirmação conforme o comentário opcional enviado. */
  get confirmation(){return this.completedFeedback?.comment
    ?'Obrigado! Você realizou, avaliou e comentou o treinamento '+this.training?.title+'.'
    :'Obrigado! Você realizou e avaliou o treinamento '+this.training?.title+'.';}

  /** Reabre na etapa persistida. Falhas preservam a mensagem e liberam o carregamento. */
  async load(){
    this.loading=true;this.error='';
    try {
      this.training=await firstValueFrom(this.service.get(this.id));
      this.stage=this.completedFeedback?'done':this.training.progress.completed_at?'feedback':'content';
      if(this.route.snapshot.queryParamMap.get('guided')==='complete' && this.training.progress.started_at
          && !this.training.progress.completed_at && this.training.status==='published')await this.complete();
    } catch(e){this.error=trainingError(e);} finally{this.loading=false;}
  }

  /** Envia uma ação; retorna a resposta ou null em falha/reentrada, sem avançar antecipadamente. */
  async run(action:string,data:any={}){
    if(this.busy)return null;this.busy=true;this.error='';
    try{return await firstValueFrom(this.service.action(this.id,action,data));}
    catch(e){this.error=trainingError(e);setTimeout(()=>document.getElementById('training-error')?.focus(),0);return null;}
    finally{this.busy=false;}
  }
  /** Confirma o início sem reiniciar uma participação já existente. */
  async start(){const progress=await this.run('start');if(progress)this.training!.progress=progress;}
  /** Só libera o feedback depois da confirmação da conclusão na API. */
  async complete(){const progress=await this.run('complete');if(progress){this.training!.progress=progress;this.evaluate();}}
  evaluate(){this.stage=this.completedFeedback?'done':'feedback';this.focus();}
  /** Valida limites locais e mantém o formulário disponível para nova tentativa em caso de erro. */
  async sendFeedback(){
    if(!this.stars||this.comment.length>500)return;
    const feedback=await this.run('feedback',{stars:this.stars,comment:this.comment});
    if(feedback){this.training!.progress.feedback=feedback;this.stage='done';this.focus();}
  }
  review(){this.stage='content';this.stepIndex=0;this.focus();}
  focus(id='training-stage'){setTimeout(()=>document.getElementById(id)?.focus(),0);}
  /** Solicita orientação no site real; falhas de extensão não concluem o conteúdo. */
  async playback(){
    if(!this.training?.progress.started_at){await this.start();if(!this.training?.progress.started_at)return;}
    const runtime=(window as any).chrome?.runtime,extension=localStorage.getItem('autoguide_extension_id');
    if(!runtime?.sendMessage||!extension){this.notice='Conecte a extensão em Minha conta para usar o Me guie. Você pode acompanhar o conteúdo abaixo.';return;}
    this.busy=true;this.error='';
    runtime.sendMessage(extension,{action:'START_PLAYBACK',title:this.training!.title,steps:this.steps,
      trainingId:this.id,completionUrl:location.origin+'/trainings/'+this.id+'?guided=complete'},
      (response:any)=>this.zone.run(()=>{this.busy=false;
        if(runtime.lastError||response?.error)this.error=response?.error||'Não foi possível abrir a extensão. Reconecte sua conta.';
        else this.notice='Tutorial aberto. Ao concluir, volte aqui para avaliar o treinamento.';
      }));
  }
}
