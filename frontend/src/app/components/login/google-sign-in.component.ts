import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Observable, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
let sdkPromise: Promise<void> | null = null;
function googleSdk(): Promise<void> {
 if ((window as any).google?.accounts?.id) return Promise.resolve();
 if (!sdkPromise) sdkPromise=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>resolve();script.onerror=()=>{sdkPromise=null;script.remove();reject(new Error('Não foi possível carregar o Google. Tente novamente.'));};document.head.appendChild(script);
 });return sdkPromise;
}
@Component({selector:'app-google-sign-in',standalone:true,imports:[CommonModule],template:`
 <div #buttonHost></div><p *ngIf="!enabled && loaded" class="note">O acesso com Google estará disponível após a configuração do aplicativo.</p>
 <p *ngIf="message" class="note" role="status">{{message}}</p><button *ngIf="retry" type="button" (click)="prepare()">Tentar Google novamente</button>
 `,styles:['.note{font-size:12px;color:var(--text-muted);line-height:1.5;margin:10px 0}button{border:0;background:transparent;color:var(--primary);cursor:pointer;padding:8px 0}']})
export class GoogleSignInComponent implements OnInit,OnDestroy {
 @Input() mode:'login'|'link'|'confirm'='login'; @Output() done=new EventEmitter<void>(); @Output() identity=new EventEmitter<{credential:string;challenge:string}>();
 @ViewChild('buttonHost',{static:true}) buttonHost!:ElementRef<HTMLDivElement>;
 enabled=false;loaded=false;message='';retry=false;private destroyed=false;private challenge='';private request?:Subscription;
 constructor(private auth:AuthService,private zone:NgZone){}
 ngOnInit():void {this.prepare();}
 ngOnDestroy():void {this.destroyed=true;this.request?.unsubscribe();}
 async prepare():Promise<void>{
  this.retry=false;this.message='';
  try {
   const config=await firstValueFrom(this.auth.googleConfig());this.enabled=config.enabled;this.loaded=true;
   if(!config.enabled || this.destroyed)return;
   const attempt=await firstValueFrom(this.auth.googleChallenge());this.challenge=attempt.challenge;
   await googleSdk();if(this.destroyed)return;
   const google=(window as any).google;
   google.accounts.id.initialize({client_id:config.client_id,nonce:attempt.nonce,auto_select:false,callback:(response:any)=>this.zone.run(()=>this.finish(response.credential))});
   this.buttonHost.nativeElement.replaceChildren();
   google.accounts.id.renderButton(this.buttonHost.nativeElement,{type:'standard',theme:'outline',size:'large',text:this.mode==='link'?'continue_with':'signin_with',locale:'pt-BR',width:300});
  }catch(error:any){if(!this.destroyed){this.loaded=true;this.message=error?.message || 'Google indisponível.';this.retry=true;}}
 }
 finish(credential:string):void{
  if(this.destroyed)return;
  if(this.mode==='confirm'){this.identity.emit({credential,challenge:this.challenge});this.message='Conta selecionada. Confirme a alteração para continuar.';return;}
  this.message='Validando sua conta Google…';
  const operation:Observable<unknown>=this.mode==='link'?this.auth.googleLink(credential,this.challenge):this.auth.googleLogin(credential,this.challenge);
  this.request=operation.subscribe({next:()=>{if(!this.destroyed){this.message='';this.done.emit();}},error:error=>{if(!this.destroyed){this.message=error.error?.detail || 'Não foi possível entrar com Google.';this.retry=true;}}});
 }
}
