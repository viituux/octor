import { API_BASE } from '../../api-config';
/** Identificação do produto e aviso não bloqueante; não controla versões dos treinamentos. */
import {Component,OnInit,OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {Subscription,timer,exhaustMap,catchError,EMPTY} from 'rxjs';
import {DialogService} from '../../services/dialog.service';

@Component({selector:'app-release',standalone:true,imports:[CommonModule],template:`
 <aside *ngIf="release" class="release-bar" aria-label="Versão do OCTOR">
   <span>OCTOR <strong>{{release.version}}</strong></span>
   <span *ngIf="showNotice" role="status">Atualização disponível nesta instalação: {{release.previous_version}} → {{release.version}}.</span>
   <button type="button" (click)="details()">Ver novidades</button>
   <button *ngIf="showNotice" type="button" (click)="dismiss()" aria-label="Fechar aviso de atualização">Entendi</button>
 </aside>`,styles:[`.release-bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:9px 24px;background:var(--ui-f0f9ff);border-bottom:1px solid var(--ui-bae6fd);color:var(--ui-075985);font:12px/1.5 system-ui}.release-bar button{border:1px solid var(--ui-7dd3fc);background:var(--ui-ffffff);color:var(--ui-075985);padding:5px 10px;border-radius:6px;cursor:pointer}.release-bar button:focus-visible{outline:3px solid var(--ui-0284c7);outline-offset:2px}@media print{.release-bar{display:none}}`]})
export class AppReleaseComponent implements OnInit,OnDestroy{
 release:any=null;showNotice=false;private subscription?:Subscription;
 constructor(private http:HttpClient,private dialogs:DialogService){}
 ngOnInit(){this.subscription=timer(0,300000).pipe(exhaustMap(()=>this.http.get<any>(API_BASE + '/system/version/').pipe(catchError(()=>EMPTY)))).subscribe(data=>{this.release=data;try{this.showNotice=localStorage.getItem('octor_seen_release')!==data.version;}catch{this.showNotice=true;}});}
 ngOnDestroy(){this.subscription?.unsubscribe();}
 dismiss(){this.showNotice=false;try{localStorage.setItem('octor_seen_release',this.release.version);}catch{/* O aviso continua dispensável mesmo sem armazenamento local. */}}
 details(){this.dialogs.alert('OCTOR '+this.release.version+'\n\n'+this.release.changes.join('\n')+'\n\nA versão do sistema é independente da versão de cada treinamento.','Novidades do OCTOR');}
}
