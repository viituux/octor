/** Botão Google: prepara desafio/nonce antes de receber a credencial e delega a validação/vinculação ao servidor. */
/**
 * Dependência ({ Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, NgZone }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, NgZone } from '@angular/core';
/**
 * Dependência ({ CommonModule }): diretivas e apresentação compartilhada dos templates Angular.
 */
import { CommonModule } from '@angular/common';
/**
 * Dependência ({ firstValueFrom, Observable, Subscription }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import { firstValueFrom, Observable, Subscription } from 'rxjs';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ../../services/auth.service.
 */
import { AuthService } from '../../services/auth.service';
import { TrainingConsentComponent } from '../shared/training-consent.component';
let sdkPromise: Promise<void> | null = null;
/**
 * Carrega ou reutiliza o SDK de identidade Google necessário ao botão de autenticação.
 * @returns Promise<void>.
 */
function googleSdk(): Promise<void> {
 if ((window as any).google?.accounts?.id) return Promise.resolve();
 if (!sdkPromise) sdkPromise=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>resolve();script.onerror=()=>{sdkPromise=null;script.remove();reject(new Error('Não foi possível carregar o Google. Tente novamente.'));};document.head.appendChild(script);
 });return sdkPromise;
}
@Component({selector:'app-google-sign-in',standalone:true,imports:[CommonModule,TrainingConsentComponent],template:`
 <div [hidden]="pendingRegistration || submitting"><div #buttonHost [class.centered]="mode==='login'"></div></div>
 <p *ngIf="!enabled && loaded" class="note">O acesso com Google estará disponível após a configuração do aplicativo.</p>
 <p *ngIf="message" class="note" role="status">{{message}}</p>
 <button *ngIf="retry" type="button" (click)="prepare()">Tentar Google novamente</button>
 <section *ngIf="pendingRegistration" class="registration" aria-labelledby="google-registration-title" [attr.aria-busy]="submitting">
   <h3 id="google-registration-title">Conclua seu cadastro com Google</h3>
   <p class="note">Leia e aceite o termo para criar sua conta e entrar no OCTOR.</p>
   <fieldset [disabled]="submitting">
     <app-training-consent #trainingTerm (versionChange)="acceptedVersion=$event"></app-training-consent>
     <div class="registration-actions">
       <button class="continue" type="button" [disabled]="!acceptedVersion" (click)="continueRegistration()">Aceitar e entrar</button>
       <button type="button" (click)="prepare()">Cancelar</button>
     </div>
   </fieldset>
 </section>
 `,styles:[`
 :host{display:block}.centered{display:grid;justify-items:center;color-scheme:light}
 .note{font-size:12px;color:var(--text-muted);line-height:1.5;margin:10px 0}
 button{border:0;background:transparent;color:var(--primary);cursor:pointer;padding:8px 0}
 .registration{margin-top:12px;text-align:left}.registration h3{font-size:1rem;margin:0}
 fieldset{border:0;margin:0;padding:0;min-width:0}
 .registration-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
 .continue{border-radius:8px;padding:8px 14px;background:var(--primary);color:var(--on-primary, #fff);font-weight:600}
 button:disabled{opacity:.55;cursor:default}
 `]})
