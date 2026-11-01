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
import {Observable} from 'rxjs';
export interface Training{id:number;guide:number;title:string;description:string;status:string;version:number|null;progress?:any;content?:any;summary?:any;participants?:any[]}
/**
 * Normaliza os erros de treinamento para apresentação textual na interface.
 * @param e — any; evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
 * @returns string.
 */
export function trainingError(e:any):string{const flatten=/* Transforma mensagens de validação aninhadas em uma sequência textual para apresentação. | @param x — any; contrato tipado na assinatura. | @returns string. */ (x:any):string=>typeof x==='string'?x:Array.isArray(x)?x.map(flatten).join(' '):x&&typeof x==='object'?Object.entries(x).map(([k,v])=>k+': '+flatten(v)).join(' '):'';return flatten(e?.error)||'Não foi possível concluir a operação. Tente novamente.';}
@Injectable({providedIn:'root'})
export class TrainingService{
 private base='http://localhost:8000/api/trainings/';
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
 mine(){return this.http.get<Training[]>(this.base);}
 /**
  * Encaminha a operação `get` à API por this.http.get; a autorização e validação final são do servidor.
  * @param id — number; identificador do recurso ou elemento alvo.
  * @returns resultado de this.http.get(...).
  * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
  */
 get(id:number){return this.http.get<Training>(this.base+id+'/');}
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
 private params(filters:any){let params=new HttpParams();for(const [key,value] of Object.entries(filters))if(value!==''&&value!==null&&value!==undefined)params=params.set(key,String(value));return params;}
}
