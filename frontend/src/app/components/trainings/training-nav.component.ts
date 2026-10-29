import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {TrainingService} from '../../services/training.service';
@Component({selector:'app-training-nav',standalone:true,imports:[CommonModule,RouterModule],template:`<header class="training-top"><a routerLink="/guides" class="training-brand">OCTO</a><nav aria-label="Treinamentos"><a routerLink="/trainings" routerLinkActive="selected" [routerLinkActiveOptions]="{exact:true}">Meus treinamentos</a><a *ngIf="canManage" routerLink="/training-admin" routerLinkActive="selected">Administrar</a><a *ngIf="canManage" routerLink="/training-dashboard" routerLinkActive="selected">Dashboard</a></nav><a routerLink="/account">Minha conta</a></header>`,styleUrls:['./trainings.css']})
export class TrainingNavComponent implements OnInit{canManage=false;constructor(private service:TrainingService){}ngOnInit(){this.service.capabilities().subscribe({next:c=>this.canManage=c.can_manage,error:()=>this.canManage=false});}}