export class GoogleSignInComponent implements OnInit,OnDestroy {
 @Input() mode:'login'|'link'|'confirm'='login'; @Output() done=new EventEmitter<void>(); @Output() identity=new EventEmitter<{credential:string;challenge:string}>();
 @Input() isRegistering = false;
 @Input() buttonTheme: 'outline' | 'filled_black' = 'outline';
 @Input() consentVersion = '';
 pendingRegistration: {credential: string; challenge: string} | null = null;
 acceptedVersion = '';
 submitting = false;
 @ViewChild('trainingTerm') trainingTerm?: TrainingConsentComponent;
 @ViewChild('buttonHost',{static:true}) buttonHost!:ElementRef<HTMLDivElement>;
 enabled=false;loaded=false;message='';retry=false;private destroyed=false;private challenge='';private request?:Subscription;
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param auth — AuthService; contrato tipado na assinatura.
  * @param zone — NgZone; zona Angular usada para refletir callbacks externos na interface.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private auth:AuthService,private zone:NgZone){}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void.
  */
 ngOnInit():void {this.prepare();}
 /**
  * Libera os recursos mantidos pelo componente ao sair da tela, conforme os timers, listeners e objetos registrados neste fluxo.
  * @returns void.
  */
 ngOnDestroy():void {this.destroyed=true;this.pendingRegistration=null;this.request?.unsubscribe();}
 /**
  * Solicita o desafio de uso único e prepara o botão Google para a tentativa atual.
  * @returns Promise<void>.
  */
 async prepare():Promise<void>{
  this.retry=false;this.message='';this.pendingRegistration=null;this.acceptedVersion='';this.challenge='';
  this.buttonHost.nativeElement.replaceChildren();
  try {
   const config=await firstValueFrom(this.auth.googleConfig());this.enabled=config.enabled;this.loaded=true;
   if(!config.enabled || this.destroyed)return;
   const attempt=await firstValueFrom(this.auth.googleChallenge());this.challenge=attempt.challenge;
   await googleSdk();if(this.destroyed)return;
   const google=(window as any).google;
   google.accounts.id.initialize({client_id:config.client_id,nonce:attempt.nonce,auto_select:false,callback:(response:{credential:string})=>this.zone.run(()=>{
    if(this.challenge===attempt.challenge) this.finish(response.credential);
   })});
   google.accounts.id.renderButton(this.buttonHost.nativeElement,{type:'standard',theme:this.buttonTheme,size:'large',text:this.mode==='link'?'continue_with':'signin_with',locale:'pt-BR',width:this.mode==='login'?240:300});
  }catch(error:any){if(!this.destroyed){this.loaded=true;this.message=error?.message || 'Google indisponível.';this.retry=true;}}
 }
 /**
  * Finaliza o estado ocupado da operação e apresenta o resultado conforme o chamador.
  * @param credential — string; credencial Google da tentativa atual.
  * @returns void.
  */
 finish(credential:string):void{
  if(this.destroyed || this.submitting || this.pendingRegistration || !credential)return;
  if(this.mode==='confirm'){this.identity.emit({credential,challenge:this.challenge});this.message='Conta selecionada. Confirme a alteração para continuar.';return;}
  this.submit(credential,this.challenge,this.consentVersion);
 }

 continueRegistration():void {
  if(this.pendingRegistration && this.acceptedVersion && !this.submitting){
   const {credential,challenge}=this.pendingRegistration;
   this.submit(credential,challenge,this.acceptedVersion);
  }
 }

 private submit(credential:string,challenge:string,consentVersion:string):void {
  this.submitting=true;
  this.retry=false;
  this.message='Validando sua conta Google…';
  const operation:Observable<unknown>=this.mode==='link'?this.auth.googleLink(credential,challenge):this.auth.googleLogin(credential,challenge,consentVersion);
  this.request=operation.subscribe({
   next:()=>{
    if(this.destroyed)return;
    this.submitting=false;
    this.pendingRegistration=null;
    this.message='';
    this.done.emit();
   },
   error:error=>{
    if(this.destroyed)return;
    this.submitting=false;
    const requiresConsent=error.error?.code==='training_consent_required';
    if(this.mode==='login' && !this.isRegistering && requiresConsent){
     this.pendingRegistration={credential,challenge};
     this.message=consentVersion?'O termo foi atualizado. Leia a versão atual para continuar.':'';
     if(consentVersion) void this.trainingTerm?.load();
     return;
    }
    this.pendingRegistration=null;
    this.message=error.error?.detail || 'Não foi possível entrar com Google.';
    this.retry=true;
   }
  });
 }
}
