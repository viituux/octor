import {TrainingPeriodComponent,lastThirtyDays} from './training-period.component';
import { OctorLoadingComponent } from '../shared/octor-loading.component';
import {DialogService} from '../../services/dialog.service';
/** Gestão do conteúdo, quiz versionado, participantes e resultados autorizados pela API. */
import {Component,OnInit,OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService,Training,QuizDraft,InstitutionalProfile,trainingError} from '../../services/training.service';
import {GuideService,Guide} from '../../services/guide.service';
import {TrainingNavComponent} from './training-nav.component';
import {StepCaptureComponent} from '../guide-editor/step-capture.component';
import {StepNarrationComponent} from '../guide-editor/step-narration.component';

@Component({standalone:true,imports:[TrainingPeriodComponent,OctorLoadingComponent,CommonModule,FormsModule,RouterModule,TrainingNavComponent,StepCaptureComponent,StepNarrationComponent],
  templateUrl:'./training-admin.component.html',styleUrls:['./trainings.css','./training-filters.css']})
export class TrainingAdminComponent implements OnInit,OnDestroy {
  id=0;view:'list'|'edit'='list';items:any[]=[];guides:Guide[]=[];training:Training|null=null;
  loading=true;busy=false;error='';notice='';title='';description='';guideId:number|null=null;
  emails='';inspection:any=null;private initialPeriod=lastThirtyDays();start=this.initialPeriod.start;end=this.initialPeriod.end;rating='';
  rankVersion='';quizReviewed=false;
  suggestingQuiz = false;
  quizSuggestionError = '';
  quizSuggestionNotice = '';
  documentProfile: InstitutionalProfile = {};
  releaseNotes='';historicalVersion:any=null;private archiveUrls:string[]=[];private destroyed=false;
  ngOnDestroy(){this.destroyed=true;this.archiveUrls.forEach(url=>URL.revokeObjectURL(url));}
  async viewVersion(number:number){
    if(this.busy)return;this.busy=true;this.error='';
    try{const version=await firstValueFrom(this.service.versionDetail(this.id,number));const prepared=await this.service.hydrateContent(version.content);
      if(this.destroyed){prepared.urls.forEach(url=>URL.revokeObjectURL(url));return;}
      this.archiveUrls.forEach(url=>URL.revokeObjectURL(url));this.archiveUrls=prepared.urls;this.historicalVersion={...version,content:prepared.content};if(prepared.warnings.length)this.notice=prepared.warnings[0];
      setTimeout(()=>document.getElementById('version-preview')?.focus(),0);
    }catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  downloadEvidence(){
    if(!this.inspection)return;const url=URL.createObjectURL(new Blob([JSON.stringify({exported_at:new Date().toISOString(),training_id:this.id,record:this.inspection},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='octor-treinamento-'+this.id+'-participante-'+this.inspection.user.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  questions:QuizDraft[]=Array.from({length:5},()=>({statement:'',explanation:'',alternatives:Array.from({length:4},()=>({text:'',correct:false}))}));
  markCorrect(question:QuizDraft,index:number){question.alternatives.forEach((a,i)=>a.correct=i===index);this.quizReviewed=false;}
  get validQuiz(){return this.questions.length===5&&this.questions.every(q=>q.statement.trim()&&q.alternatives.length===4&&q.alternatives.every(a=>a.text.trim())&&q.alternatives.filter(a=>a.correct).length===1&&new Set(q.alternatives.map(a=>a.text.trim().toLowerCase())).size===4);}
  constructor(private service:TrainingService,private guidesService:GuideService,private route:ActivatedRoute,private router:Router,private dialogs:DialogService){}
  ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'))||0;this.view=this.route.snapshot.data['editor']?'edit':'list';this.load();}
  filters(){return {start:this.start,end:this.end,rating:this.rating,version:this.rankVersion};}
  /** Carrega apenas guias elegíveis e os dados administrativos autorizados pela API. */
  async load(){
    this.loading=true;this.error='';
    try {
      if(this.view==='list')this.items=await firstValueFrom(this.service.adminList(this.filters()));
      else {
        const [guides,spaces]=await Promise.all([firstValueFrom(this.guidesService.getGuides()),firstValueFrom(this.guidesService.workspaces())]);
        this.guides=guides.filter(g=>g.can_edit!==false||spaces.some(w=>w.role==='owner'&&w.id===g.workspace&&g.status==='published'));
        if(this.id){
          this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));
          this.title=this.training.title;this.description=this.training.description;this.guideId=this.training.guide;
          this.documentProfile = {...this.training.document_profile};
          if(this.training.draft_questions?.length===5)this.questions=this.training.draft_questions;
        }else{
          const source=Number(this.route.snapshot.queryParamMap.get('guide')),guide=this.guides.find(g=>g.id===source);
          if(guide){this.guideId=guide.id;this.title=guide.title;this.description=guide.description;}
        }
      }
    }catch(e){this.error=trainingError(e);}finally{this.loading=false;}
  }
  /** Substitui o rascunho local somente depois de receber sugestões válidas. */
  async generateQuizSuggestions() {
    if (this.busy || !this.guideId || !this.title.trim()) return;
    const hasDraft = this.questions.some(q =>
      q.statement.trim() || q.explanation.trim() || q.alternatives.some(a => a.text.trim() || a.correct)
    );
    if (hasDraft && !await this.dialogs.confirm(
      'Substituir as perguntas do editor por sugestões da IA? A troca acontece se a geração for concluída.',
      {title:'Gerar perguntas com IA',confirmText:'Gerar sugestões'}
    )) return;
    if (this.destroyed || this.busy || !this.guideId || !this.title.trim()) return;

    this.busy = this.suggestingQuiz = true;
    this.quizSuggestionError = this.quizSuggestionNotice = '';
    try {
      const {questions} = await firstValueFrom(this.service.suggestQuiz({
        guide:this.guideId, title:this.title.trim(), description:this.description
      }));
      if (this.destroyed) return;
      this.questions = questions;
      this.quizReviewed = false;
      this.quizSuggestionNotice = 'Cinco sugestões preenchidas. Revise os enunciados e o gabarito antes de publicar.';
    } catch (error) {
      const detail = (error as {error?: {detail?: unknown}})?.error?.detail;
      this.quizSuggestionError = typeof detail === 'string' ? detail : trainingError(error);
    } finally {
      this.busy = this.suggestingQuiz = false;
    }
  }

  /** Salva os dados do procedimento; erro mantém o rascunho e impede a publicação seguinte. */
  async save(){
    if(this.busy)return;this.busy=true;this.error='';this.notice='';
    try{
      const data={guide:this.guideId,title:this.title,description:this.description,draft_questions:this.questions,document_profile:this.documentProfile};
      this.training=await firstValueFrom(this.id?this.service.update(this.id,data):this.service.create(data));
      if(!this.id){await this.router.navigate(['/training-admin',this.training.id]);return;}
      this.notice='Rascunho salvo. Publique uma nova versão para disponibilizar as alterações.';
    }catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Publica um snapshot somente depois de persistir o rascunho com sucesso. */
  async publish(){
    if(this.busy||!this.id||!this.validQuiz||!this.quizReviewed)return;await this.save();if(this.error)return;this.busy=true;
    try{await firstValueFrom(this.service.manage(this.id,'publish',{quiz_reviewed:true,release_notes:this.releaseNotes}));this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.quizReviewed=false;this.releaseNotes='';this.notice='Treinamento e quiz publicados. Participantes que já iniciaram mantêm sua versão original.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Associa contas existentes; a API valida todos os participantes antes da gravação. */
  async assign(){
    if(this.busy)return;const emails=this.emails.split(/[,;\s]+/).filter(Boolean);if(!emails.length)return;
    this.busy=true;this.error='';
    try{const data=await firstValueFrom(this.service.manage(this.id,'assign',{emails}));this.emails='';this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.notice=data.assigned+' participantes vinculados. Atribuições repetidas não são duplicadas.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Arquivamento preserva o histórico e bloqueia novas atividades. */
  async archive(){
    if(this.busy||!(await this.dialogs.confirm('Arquivar este treinamento? O histórico será preservado e novas atividades serão bloqueadas.',{title:'Arquivar treinamento',confirmText:'Arquivar treinamento',danger:true})))return;
    this.busy=true;
    try{await firstValueFrom(this.service.manage(this.id,'archive'));await this.load();this.notice='Treinamento arquivado.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Consulta datas e feedback do participante selecionado e direciona o foco aos detalhes. */
  async inspect(user:number){
    this.busy=true;this.error='';
    try{this.inspection=await firstValueFrom(this.service.inspect(this.id,user));setTimeout(()=>document.getElementById('participant-details')?.focus(),0);}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  private filterVersion=0;
  async applyFilters(){
    const version=++this.filterVersion;
    this.error='';
    const list=this.view==='list';
    const filters=this.filters();
    try {
      if(list) {
        const items=await firstValueFrom(this.service.adminList(filters));
        if(version===this.filterVersion) this.items=items;
      } else {
        const training=await firstValueFrom(this.service.adminGet(this.id,filters));
        if(version===this.filterVersion) this.training=training;
      }
    } catch(e) {
      if(version===this.filterVersion) this.error=trainingError(e);
    }
  }
  /** Liberação explícita, registrada por participante; não apaga o histórico. */
  async allowRetry(user:number){
    if(this.busy||!(await this.dialogs.confirm('Liberar outra tentativa? Ao iniciá-la, a tentativa anterior sairá do ranking. O histórico será preservado.',{title:'Nova tentativa',confirmText:'Liberar tentativa'})))return;
    this.busy=true;this.error='';
    try{await firstValueFrom(this.service.manage(this.id,'allow-retry',{user_id:user}));this.notice='Nova tentativa liberada.';this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.inspection=null;}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
}
