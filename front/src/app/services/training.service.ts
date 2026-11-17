import { API_BASE } from '../api-config';
/** Cliente HTTP dos treinamentos: separa consultas do participante, gestão e indicadores; filtros são serializados para a API sem alterar os indicadores retornados pelo servidor. */
/**
 * Dependência ({Injectable}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Injectable} from '@angular/core';
/**
 * Dependência ({HttpClient,HttpParams}): requisições HTTP tipadas e interceptação do acesso à API.
 */
import {HttpClient,HttpParams} from '@angular/common/http';
/**
 * Dependência ({Observable}): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import {Observable,firstValueFrom} from 'rxjs';
export interface QuizDraft {statement:string;explanation:string;alternatives:{text:string;correct:boolean}[]}
export type TrainingListItem = (Training & {step_count?: number; reference_only?: boolean}) | {
  id: number;
  title: string;
  status: string;
  test_authorized?: boolean;
  awaiting_test_authorization?: boolean;
  description?: never;
  progress?: never;
  step_count?: never;
  reference_only?: never;
};
export interface InstitutionalProfile {
  objective?: string;
  audience?: string;
  prerequisites?: string;
  duration_minutes?: number | null;
  final_check?: string;
}
export interface Training{test_authorized?:boolean;awaiting_test_authorization?:boolean;id:number;document_profile?:InstitutionalProfile;guide:number;title:string;description:string;status:string;version:number|null;version_info?:any;version_history?:any[];progress?:any;content?:any;summary?:any;participants?:any[];draft_questions?:QuizDraft[];ranking?:any[];ranking_version?:number|null;versions?:number[]}
/**
 * Normaliza os erros de treinamento para apresentação textual na interface.
 * @param e — any; evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
 * @returns string.
 */
export function trainingError(e:any):string{const flatten=/* Transforma mensagens de validação aninhadas em uma sequência textual para apresentação. | @param x — any; contrato tipado na assinatura. | @returns string. */ (x:any):string=>typeof x==='string'?x:Array.isArray(x)?x.map(flatten).join(' '):x&&typeof x==='object'?Object.entries(x).map(([k,v])=>k+': '+flatten(v)).join(' '):'';return flatten(e?.error)||'Não foi possível concluir a operação. Tente novamente.';}
@Injectable({providedIn:'root'})
export class TrainingService{
 private base=API_BASE + '/trainings/';
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param http — HttpClient; cliente HTTP injetado pelo Angular.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private http:HttpClient){}
 /**
  * Encaminha a operação `capabilities` à API por this.http.get; a autorização e validação final são do servidor.
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 capabilities(){return this.http.get<{can_manage:boolean}>(this.base+'capabilities/');}
 /**
  * Encaminha a operação `mine` à API por this.http.get; a autorização e validação final são do servidor.
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 mine(){return this.http.get<TrainingListItem[]>(this.base);}
 /**
  * Encaminha a operação `get` à API por this.http.get; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 get(id:number){return this.http.get<Training>(this.base+id+'/');}
 /** Arquivos privados só são requisitados na origem conhecida da API; URLs blob não persistem no banco. */
 async hydrateContent(content:any, fields = ['screenshot_url','narration_url','live_narration_url']):Promise<{content:any;urls:string[];warnings:string[]}>{
   const copy=JSON.parse(JSON.stringify(content||{})),urls:string[]=[],warnings:string[]=[],cache=new Map<string,string>();
   for(const step of copy.steps||[])for(const field of fields){
     const path=step[field];
     if(typeof path!=='string'||!/^\/api\/trainings\/\d+\/versions\/\d+\/(?:assets\/[a-f0-9-]+|legacy-media\/\d+\/(?:screenshot_url|narration_url|live_narration_url))\/$/.test(path))continue;
     try{if(!cache.has(path)){const blob=await firstValueFrom(this.http.get(new URL(this.base).origin+path,{responseType:'blob'}));const url=URL.createObjectURL(blob);urls.push(url);cache.set(path,url);}step[field]=cache.get(path);}
     catch{step[field]=null;warnings.push('Um arquivo arquivado está indisponível. Contate o responsável pelo armazenamento.');}
   }
   return {content:copy,urls,warnings};
 }
 versionDetail(id:number,number:number){return this.http.get<any>(this.base+'admin/'+id+'/versions/'+number+'/');}
 /**
  * Encaminha a operação `action` à API por this.http.post; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @param action — string; nome da operação reconhecida pelo endpoint de treinamento.
  * @param data — any; dados do contrato enviado ao serviço (padrão: {}).
  * @returns resultado de this.http.post(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 action(id:number,action:string,data:any={}){return this.http.post<any>(this.base+id+'/'+action+'/',data);}
 /**
  * Encaminha a operação `adminList` à API por this.http.get; a autorização e validação final são do servidor.
  * @param filters — any; filtros opcionais da consulta (padrão: {}).
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 adminList(filters:any={}){return this.http.get<any[]>(this.base+'admin/',{params:this.params(filters)});}
 /**
  * Encaminha a operação `adminGet` à API por this.http.get; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @param filters — any; filtros opcionais da consulta (padrão: {}).
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 adminGet(id:number,filters:any={}){return this.http.get<Training>(this.base+'admin/'+id+'/',{params:this.params(filters)});}
 /**
  * Encaminha a operação `create` à API por this.http.post; a autorização e validação final são do servidor.
  * @param data — any; dados do contrato enviado ao serviço.
  * @returns resultado de this.http.post(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 create(data:any){return this.http.post<Training>(this.base+'admin/',data);}

 /** Solicita sugestões para revisar no editor antes de salvar o rascunho. */
 suggestQuiz(data:{guide:number;title:string;description:string}){
   return this.http.post<{questions:QuizDraft[]}>(this.base+'admin/quiz-suggestions/',data);
 }
 /**
  * Encaminha a operação `update` à API por this.http.patch; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @param data — any; dados do contrato enviado ao serviço.
  * @returns resultado de this.http.patch(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 update(id:number,data:any){return this.http.patch<Training>(this.base+'admin/'+id+'/',data);}
 /**
  * Encaminha a operação `manage` à API por this.http.post; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @param action — string; nome da operação reconhecida pelo endpoint de treinamento.
  * @param data — any; dados do contrato enviado ao serviço (padrão: {}).
  * @returns resultado de this.http.post(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 manage(id:number,action:string,data:any={}){return this.http.post<any>(this.base+'admin/'+id+'/'+action+'/',data);}
 /**
  * Consulta detalhes de respostas e avaliação do participante no escopo administrativo.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @param user — number; identificação da conta conforme o tipo declarado.
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 inspect(id:number,user:number){return this.http.get<any>(this.base+'admin/'+id+'/participants/'+user+'/');}
 /**
  * Encaminha a operação `dashboard` à API por this.http.get; a autorização e validação final são do servidor.
  * @param filters — any; filtros opcionais da consulta (padrão: {}).
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 dashboard(filters:any={}){return this.http.get<any>(this.base+'admin/dashboard/',{params:this.params(filters)});}
 /**
  * Converte filtros preenchidos em parâmetros de consulta HTTP.
  * @param filters — any; filtros opcionais da consulta.
  * @returns params.
  */
 actionAccess(id:number){return this.http.get<{test_authorized:boolean}>(this.base+id+'/access/');}
 private params(filters:any){let params=new HttpParams();for(const [key,value] of Object.entries(filters))if(value!==''&&value!==null&&value!==undefined)params=params.set(key,String(value));return params;}
}
