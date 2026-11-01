/** Administração de treinamento: rascunho, revisão de perguntas, publicação e participantes. A publicação versiona conteúdo no servidor. */
/**
 * Dependência ({Component,OnInit}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({FormsModule}): vínculo e validação dos formulários da interface.
 */
import {FormsModule} from '@angular/forms';
/**
 * Dependência ({ActivatedRoute,Router,RouterModule}): rotas, parâmetros e navegação entre as telas.
 */
import {ActivatedRoute,Router,RouterModule} from '@angular/router';
/**
 * Dependência ({firstValueFrom}): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import {firstValueFrom} from 'rxjs';
/**
 * Dependência ({TrainingService,Training,QuizQuestion,trainingError}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService,Training,QuizQuestion,trainingError} from '../../services/training.service';
/**
 * Dependência ({GuideService,Guide}): contratos e comportamento compartilhados de ../../services/guide.service.
 */
import {GuideService,Guide} from '../../services/guide.service';
/**
 * Dependência ({TrainingNavComponent}): contratos e comportamento compartilhados de ./training-nav.component.
 */
import {TrainingNavComponent} from './training-nav.component';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,TrainingNavComponent],templateUrl:'./training-admin.component.html',styleUrls:['./trainings.css']})
export class TrainingAdminComponent implements OnInit{
 id=0;view:'list'|'edit'='list';items:any[]=[];guides:Guide[]=[];training:Training|null=null;/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;/* boolean: bloqueia submissões repetidas enquanto a operação atual aguarda resposta. */ busy=false;error='';notice='';title='';description='';guideId:number|null=null;maxAttempts=1;questions:QuizQuestion[]=[];emails='';reviewApproved=false;inspection:any=null;start='';end='';rating='';minPercent='';
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param service — TrainingService; serviço injetado para comunicação e estado da tela.
  * @param guidesService — GuideService; contrato tipado na assinatura.
  * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
  * @param router — Router; roteador injetado para navegação.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private service:TrainingService,private guidesService:GuideService,private route:ActivatedRoute,private router:Router){}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'))||0;this.view=this.route.snapshot.data['editor']?'edit':'list';this.load();}
 /**
  * Compõe os valores de filtro enviados às consultas administrativas.
  * @returns objeto com start, end, rating, min_percent.
  */
 filters(){return {start:this.start,end:this.end,rating:this.rating,min_percent:this.minPercent};}
 /**
  * Cria a estrutura editável de cinco perguntas e quatro alternativas para o rascunho.
  * @returns resultado de Array.from(...).
  */
 emptyQuestions(){return Array.from({length:5},()=>({statement:'',explanation:'',alternatives:Array.from({length:4},(_,i)=>({text:'',correct:i===0}))}));}
 /**
  * Executa a etapa `load` do fluxo de training-admin.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async load(){this.loading=true;this.error='';try{if(this.view==='list')this.items=await firstValueFrom(this.service.adminList(this.filters()));else{const [guides,spaces]=await Promise.all([firstValueFrom(this.guidesService.getGuides()),firstValueFrom(this.guidesService.workspaces())]);this.guides=guides.filter(g=>g.can_edit!==false||spaces.some(w=>w.role==='owner'&&w.id===g.workspace&&g.status==='published'));if(this.id){this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.title=this.training.title;this.description=this.training.description;this.guideId=this.training.guide;this.maxAttempts=this.training.max_attempts;this.questions=this.training.draft_questions?.length?structuredClone(this.training.draft_questions):this.emptyQuestions();}else{this.questions=this.emptyQuestions();const source=Number(this.route.snapshot.queryParamMap.get('guide'));const g=this.guides.find(g=>g.id===source);if(g){this.guideId=g.id;this.title=g.title;this.description=g.description;}}}}catch(e){this.error=trainingError(e);}finally{this.loading=false;}if(this.id && this.route.snapshot.queryParamMap.get('suggest')==='1' && !this.training?.draft_questions?.length && !this.error)await this.suggest();}
 /**
  * Marca uma alternativa como correta e desmarca as demais na mesma pergunta do rascunho.
  * @param question — QuizQuestion; contrato tipado na assinatura.
  * @param index — number; contrato tipado na assinatura.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 chooseCorrect(question:QuizQuestion,index:number){question.alternatives.forEach((a,i)=>a.correct=i===index);this.reviewApproved=false;}
 /**
  * Executa a etapa `save` do fluxo de training-admin.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined.
  */
 async save(){if(this.busy)return;this.busy=true;this.error='';this.notice='';try{const hasQuestions=this.questions.some(q=>q.statement.trim()||q.alternatives.some(a=>a.text.trim()));const data={guide:this.guideId,title:this.title,description:this.description,max_attempts:this.maxAttempts,draft_questions:hasQuestions?this.questions:[]};this.training=await firstValueFrom(this.id?this.service.update(this.id,data):this.service.create(data));if(!this.id){this.router.navigate(['/training-admin',this.training.id],{queryParams:hasQuestions?{}:{suggest:1}});return;}this.notice='Rascunho salvo. Publique uma nova versão para disponibilizar as alterações.';}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Solicita a publicação do conteúdo revisado; o servidor valida e cria a versão do treinamento.
  * @returns void/undefined.
  */
 async publish(){if(this.busy||!this.id||!this.reviewApproved)return;await this.save();if(this.error)return;this.busy=true;try{this.training=await firstValueFrom(this.service.manage(this.id,'publish',{review_approved:true}));this.notice='Treinamento publicado. As tentativas iniciadas anteriormente mantêm a versão original.';}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Solicita sugestões de perguntas à API para posterior revisão antes da publicação.
  * @returns void/undefined.
  */
 async suggest(){if(this.busy||!this.id)return;if(this.questions.some(q=>q.statement.trim())&&!confirm('Substituir as perguntas do formulário pelas sugestões? O histórico publicado será preservado.'))return;this.busy=true;this.error='';try{await firstValueFrom(this.service.update(this.id,{title:this.title,description:this.description,max_attempts:this.maxAttempts}));const response=await firstValueFrom(this.service.manage(this.id,'suggestions'));this.questions=response.questions;this.reviewApproved=false;this.notice='Sugestões geradas. Revise as cinco perguntas e a resposta correta antes de publicar.';}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Envia os participantes selecionados à operação administrativa de atribuição.
  * @returns void/undefined.
  */
 async assign(){if(this.busy)return;const emails=this.emails.split(/[,;\s]+/).filter(Boolean);if(!emails.length)return;this.busy=true;this.error='';try{const data=await firstValueFrom(this.service.manage(this.id,'assign',{emails}));this.emails='';this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.notice=data.assigned+' participantes vinculados. Atribuições repetidas não são duplicadas.';}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Solicita o arquivamento do treinamento sem excluir o histórico de participação.
  * @returns void/undefined.
  */
 async archive(){if(this.busy||!confirm('Arquivar este treinamento? O histórico será preservado e novas atividades serão bloqueadas.'))return;this.busy=true;try{await firstValueFrom(this.service.manage(this.id,'archive'));await this.load();this.notice='Treinamento arquivado.';}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Consulta detalhes de respostas e avaliação do participante no escopo administrativo.
  * @param user — number; identificação da conta conforme o tipo declarado.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async inspect(user:number){this.busy=true;this.error='';try{this.inspection=await firstValueFrom(this.service.inspect(this.id,user));setTimeout(()=>document.getElementById('participant-details')?.focus(),0);}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
 /**
  * Recarrega os indicadores com os filtros selecionados na interface.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 async applyFilters(){this.busy=true;this.error='';try{if(this.view==='list')this.items=await firstValueFrom(this.service.adminList(this.filters()));else this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));}catch(e){this.error=trainingError(e);}finally{this.busy=false;}}
}
