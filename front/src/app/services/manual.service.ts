import { API_BASE } from '../api-config';
/** APIs autenticadas de coleta e revisão; as imagens brutas são carregadas como blobs privados. */
import {Injectable,NgZone} from '@angular/core';
import {HttpClient} from '@angular/common/http';
export interface ManualStep {text:string;capture_id:number;control_index?:number|null;kind?:'interface'|'guidance';}
export interface ManualSection {title:string;steps:ManualStep[];}
export interface ManualDocument {title:string;summary:string;sections:ManualSection[];}
export interface ManualCapture {id:number;title:string;url:string;order:number;evidence:any;}
export interface ManualRun {id:string;url:string;objective:string;status:string;message:string;guide_id:number|null;document:ManualDocument;captures:ManualCapture[];created_at:string;}
@Injectable({providedIn:'root'})
export class ManualService {
  private base=API_BASE + '/manuals/';
  constructor(private http:HttpClient,private zone:NgZone){}
  list(){return this.http.get<ManualRun[]>(this.base);}
  create(data:{url:string;objective:string;consent:boolean}){return this.http.post<ManualRun>(this.base,data);}
  delete(id: string) { return this.http.delete<void>(this.base + id + '/'); }
  get(id:string){return this.http.get<ManualRun>(this.base+id+'/');}
  action(id:string,action:string,data:any={}){return this.http.post<ManualRun>(this.base+id+'/'+action+'/',data);}
  image(runId:string,captureId:number){return this.http.get(this.base+runId+'/captures/'+captureId+'/image/',{responseType:'blob'});}
  /** Descobre capacidade/versão antes de criar uma coleta; nenhum JWT passa pelo DOM do site. */
  async checkConnection():Promise<any>{
    const runtime=(window as any).chrome?.runtime;
    const known=localStorage.getItem('autoguide_extension_id')||'';
    let info:any=null;
    if(runtime?.sendMessage&&/^[a-p]{32}$/.test(known)){
      try{const result=await this.direct(known,{action:'PING_MANUAL'},2000);if(result.success&&result.protocol===1)info={...result,extensionId:known};}catch{}
    }
    if(!info){
      try{const result=await this.windowMessage('OCTOR_MANUAL_PING',undefined,2000);if(result.success&&result.protocol===1)info=result;}catch{}
    }
    if(!info||!/^[a-p]{32}$/.test(info.extensionId||''))throw new Error('A extensão desta aba não está atualizada ou disponível. Em chrome://extensions, recarregue OCTOR (versão 1.2.0), atualize esta página e conecte a conta pelo painel da extensão.');
    if(info.reader!==3)throw new Error('Atualize a extensão OCTOR para a versão 1.2.0 em chrome://extensions e recarregue esta página. O leitor de telas foi corrigido nessa versão.');
    localStorage.setItem('autoguide_extension_id',info.extensionId);
    if(!info.connected)throw new Error('A extensão foi encontrada, mas sua conta não está conectada. Abra o painel do OCTOR e use Entrar pelo navegador / Google para conectar.');
    return info;
  }
  async bridge(id:string,stop=false):Promise<void>{
    const info=await this.checkConnection();let response:any;
    // Só um canal envia o comando. Perder a resposta não dispara outra coleta automaticamente.
    if((window as any).chrome?.runtime?.sendMessage)response=await this.direct(info.extensionId,{action:stop?'STOP_MANUAL':'START_MANUAL',runId:id},15000);
    else response=await this.windowMessage(stop?'OCTOR_MANUAL_STOP':'OCTOR_MANUAL_START',id,15000);
    if(!response?.success)throw new Error(response?.error||'A extensão não conseguiu iniciar a coleta.');
  }
  private direct(extensionId:string,message:any,deadline:number):Promise<any>{
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error:Error|null,result?:any)=>{if(settled)return;settled=true;clearTimeout(timeout);this.zone.run(()=>error?reject(error):resolve(result));};
      const timeout=setTimeout(()=>finish(new Error('A extensão não confirmou a operação. Confira o painel antes de tentar iniciar novamente.')),deadline);
      try{const runtime=(window as any).chrome.runtime;runtime.sendMessage(extensionId,message,(response:any)=>{const error=runtime.lastError;if(error)finish(new Error('Não foi possível acessar a extensão conectada. Recarregue-a e reconecte sua conta.'));else if(!response)finish(new Error('A extensão não reconheceu esta funcionalidade. Atualize-a para a versão 1.2.0.'));else finish(null,response);});}
      catch{finish(new Error('Não foi possível acessar a extensão neste navegador.'));}
    });
  }
  private windowMessage(type:string,id:string|undefined,deadline:number):Promise<any>{
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID();
      const cleanup=()=>{clearTimeout(timeout);window.removeEventListener('message',listener);};
      const listener=(event:MessageEvent)=>{
        if(event.source!==window||event.origin!==location.origin||event.data?.type!=='OCTOR_MANUAL_RESULT'||event.data?.requestId!==requestId)return;
        cleanup();this.zone.run(()=>resolve(event.data));
      };
      const timeout=setTimeout(()=>{cleanup();this.zone.run(()=>reject(new Error('A ponte da extensão não está disponível nesta aba.')));},deadline);
      window.addEventListener('message',listener);window.postMessage({type,requestId,runId:id},location.origin);
    });
  }
}
export function manualError(error:any):string {const body=error?.error;if(typeof body?.detail==='string')return body.detail;if(body&&typeof body==='object')return Object.values(body).flat().join(' ');return error?.message||'Não foi possível concluir a operação. Tente novamente.';}
