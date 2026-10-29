import {Component,OnInit,OnDestroy,NgZone} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService,Training,trainingError} from '../../services/training.service';
import {TrainingNavComponent} from './training-nav.component';
import {StepCaptureComponent} from '../guide-editor/step-capture.component';
import {StepNarrationComponent} from '../guide-editor/step-narration.component';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,TrainingNavComponent,StepCaptureComponent,StepNarrationComponent],templateUrl:'./training-player.component.html',styleUrls:['./trainings.css']})
export class TrainingPlayerComponent implements OnInit,OnDestroy{
 id=0;training:Training|null=null;loading=true;busy=false;error='';notice='';stage:'content'|'quiz'|'result'|'feedback'|'done'='content';state:any=null;feedback:any=null;question:any=null;selected:number|null=null;stars=0;comment='';stepIndex=0;elapsed=0;private timer:any;
 constructor(private service:TrainingService,private route:ActivatedRoute,private zone:NgZone){}
 ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'));this.load();this.timer=setInterval(()=>{if(this.state?.result?.started_at&&!this.state.result.finished_at)this.elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(this.state.result.started_at))/1000));},1000);}
 ngOnDestroy(){clearInterval(this.timer);}
 get steps(){return this.training?.content?.steps||[];}
 get step(){return this.steps[this.stepIndex];}
 get lastResult(){return this.training?.progress?.results?.slice(-1)[0];}
 get completedFeedback(){return this.training?.progress?.feedback;}
 get confirmation(){return this.completedFeedback?.comment?'Obrigado! Você realizou, avaliou e comentou o treinamento '+this.training?.title+'.':'Obrigado! Você realizou e avaliou o treinamento '+this.training?.title+'.';}
 async load(){this.loading=true;this.error='';try{this.training=await firstValueFrom(this.service.get(this.id));if(this.training.progress.feedback)this.stage='done';else if(this.training.progress.quiz_completed)this.stage='result';else this.stage='content';if(this.route.snapshot.queryParamMap.get('guided')==='complete' && this.training.progress.started_at && !this.training.progress.quiz_completed && this.training.status==='published'){if(!this.training.progress.completed_at)await this.complete();else await this.startQuiz();}}catch(e){this.error=trainingError(e);}finally{this.loading=false;}}
 async run(action:string,data:any={}){if(this.busy)return null;this.busy=true;this.error='';try{return await firstValueFrom(this.service.action(this.id,action,data));}catch(e){this.error=trainingError(e);setTimeout(()=>document.getElementById('training-error')?.focus(),0);return null;}finally{this.busy=false;}}
 async start(){const p=await this.run('start');if(p)this.training!.progress=p;}
 async complete(){const p=await this.run('complete');if(p){this.training!.progress=p;await this.startQuiz();}}
 async startQuiz(){const state=await this.run('quiz-start');if(!state)return;this.state=state;this.question=state.question;this.feedback=null;this.selected=null;this.stage=state.result.finished_at?'result':'quiz';this.focus();}
 async answer(){if(this.selected===null||this.feedback)return;const state=await this.run('answer',{result_id:this.state.result.id,question_id:this.question.id,alternative_id:this.selected});if(state){this.state=state;this.feedback=state.feedback;this.focus('quiz-feedback');}}
 next(){if(this.state.result.finished_at){this.training!.progress.quiz_completed=true;this.training!.progress.results=[...(this.training!.progress.results||[]).filter((r:any)=>r.id!==this.state.result.id),this.state.result];this.training!.progress.attempts_used=this.state.result.attempt;this.training!.progress.can_retry=this.state.result.attempt<this.training!.max_attempts;this.stage='result';}else{this.question=this.state.question;this.selected=null;this.feedback=null;}this.focus();}
 evaluate(){this.stage='feedback';this.focus();}
 async sendFeedback(){if(!this.stars||this.comment.length>500)return;const fb=await this.run('feedback',{stars:this.stars,comment:this.comment});if(fb){this.training!.progress.feedback=fb;this.stage='done';this.focus();}}
 review(){this.stage='content';this.stepIndex=0;}
 focus(id='training-stage'){setTimeout(()=>document.getElementById(id)?.focus(),0);}
 async playback(){if(!this.training?.progress.started_at){await this.start();if(!this.training?.progress.started_at)return;}const runtime=(window as any).chrome?.runtime,extension=localStorage.getItem('autoguide_extension_id');if(!runtime?.sendMessage||!extension){this.notice='Conecte a extensão em Minha conta para usar o Me guie. Você pode acompanhar o conteúdo abaixo.';return;}this.busy=true;this.error='';runtime.sendMessage(extension,{action:'START_PLAYBACK',title:this.training!.title,steps:this.steps,trainingId:this.id,completionUrl:location.origin+'/trainings/'+this.id+'?guided=complete'},(response:any)=>this.zone.run(()=>{this.busy=false;if(runtime.lastError||response?.error)this.error=response?.error||'Não foi possível abrir a extensão. Reconecte sua conta.';else this.notice='Tutorial aberto. Ao concluir, volte aqui para confirmar a conclusão e responder ao quiz.';}));}
}
