import {AuthService} from '../../services/auth.service';
import {Subscription} from 'rxjs';
import {OctorLogoComponent} from '../shared/octor-logo.component';
/** Módulo front/src/app/components/trainings/training-nav.component.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
/**
 * Dependência ({Component,OnInit}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit,OnDestroy} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({RouterModule}): rotas, parâmetros e navegação entre as telas.
 */
import {Router,RouterModule} from '@angular/router';
/**
 * Dependência ({TrainingService}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService} from '../../services/training.service';
@Component({selector:'app-training-nav',standalone:true,imports:[OctorLogoComponent,CommonModule,RouterModule],template:`<header class="training-top"><a routerLink="/guides" class="training-brand"><app-octor-logo></app-octor-logo></a><nav aria-label="Treinamentos"><a routerLink="/trainings" routerLinkActive="selected" [routerLinkActiveOptions]="{exact:true}">Meus treinamentos</a><a *ngIf="canManage" routerLink="/training-admin" routerLinkActive="selected">Administrar</a><a *ngIf="canManage" routerLink="/training-dashboard" routerLinkActive="selected">Dashboard</a></nav><details class="training-account">
  <summary aria-label="Menu da conta">
    <img *ngIf="photo && !photoFailed; else fallback" [src]="photo" (error)="photoFailed=true" alt="" referrerpolicy="no-referrer">
    <ng-template #fallback>{{initials}}</ng-template>
  </summary>
  <div class="training-account-menu">
    <a routerLink="/account">Minha conta</a><a routerLink="/guides">Biblioteca</a>
    <button type="button" (click)="logout()">Sair da conta</button>
  </div>
</details></header>`,styleUrls:['./trainings.css']})
export class TrainingNavComponent implements OnInit, OnDestroy {
 private avatarSubscription?: Subscription;
 private avatarUrl='';
 private hideGooglePhoto=false;
 photoFailed=false;
 get photo(){return this.avatarUrl || (this.hideGooglePhoto ? '' : this.auth.currentUser()?.google_picture);}
 get initials(){
   const user=this.auth.currentUser();
   const first=user?.first_name || (user?.google_email ? user.email : user?.username) || 'O';
   return (first.slice(0,1)+(user?.last_name||'').slice(0,1)).toUpperCase();
 }
 private loadAvatar(){
   this.avatarSubscription=this.auth.getAvatar().subscribe({
     next: async blob=>{
       if(blob.type.includes('application/json')){
         try{this.hideGooglePhoto=JSON.parse(await blob.text()).hidden===true;}catch{}
       }else if(blob.size){
         this.avatarUrl=URL.createObjectURL(blob);
         this.photoFailed=false;
       }
     },
     error:()=>{}
   });
 }
 logout(){this.auth.logout();void this.router.navigate(['/login']);}
 ngOnDestroy(){this.avatarSubscription?.unsubscribe();URL.revokeObjectURL(this.avatarUrl);}
 canManage=false;/* Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular. | @param service — TrainingService; serviço injetado para comunicação e estado da tela. | @returns void/undefined; efeitos nas operações do corpo. */ constructor(private service:TrainingService,private auth:AuthService,private router:Router){}/* Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ ngOnInit(){this.loadAvatar();this.service.capabilities().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param c — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ c=>this.canManage=c.can_manage,error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns expressão calculada/comparada no corpo. */ ()=>this.canManage=false});}}
