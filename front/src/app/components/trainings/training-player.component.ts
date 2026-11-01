/** Participante: conteúdo → quiz → resultado → avaliação. O servidor confirma progresso e respostas; o relógio local apenas apresenta o tempo. */
/**
 * Dependência ({Component,OnInit,OnDestroy,NgZone}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit,OnDestroy,NgZone} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({FormsModule}): vínculo e validação dos formulários da interface.
 */
import {FormsModule} from '@angular/forms';
/**
 * Dependência ({ActivatedRoute,RouterModule}): rotas, parâmetros e navegação entre as telas.
 */
import {ActivatedRoute,RouterModule} from '@angular/router';
/**
 * Dependência ({firstValueFrom}): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import {firstValueFrom} from 'rxjs';
/**
 * Dependência ({TrainingService,Training,trainingError}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService,Training,trainingError} from '../../services/training.service';
/**
 * Dependência ({TrainingNavComponent}): contratos e comportamento compartilhados de ./training-nav.component.
 */
import {TrainingNavComponent} from './training-nav.component';
/**
 * Dependência ({StepCaptureComponent}): contratos e comportamento compartilhados de ../guide-editor/step-capture.component.
 */
import {StepCaptureComponent} from '../guide-editor/step-capture.component';
/**
 * Dependência ({StepNarrationComponent}): contratos e comportamento compartilhados de ../guide-editor/step-narration.component.
 */
