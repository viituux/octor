/** Confirmações assíncronas: apenas um diálogo ativo e cancelamento ao trocar de rota. */
import {Injectable,signal} from '@angular/core';
import {Router,NavigationStart} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
export interface DialogOptions {title?:string;confirmText?:string;cancelText?:string;danger?:boolean;}
export interface DialogRequest {id:number;title:string;message:string;confirmText:string;cancelText:string;danger:boolean;showCancel:boolean;}
@Injectable({providedIn:'root'})
export class DialogService {
  readonly current=signal<DialogRequest|null>(null);
  private resolvePending:((accepted:boolean)=>void)|null=null;
  private sequence=0;
  constructor(router:Router){router.events.pipe(takeUntilDestroyed()).subscribe(event=>{if(event instanceof NavigationStart)this.close(false);});}
  /** Resolve false ao cancelar; cliques repetidos não abrem nem confirmam várias operações. */
  confirm(message:string,options:DialogOptions={}):Promise<boolean>{return this.open(message,options,true);}
  alert(message:string,title='Informação'):Promise<boolean>{return this.open(message,{title,confirmText:'Entendi'},false);}
  private open(message:string,options:DialogOptions,showCancel:boolean):Promise<boolean>{
    if(this.current())return Promise.resolve(false);
    return new Promise(resolve=>{this.resolvePending=resolve;this.current.set({id:++this.sequence,title:options.title||'Confirmar ação',message,confirmText:options.confirmText||'Confirmar',cancelText:options.cancelText||'Cancelar',danger:!!options.danger,showCancel});});
  }
  close(accepted:boolean){const resolve=this.resolvePending;this.resolvePending=null;this.current.set(null);resolve?.(accepted);}
}
