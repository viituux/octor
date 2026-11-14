import {TrainingPeriodComponent,lastThirtyDays} from './training-period.component';
/** Indicadores administrativos: a API fornece agregados; a tela aplica filtros e apresenta ranking/gráficos com apoio textual. */
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
 * Dependência ({RouterModule}): rotas, parâmetros e navegação entre as telas.
 */
import {RouterModule} from '@angular/router';
/**
 * Dependência ({firstValueFrom}): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import {firstValueFrom} from 'rxjs';
/**
 * Dependência ({TrainingService,trainingError}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService,trainingError} from '../../services/training.service';
/**
 * Dependência ({TrainingNavComponent}): contratos e comportamento compartilhados de ./training-nav.component.
 */
import {TrainingNavComponent} from './training-nav.component';
@Component({standalone:true,imports:[TrainingPeriodComponent,CommonModule,FormsModule,RouterModule,TrainingNavComponent],templateUrl:'./training-dashboard.component.html',styleUrls:['./trainings.css','./training-filters.css']})
export class TrainingDashboardComponent implements OnInit{
 data:any=null;trainings:any[]=[];/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;error='';training='';private initialPeriod=lastThirtyDays();start=this.initialPeriod.start;end=this.initialPeriod.end;rating='';
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param service — TrainingService; serviço injetado para comunicação e estado da tela.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private service:TrainingService){}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnInit(){this.service.adminList().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param items — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ items=>this.trainings=items,error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{}});this.load();}
 /**
  * Executa a etapa `load` do fluxo de training-dashboard.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 private requestVersion=0;
 formatMonth(value:string) {
  const [year, month] = value.split('-');
  return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(month)-1]+'/'+year;
 }
 async load(){const version=++this.requestVersion;this.loading=true;this.error='';try{const data=await firstValueFrom(this.service.dashboard({training:this.training,start:this.start,end:this.end,rating:this.rating}));if(version===this.requestVersion)this.data=data;}catch(e){if(version===this.requestVersion){this.error=trainingError(e);this.data=null;}}finally{if(version===this.requestVersion)this.loading=false;}}
 /**
  * Converte os valores mensais em coordenadas usadas pelo gráfico da interface.
  * @returns resultado de items.map((r:any,i:number)=>(30+(items.length===1?260:i*520/(items.length-1)))+','+(170-r.completions/max*140)(...).
  */
 get points(){const items=this.data?.timeline||[],max=Math.max(1,...items.map((r:any)=>r.completions));return items.map((r:any,i:number)=>(30+(items.length===1?260:i*520/(items.length-1)))+','+(170-r.completions/max*140)).join(' ');}
 /**
  * Produz a descrição textual dos indicadores para complementar o gráfico visual.
  * @returns resultado de (this.data?.timeline||[]).map((r:any)=>this.formatMonth(r.month)+': '+r.completions+' conclusões').join(...).
  */
 get chartSummary(){return (this.data?.timeline||[]).map((r:any)=>this.formatMonth(r.month)+': '+r.completions+' conclusões').join('; ');}
}
