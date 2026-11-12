/** Participante: conteúdo → quiz → avaliação; versões antigas preservam o fluxo original. */
import {Component, OnInit, OnDestroy, NgZone} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService, Training, trainingError} from '../../services/training.service';
import {AuthService} from '../../services/auth.service';
import {TrainingConsentComponent} from '../shared/training-consent.component';
import {TrainingNavComponent} from './training-nav.component';
import {StepCaptureComponent} from '../guide-editor/step-capture.component';
import {StepNarrationComponent} from '../guide-editor/step-narration.component';

@Component({standalone:true, imports:[CommonModule, FormsModule, RouterModule, TrainingNavComponent,
  StepCaptureComponent, StepNarrationComponent, TrainingConsentComponent], templateUrl:'./training-player.component.html', styleUrls:['./trainings.css']})
export class TrainingPlayerComponent implements OnInit,OnDestroy {
 get isReferenceManual():boolean{return this.steps.some((step:any)=>step.action_type==='reference');}

  id=0; training:Training|null=null; loading=true; busy=false; error=''; notice='';
  /** Etapas dependem da versão e do progresso confirmado pelo servidor. */
  stage:'content'|'quiz'|'result'|'feedback'|'done'='content';
  quiz:any=null;selected:number|null=null;clock=Date.now();serverOffset=0;
  private timer:ReturnType<typeof setInterval>|null=null;
  private archiveUrls:string[]=[];
  private archivedSteps: any[] = [];
  private destroyed=false;
  rankingLoading = false;
  rankingError = false;
  private readonly scoreReactions = [
    {image: 'confuso.png', message: 'Revise os passos e confira o gabarito.'},
    {image: 'energia_baixa.png', message: 'Primeiro acerto! Confira onde ficou em dúvida.'},
    {image: 'regular.png', message: 'Você já acertou duas perguntas. Confira as respostas abaixo.'},
    {image: 'surpreso.png', message: 'Você acertou a maioria! Confira as respostas abaixo.'},
    {image: 'feliz_estrelas.png', message: 'Quase gabaritou! Faltou só uma resposta.'},
    {image: 'empolgado.png', message: 'Gabaritou! Você acertou todas as perguntas.'},
  ];

  get scoreReaction() {
    return this.scoreReactions[this.quizResult?.correct_count];
  }

  get ownRankingPosition(): number | null {
    const userId = this.auth?.currentUser()?.id;
    if (userId == null) return null;
    return this.training?.ranking?.find(row => row.user_id === userId)?.position ?? null;
  }

  readonly rankingImages = ['01_primeiro.png', '02_segundo.png', '03_terceiro.png', '04_quarto.png', '05_quinto.png', '06_sexto.png', '07_setimo.png', '08_oitavo.png', '09_nono.png', '10_decimo.png'];

  readonly podiumAwards = [
    {position: 1, image: this.rankingImages[0], medal: 'Ouro'},
    {position: 2, image: this.rankingImages[1], medal: 'Prata'},
    {position: 3, image: this.rankingImages[2], medal: 'Bronze'},
  ];
  get podium() {
    const ranking = this.training?.ranking ?? [];
    return this.podiumAwards.map(award => ({
      ...award,
      participants: ranking.filter(row => row.position === award.position),
    }));
  }

  get needsQuiz(){return !!this.training?.progress?.requires_quiz;}
  get quizResult(){return this.quiz?.result||this.training?.progress?.quiz;}
  get quizFinished(){return !!this.quizResult?.finished_at;}
  get retryAvailable(){return !!this.quizResult?.finished_at && (this.quiz?.attempt_limit||this.training?.progress?.attempt_limit||1)>this.quizResult.attempt;}
  get elapsed(){return this.quizResult?.started_at?Math.max(0,Math.floor((this.clock+this.serverOffset-Date.parse(this.quizResult.started_at))/1000)):0;}
  duration(seconds:number){return Math.floor(seconds/60)+'min '+seconds%60+'s';}
  ngOnDestroy(){this.destroyed=true;if(this.timer)clearInterval(this.timer);this.archiveUrls.forEach(url=>URL.revokeObjectURL(url));}
  consentVersion = '';
  stars=0; comment=''; stepIndex=0;

  constructor(private service:TrainingService, private route:ActivatedRoute, private zone:NgZone, private auth:AuthService) {}

  /** Obtém o identificador da rota e carrega o progresso do participante. */
  ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'));this.timer=setInterval(()=>this.clock=Date.now(),1000);this.load();}
  get steps(){return this.training?.content?.steps||[];}
  get step(){return this.steps[this.stepIndex];}
  private get progressKey(): string | null {
    const user = this.auth?.currentUser()?.id;
    const startedAt = this.training?.progress?.started_at;
    return user != null && startedAt ? `octor:training-step:${user}:${this.id}:${startedAt}` : null;
  }

