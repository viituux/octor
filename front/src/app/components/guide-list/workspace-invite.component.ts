/** Biblioteca: organiza procedimentos por contexto, seção e equipe; alterações de acesso e exclusão são confirmadas pela API. */
/**
 * Dependência ({Component,OnInit}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({ActivatedRoute,Router,RouterLink}): rotas, parâmetros e navegação entre as telas.
 */
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
/**
 * Dependência ({GuideService}): contratos e comportamento compartilhados de ../../services/guide.service.
 */
import {GuideService} from '../../services/guide.service';
@Component({standalone:true,imports:[CommonModule,RouterLink],template:`<main><a routerLink="/guides">OCTOR</a><h1>Convite para a equipe</h1><p *ngIf="name">Você foi convidado para {{name}}.</p><p role="alert">{{message}}</p><button *ngIf="name" [disabled]="busy" (click)="accept()">{{busy?'Entrando…':'Aceitar convite'}}</button><a routerLink="/guides">Ir à biblioteca</a><a routerLink="/account">Verificar minha conta</a></main>`,styles:[`main{max-width:520px;margin:12vh auto;padding:32px;font-family:Arial;line-height:1.8}button{background:var(--primary);color:var(--on-primary);border:0;border-radius:9px;padding:12px;cursor:pointer}a{display:block;color:var(--primary);margin:15px 0}h1{font-size:28px}`]})
export class WorkspaceInviteComponent implements OnInit{
 name='';message='Carregando convite…';/* boolean: bloqueia submissões repetidas enquanto a operação atual aguarda resposta. */ busy=false;/* credencial de acesso ou signal correspondente; seu formato e uso seguem o contrato da sessão. */ token='';
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param service — GuideService; serviço injetado para comunicação e estado da tela.
  * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
  * @param router — Router; roteador injetado para navegação.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private service:GuideService,private route:ActivatedRoute,private router:Router){}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnInit(){this.token=this.route.snapshot.paramMap.get('token')||'';this.service.invitation(this.token).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param data — dados do contrato enviado ao serviço. | @returns void/undefined; efeitos nas operações do corpo. */ data=>{this.name=data.name;this.message='Ao aceitar, você poderá consultar os procedimentos publicados da equipe.';},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns expressão calculada/comparada no corpo. */ e=>this.message=e.error?.detail||'Convite indisponível. Verifique sua conta ou solicite outro link.'});}
 /**
  * Aceita o convite em nome da conta autenticada e trata a navegação após a resposta.
  * @returns void/undefined.
  */
 accept(){if(this.busy)return;this.busy=true;this.service.acceptInvite(this.token).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param w — valor recebido do contexto chamador. | @returns resultado de this.router.navigate(...). */ w=>this.router.navigate(['/guides'],{queryParams:{workspace:w.id}}),error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ e=>{this.busy=false;this.message=e.error?.detail||'Não foi possível aceitar.';}});}
}
