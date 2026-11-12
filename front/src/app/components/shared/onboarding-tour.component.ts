import { API_BASE } from '../../api-config';
/** Tour de apresentação: somente leitura, persistência por conta e diálogo acessível. */
import {Component,AfterViewInit,OnDestroy,ViewChild,ElementRef,EventEmitter,Input,Output,DestroyRef,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {firstValueFrom,timeout} from 'rxjs';
import {AuthService} from '../../services/auth.service';

@Component({selector:'app-onboarding-tour',standalone:true,imports:[CommonModule],template:`
 <dialog #dialog aria-modal="true" aria-labelledby="octor-tour-title" aria-describedby="octor-tour-description" (cancel)="skip($event)" (keydown)="key($event)">
   <svg class="tour-shade" width="100%" height="100%" aria-hidden="true"><defs><mask id="octor-tour-mask"><rect width="100%" height="100%" fill="white"/><rect *ngIf="target" [attr.x]="target.left" [attr.y]="target.top" [attr.width]="target.width" [attr.height]="target.height" rx="10" fill="black"/></mask></defs><rect width="100%" height="100%" fill="#020617" fill-opacity=".62" mask="url(#octor-tour-mask)"/><rect *ngIf="target" [attr.x]="target.left" [attr.y]="target.top" [attr.width]="target.width" [attr.height]="target.height" rx="10" fill="none" stroke="var(--focus-ring)" stroke-width="3"/></svg>
   <section #card class="tour-card" [style.width.px]="width" [style.left.px]="left" [style.top.px]="top" [attr.aria-busy]="busy">
     <div class="tour-heading"><span>OCTOR · PRIMEIROS PASSOS</span><span aria-live="polite">{{index+1}} de {{steps.length}}</span></div>
     <progress [value]="index+1" [max]="steps.length" aria-label="Progresso do tour"></progress>
     <h2 id="octor-tour-title" #title tabindex="-1">{{step.title}}</h2>
     <p id="octor-tour-description">{{step.body}}</p>
     <footer><button type="button" class="skip" (click)="finish('skipped')" [disabled]="busy">Pular tour</button><div><button type="button" (click)="previous()" [disabled]="busy||index===0">Voltar</button><button type="button" class="primary" (click)="next()" [disabled]="busy">{{busy?'Salvando…':index===steps.length-1?'Concluir':index===0?'Começar':'Próximo'}}</button></div></footer>
   </section>
 </dialog>`,styleUrls:['./onboarding-tour.component.css']})
export class OnboardingTourComponent implements AfterViewInit,OnDestroy{
 @Input() blocked=false;
 @ViewChild('dialog',{static:true}) element!:ElementRef<HTMLDialogElement>;
 @ViewChild('card',{static:true}) card!:ElementRef<HTMLElement>;
 @ViewChild('title',{static:true}) title!:ElementRef<HTMLElement>;
 @Output() started=new EventEmitter<void>();
 @Output() stepChange=new EventEmitter<string|null>();
 @Output() finished=new EventEmitter<{status:string;saved:boolean}>();
 readonly steps=[
   {title:'Bem-vindo ao OCTOR!',body:'Transforme procedimentos em guias visuais e acompanhe treinamentos em um só lugar. Vamos conhecer os principais controles? Você pode pular e rever este tour pelo menu lateral.',target:null},
   {title:'Seu espaço, do seu jeito',body:'Abra ou recolha o menu lateral por este botão. Nele ficam seus rascunhos, guias publicados, favoritos e espaços de equipe.',target:'#library-menu-toggle'},
   {title:'Crie seu primeiro guia',body:'Comece um rascunho por aqui. Para registrar cliques e capturas, conecte a extensão do OCTOR. Depois, revise os passos e as instruções no editor.',target:'#tour-new-guide'},
   {title:'Documente uma página pela URL',body:'Informe a URL e o objetivo para coletar telas visíveis e gerar um manual em seções e passos. Revise o resultado antes de aprovar: esse modo não navega nem executa ações sozinho.',target:'[data-tour="manual-url"]'},
   {title:'Aprenda com os treinamentos',body:'Os treinamentos atribuídos à sua conta aparecem aqui. Consulte o procedimento e conclua as etapas solicitadas, como quiz e avaliação.',target:'[data-tour="trainings"]'},
   {title:'Escolha o tema e comece',body:'Use este botão para alternar entre claro e escuro. Sua escolha fica salva no navegador. Pronto: você já pode explorar o OCTOR! Para rever a apresentação, use “Ver tour do OCTOR” no menu.',target:'[data-tour="theme"]'}
 ];
 index=0;active=false;busy=false;target:{left:number;top:number;width:number;height:number}|null=null;
 width=360;left=16;top=16;
 private endpoint=API_BASE + '/auth/onboarding/';
 private destroyRef=inject(DestroyRef);private destroyed=false;private closedInSession=false;
 private frame:number|null=null;private focusTimer:ReturnType<typeof setTimeout>|null=null;private needsFocus=false;private previousFocus:HTMLElement|null=null;
 constructor(private http:HttpClient,private auth:AuthService){}
 get step(){return this.steps[this.index];}
 private localKey(){return 'octor_tour_closed_'+this.auth.currentUser()?.id;}
 ngAfterViewInit(){
   this.http.get<{user_id:number;status:string}>(this.endpoint).pipe(timeout(8000),takeUntilDestroyed(this.destroyRef)).subscribe({
     next:state=>{if(state.status!=='pending'||state.user_id!==this.auth.currentUser()?.id||this.closedInSession)return;
       try{if(localStorage.getItem(this.localKey()))return;}catch{}
       this.scheduleStart();},error:()=>{/* Falha de apresentação não bloqueia a biblioteca; a opção manual permanece disponível. */}});
 }
 private scheduleStart(){if(this.active||this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.start();});}
 /** Chamado automaticamente para contas novas ou manualmente pelo botão da biblioteca. */
 start(manual=false){
   if(this.destroyed||this.active||this.busy||this.blocked||(!manual&&this.closedInSession)||document.querySelector('dialog[open]'))return;
   this.index=0;this.active=true;this.previousFocus=document.activeElement as HTMLElement;this.started.emit();
   this.element.nativeElement.showModal();window.addEventListener('resize',this.resize);window.addEventListener('scroll',this.scroll,true);
   this.changed();
 }
 next(){if(this.busy)return;if(this.index===this.steps.length-1){void this.finish('completed');return;}this.index++;this.changed();}
 previous(){if(this.busy||this.index===0)return;this.index--;this.changed();}
 private changed(){this.target=null;this.stepChange.emit(this.step.target);this.schedule(true);}
 private resize=()=>{this.stepChange.emit(this.step.target);this.schedule();};
 private scroll=()=>this.schedule();
 private schedule(focus=false){
   this.needsFocus=this.needsFocus||focus;if(this.frame!==null||!this.active)return;
   this.frame=requestAnimationFrame(()=>{this.frame=null;if(this.destroyed||!this.active)return;this.position();if(this.needsFocus){this.title.nativeElement.focus({preventScroll:true});this.needsFocus=false;}});
 }
 private position(){
   const vw=window.innerWidth,vh=window.innerHeight,margin=16,gap=14;this.width=Math.min(360,vw-margin*2);
   const raw=this.step.target?document.querySelector<HTMLElement>(this.step.target)?.getBoundingClientRect():null;
   this.target=raw&&raw.width>0&&raw.height>0&&raw.bottom>0&&raw.top<vh
     ?{left:Math.max(6,raw.left-6),top:Math.max(6,raw.top-6),width:Math.min(vw-6,raw.right+6)-Math.max(6,raw.left-6),height:Math.min(vh-6,raw.bottom+6)-Math.max(6,raw.top-6)}:null;
   const height=Math.min(this.card.nativeElement.offsetHeight||300,vh-margin*2),clampX=(x:number)=>Math.max(margin,Math.min(x,vw-this.width-margin)),clampY=(y:number)=>Math.max(margin,Math.min(y,vh-height-margin));
   if(!this.target){this.left=clampX((vw-this.width)/2);this.top=clampY((vh-height)/2);return;}
   const r=this.target;
   if(r.top+r.height+gap+height<=vh-margin){this.left=clampX(r.left+r.width/2-this.width/2);this.top=r.top+r.height+gap;}
   else if(r.left+r.width+gap+this.width<=vw-margin){this.left=r.left+r.width+gap;this.top=clampY(r.top);}
   else if(r.top-gap-height>=margin){this.left=clampX(r.left);this.top=r.top-gap-height;}
   else{this.left=clampX((vw-this.width)/2);this.top=clampY((vh-height)/2);}
 }
 skip(event:Event){event.preventDefault();void this.finish('skipped');}
 key(event:KeyboardEvent){
   if(event.key!=='Tab')return;const buttons=Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));const first=buttons[0],last=buttons[buttons.length-1];if(!first)return;
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===this.title.nativeElement)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 async finish(status:'completed'|'skipped'){
   if(!this.active||this.busy)return;this.busy=true;let saved=false;
   try{await firstValueFrom(this.http.post(this.endpoint,{status}).pipe(timeout(8000),takeUntilDestroyed(this.destroyRef)));saved=true;}catch{}
   if(this.destroyed)return;
   try{localStorage.setItem(this.localKey(),status);}catch{}
   this.active=false;this.busy=false;this.closedInSession=true;this.stopListeners();this.element.nativeElement.close();this.finished.emit({status,saved});
   this.focusTimer=setTimeout(()=>{this.focusTimer=null;if(this.destroyed)return;const previous=this.previousFocus;((previous?.isConnected&&previous.offsetParent!==null)?previous:document.getElementById('library-menu-toggle'))?.focus();},0);
 }
 private stopListeners(){window.removeEventListener('resize',this.resize);window.removeEventListener('scroll',this.scroll,true);if(this.frame!==null){cancelAnimationFrame(this.frame);this.frame=null;}}
 ngOnDestroy(){this.destroyed=true;this.stopListeners();if(this.focusTimer)clearTimeout(this.focusTimer);if(this.element.nativeElement.open)this.element.nativeElement.close();}
}
