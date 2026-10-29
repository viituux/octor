import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {GuideService} from '../../services/guide.service';
@Component({standalone:true,imports:[CommonModule,RouterLink],template:`<main><a routerLink="/guides">Octo</a><h1>Convite para a equipe</h1><p *ngIf="name">Você foi convidado para {{name}}.</p><p role="alert">{{message}}</p><button *ngIf="name" [disabled]="busy" (click)="accept()">{{busy?'Entrando…':'Aceitar convite'}}</button><a routerLink="/guides">Ir à biblioteca</a><a routerLink="/account">Verificar minha conta</a></main>`,styles:[`main{max-width:520px;margin:12vh auto;padding:32px;font-family:Arial;line-height:1.8}button{background:var(--primary);color:var(--on-primary);border:0;border-radius:9px;padding:12px;cursor:pointer}a{display:block;color:var(--primary);margin:15px 0}h1{font-size:28px}`]})
export class WorkspaceInviteComponent implements OnInit{
 name='';message='Carregando convite…';busy=false;token='';
 constructor(private service:GuideService,private route:ActivatedRoute,private router:Router){}
 ngOnInit(){this.token=this.route.snapshot.paramMap.get('token')||'';this.service.invitation(this.token).subscribe({next:data=>{this.name=data.name;this.message='Ao aceitar, você poderá consultar os procedimentos publicados da equipe.';},error:e=>this.message=e.error?.detail||'Convite indisponível. Verifique sua conta ou solicite outro link.'});}
 accept(){if(this.busy)return;this.busy=true;this.service.acceptInvite(this.token).subscribe({next:w=>this.router.navigate(['/guides'],{queryParams:{workspace:w.id}}),error:e=>{this.busy=false;this.message=e.error?.detail||'Não foi possível aceitar.';}});}
}