import {StepNarrationComponent} from '../guide-editor/step-narration.component';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,TrainingNavComponent,StepCaptureComponent,StepNarrationComponent],templateUrl:'./training-player.component.html',styleUrls:['./trainings.css']})
export class TrainingPlayerComponent implements OnInit,OnDestroy{
 id=0;training:Training|null=null;/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;/* boolean: bloqueia submissões repetidas enquanto a operação atual aguarda resposta. */ busy=false;error='';notice='';/* união de estados da tela: define a etapa de conteúdo, quiz, resultado ou avaliação apresentada. */ stage:'content'|'quiz'|'result'|'feedback'|'done'='content';state:any=null;feedback:any=null;question:any=null;selected:number|null=null;stars=0;comment='';stepIndex=0;elapsed=0;/* identificador do acompanhamento temporal; deve ser liberado no encerramento do componente. */ private timer:any;
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param service — TrainingService; serviço injetado para comunicação e estado da tela.
  * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
  * @param zone — NgZone; zona Angular usada para refletir callbacks externos na interface.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private service:TrainingService,private route:ActivatedRoute,private zone:NgZone){}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'));this.load();this.timer=setInterval(()=>{if(this.state?.result?.started_at&&!this.state.result.finished_at)this.elapsed=Math.max(0,Math.floor((Date.now()-Date.parse(this.state.result.started_at))/1000));},1000);}
 /**
  * Libera os recursos mantidos pelo componente ao sair da tela, conforme os timers, listeners e objetos registrados neste fluxo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnDestroy(){clearInterval(this.timer);}
 /**
  * Expõe a sequência de passos do conteúdo publicado do treinamento.
  * @returns expressão calculada/comparada no corpo.
  */
 get steps(){return this.training?.content?.steps||[];}
 /**
  * Resolve o passo selecionado na sequência de conteúdo apresentada ao participante.
  * @returns valor calculado no corpo.
  */
 get step(){return this.steps[this.stepIndex];}
 /**
  * Obtém a última tentativa conhecida no progresso carregado do participante.
  * @returns valor calculado no corpo.
  */
 get lastResult(){return this.training?.progress?.results?.slice(-1)[0];}
 /**
  * Obtém a avaliação já registrada para evitar uma nova apresentação do formulário.
  * @returns this.training?.progress?.feedback.
  */
 get completedFeedback(){return this.training?.progress?.feedback;}
 /**
  * Monta a mensagem final distinguindo avaliação com e sem comentário.
  * @returns valor calculado no corpo.
  */
 get confirmation(){return this.completedFeedback?.comment?'Obrigado! Você realizou, avaliou e comentou o treinamento '+this.training?.title+'.':'Obrigado! Você realizou e avaliou o treinamento '+this.training?.title+'.';}
 /**
  * Executa a etapa `load` do fluxo de training-player.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async load(){this.loading=true;this.error='';try{this.training=await firstValueFrom(this.service.get(this.id));if(this.training.progress.feedback)this.stage='done';else if(this.training.progress.quiz_completed)this.stage='result';else this.stage='content';if(this.route.snapshot.queryParamMap.get('guided')==='complete' && this.training.progress.started_at && !this.training.progress.quiz_completed && this.training.status==='published'){if(!this.training.progress.completed_at)await this.complete();else await this.startQuiz();}}catch(e){this.error=trainingError(e);}finally{this.loading=false;}}
 /**
  * Centraliza as ações do participante; impede reentrada, apresenta falhas e sempre libera o estado ocupado.
  * @param action — string; nome da operação reconhecida pelo endpoint de treinamento.
  * @param data — any; dados do contrato enviado ao serviço (padrão: {}).
  * @returns null; valor calculado no corpo.
  */
 async run(action:string,data:any={}){if(this.busy)return null;this.busy=true;this.error='';try{return await firstValueFrom(this.service.action(this.id,action,data));}catch(e){this.error=trainingError(e);setTimeout(()=>document.getElementById('training-error')?.focus(),0);return null;}finally{this.busy=false;}}
 /**
  * Executa a etapa `start` do fluxo de training-player.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async start(){const p=await this.run('start');if(p)this.training!.progress=p;}
 /**
  * Confirma a conclusão do conteúdo e solicita o início do quiz após a resposta válida.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async complete(){const p=await this.run('complete');if(p){this.training!.progress=p;await this.startQuiz();}}
 /**
  * Inicia ou retoma a tentativa e apresenta a pergunta ou resultado recebidos do servidor.
  * @returns void/undefined.
  */
 async startQuiz(){const state=await this.run('quiz-start');if(!state)return;this.state=state;this.question=state.question;this.feedback=null;this.selected=null;this.stage=state.result.finished_at?'result':'quiz';this.focus();}
 /**
  * Envia a alternativa selecionada uma única vez por apresentação e mostra o feedback confirmado pela API.
  * @returns void/undefined.
  */
 async answer(){if(this.selected===null||this.feedback)return;const state=await this.run('answer',{result_id:this.state.result.id,question_id:this.question.id,alternative_id:this.selected});if(state){this.state=state;this.feedback=state.feedback;this.focus('quiz-feedback');}}
 /**
  * Aplica a resposta assíncrona ao estado desta operação no contexto do componente.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 next(){if(this.state.result.finished_at){this.training!.progress.quiz_completed=true;this.training!.progress.results=[...(this.training!.progress.results||[]).filter((r:any)=>r.id!==this.state.result.id),this.state.result];this.training!.progress.attempts_used=this.state.result.attempt;this.training!.progress.can_retry=this.state.result.attempt<this.training!.max_attempts;this.stage='result';}else{this.question=this.state.question;this.selected=null;this.feedback=null;}this.focus();}
 /**
  * Abre a etapa de avaliação após o resultado do treinamento.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 evaluate(){this.stage='feedback';this.focus();}
 /**
  * Valida estrelas/comentário localmente e envia a avaliação; a confirmação vem da API.
  * @returns void/undefined.
  */
 async sendFeedback(){if(!this.stars||this.comment.length>500)return;const fb=await this.run('feedback',{stars:this.stars,comment:this.comment});if(fb){this.training!.progress.feedback=fb;this.stage='done';this.focus();}}
 /**
  * Volta à apresentação do conteúdo sem apagar quiz ou avaliação persistidos.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 review(){this.stage='content';this.stepIndex=0;}
 /**
  * Agenda foco no elemento da etapa para acompanhar a mudança de conteúdo pelo teclado/leitor de tela.
  * @param id — identificador do recurso ou elemento alvo (padrão: 'training-stage').
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 focus(id='training-stage'){setTimeout(()=>document.getElementById(id)?.focus(),0);}
 /**
  * Inicia a participação se necessário e solicita o Me guie à extensão conectada.
  * @returns void/undefined.
  */
 async playback(){if(!this.training?.progress.started_at){await this.start();if(!this.training?.progress.started_at)return;}const runtime=(window as any).chrome?.runtime,extension=localStorage.getItem('autoguide_extension_id');if(!runtime?.sendMessage||!extension){this.notice='Conecte a extensão em Minha conta para usar o Me guie. Você pode acompanhar o conteúdo abaixo.';return;}this.busy=true;this.error='';runtime.sendMessage(extension,{action:'START_PLAYBACK',title:this.training!.title,steps:this.steps,trainingId:this.id,completionUrl:location.origin+'/trainings/'+this.id+'?guided=complete'},(response:any)=>this.zone.run(()=>{this.busy=false;if(runtime.lastError||response?.error)this.error=response?.error||'Não foi possível abrir a extensão. Reconecte sua conta.';else this.notice='Tutorial aberto. Ao concluir, volte aqui para confirmar a conclusão e responder ao quiz.';}));}
}
