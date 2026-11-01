/** Módulo front/src/app/components/trainings/training-nav.component.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
/**
 * Dependência ({Component,OnInit}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({RouterModule}): rotas, parâmetros e navegação entre as telas.
 */
import {RouterModule} from '@angular/router';
/**
 * Dependência ({TrainingService}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService} from '../../services/training.service';
@Component({selector:'app-training-nav',standalone:true,imports:[CommonModule,RouterModule],template:`<header class="training-top"><a routerLink="/guides" class="training-brand">OCTOR</a><nav aria-label="Treinamentos"><a routerLink="/trainings" routerLinkActive="selected" [routerLinkActiveOptions]="{exact:true}">Meus treinamentos</a><a *ngIf="canManage" routerLink="/training-admin" routerLinkActive="selected">Administrar</a><a *ngIf="canManage" routerLink="/training-dashboard" routerLinkActive="selected">Dashboard</a></nav><a routerLink="/account">Minha conta</a></header>`,styleUrls:['./trainings.css']})
export class TrainingNavComponent implements OnInit{canManage=false;/* Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular. | @param service — TrainingService; serviço injetado para comunicação e estado da tela. | @returns void/undefined; efeitos nas operações do corpo. */ constructor(private service:TrainingService){}/* Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ ngOnInit(){this.service.capabilities().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param c — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ c=>this.canManage=c.can_manage,error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns expressão calculada/comparada no corpo. */ ()=>this.canManage=false});}}