  changeStep(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.steps.length) return;
    this.stepIndex = index;
    const key = this.progressKey;
    if (key) {
      try { localStorage.setItem(key, String(index)); } catch { /* A leitura funciona sem armazenamento local. */ }
    }
  }
  get referencePageUrl(): string | null {
    const step = this.step;
    if (step?.action_type !== 'reference' || !step.url) return null;
    try {
      const url = new URL(step.url);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
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
      this.archivedSteps = this.training.content?.steps ?? [];
      if(this.service.hydrateContent){const archive=await this.service.hydrateContent(this.training.content);if(this.destroyed){archive.urls.forEach(url=>URL.revokeObjectURL(url));return;}this.archiveUrls.forEach(url=>URL.revokeObjectURL(url));this.archiveUrls=archive.urls;this.training.content=archive.content;if(archive.warnings.length)this.notice=archive.warnings[0];}
      this.evaluate(false);
      if(this.needsQuiz && this.quizResult && !this.quizFinished){const state=await firstValueFrom(this.service.action(this.id,'quiz-state'));this.applyQuiz(state);}
      const reference = this.route.snapshot.queryParamMap.get('referenceStep');
      if (this.training.progress?.started_at && reference && /^[1-9]\d*$/.test(reference)
          && Number(reference) <= this.steps.length) {
        this.stepIndex = Number(reference) - 1;
        this.stage = 'content';
      } else {
        const key = this.progressKey;
        try {
          const index = key ? Number(localStorage.getItem(key)) : 0;
          if (Number.isInteger(index) && index >= 0 && index < this.steps.length) this.stepIndex = index;
        } catch { /* A leitura funciona sem armazenamento local. */ }
      }
      if(this.route.snapshot.queryParamMap.get('guided')==='complete' && this.training.progress.started_at
          && !this.training.progress.content_completed_at && !this.training.progress.completed_at && this.training.status==='published')await this.complete();
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
  async start(){const progress=await this.run('start', this.consentVersion ? {consent_version: this.consentVersion} : {});if(progress)this.training!.progress=progress;}
  /** O fim do conteúdo libera o quiz nas versões novas e preserva o fluxo legado. */
  async complete(){const progress=await this.run('complete');if(progress){this.training!.progress=progress;this.evaluate();}}
  evaluate(focus=true){
    this.stage=this.completedFeedback?'done':this.needsQuiz
      ? (!(this.training?.progress?.content_completed_at||this.training?.progress?.completed_at)?'content':this.quizFinished&&!this.retryAvailable?'result':'quiz')
      :this.training?.progress?.completed_at?'feedback':'content';
    if(focus)this.focus();
  }
  /** Retoma o relógio informado pelo servidor; fechar a aba não pausa a tentativa. */
  applyQuiz(state:any){
    this.quiz=state;this.selected=null;
    const now=state.server_now||state.result?.server_now;
    if(now)this.serverOffset=Date.parse(now)-Date.now();
    this.training!.progress.quiz=state.result;
    this.training!.progress.attempt_limit=state.attempt_limit;
    this.stage=state.result?.finished_at&&!this.retryAvailable?'result':'quiz';this.focus();
  }
  async startQuiz(){const state=await this.run('quiz-start');if(state)this.applyQuiz(state);}
  async answer(){
    if(this.selected===null||!this.quiz?.question)return;
    const state=await this.run('answer',{result_id:this.quiz.result.id,question_id:this.quiz.question.id,alternative_id:this.selected});
    if (!state) return;
    this.applyQuiz(state);
    if (state.result?.finished_at) await this.refreshRanking();
  }
  async refreshRanking() {
    if (this.rankingLoading || !this.training) return;
    this.rankingLoading = true;
    this.rankingError = false;
    try {
      const fresh = await firstValueFrom(this.service.get(this.id));
      if (this.destroyed) return;
      this.training.ranking = fresh.ranking;
      this.training.ranking_version = fresh.ranking_version;
    } catch {
      this.rankingError = true;
    } finally {
      this.rankingLoading = false;
    }
  }
  feedbackStage(){this.stage=this.completedFeedback?'done':'feedback';this.focus();}
  /** Valida limites locais e mantém o formulário disponível para nova tentativa em caso de erro. */
  async sendFeedback(){
    if(!this.stars||this.comment.length>500)return;
    const feedback=await this.run('feedback',{stars:this.stars,comment:this.comment});
    if(feedback){this.training!.progress.feedback=feedback;this.stage='done';this.focus();
      try{const fresh=await firstValueFrom(this.service.get(this.id));this.training={...fresh,content:this.training!.content};}catch{this.notice='Avaliação salva. Atualize a página para consultar o ranking atualizado.';}}
  }
  review(){this.stage='content';this.stepIndex=0;this.focus();}
  focus(id='training-stage'){setTimeout(()=>document.getElementById(id)?.focus(),0);}
  /** Solicita orientação no site real; falhas de extensão não concluem o conteúdo. */
  async playback(){if(this.isReferenceManual){this.notice='Este manual é um conteúdo de referência das telas observadas.';return;}
    if(!this.training?.progress.started_at){await this.start();if(!this.training?.progress.started_at)return;}
    const runtime=(window as any).chrome?.runtime,extension=localStorage.getItem('autoguide_extension_id');
    if(!runtime?.sendMessage||!extension){this.notice='Conecte a extensão em Minha conta para usar o Me guie. Você pode acompanhar o conteúdo abaixo.';return;}
    this.busy=true;this.error='';
    const steps = this.steps.map((step: any, index: number) => ({
      url: step.url, selector: step.selector, text: step.text, element_text: step.element_text,
      target: step.target || step.annotations?.find((item: any) => item.type === 'capture_metadata')?.target,
      narration: this.archivedSteps[index]?.narration_url
        ? {path: this.archivedSteps[index].narration_url}
        : {path: this.archivedSteps[index]?.live_narration_url,
           range: step.annotations?.find((item: any) => item.type === 'live_narration') ?? {}},
    }));
    runtime.sendMessage(extension,{action:'START_PLAYBACK',title:this.training!.title,steps,
      trainingId:this.id,completionUrl:location.origin+'/trainings/'+this.id+'?guided=complete'},
      (response:any)=>this.zone.run(()=>{this.busy=false;
        if(runtime.lastError||response?.error)this.error=response?.error||'Não foi possível abrir a extensão. Reconecte sua conta.';
        else this.notice='Tutorial aberto. Ao concluir, volte aqui para continuar o treinamento.';
      }));
  }
}
