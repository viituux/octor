/** Módulo front/src/app/components/trainings/training-list.component.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
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
 * Dependência ({TrainingService,Training,trainingError}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService,Training,trainingError} from '../../services/training.service';
/**
 * Dependência ({TrainingNavComponent}): contratos e comportamento compartilhados de ./training-nav.component.
 */
import {TrainingNavComponent} from './training-nav.component';
@Component({standalone:true,imports:[CommonModule,RouterModule,TrainingNavComponent],template:`<app-training-nav></app-training-nav><main class="training-page"><span class="eyebrow">APRENDA UMA ETAPA DE CADA VEZ</span><h1>Meus treinamentos</h1><p class="muted">Acompanhe os procedimentos recebidos e compartilhe sua experiência ao concluir.</p><p *ngIf="loading" role="status">Carregando treinamentos…</p><p *ngIf="error" role="alert" class="alert error">{{error}} <button (click)="load()">Tentar novamente</button></p><div class="training-grid"><article *ngFor="let t of items" class="panel training-card"><span class="badge">{{t.progress.feedback?'Concluído e avaliado':t.progress.completed_at?'Avaliação pendente':t.progress.started_at?'Em andamento':'Não iniciado'}}</span><h2>{{t.title}}</h2><p class="muted">{{t.description}}</p><p *ngIf="t.status==='archived'" class="muted">Arquivado · consulta do histórico</p><a class="button primary" [routerLink]="['/trainings',t.id]">{{t.progress.feedback?'Ver minha avaliação':'Acessar treinamento'}} →</a></article></div><section *ngIf="!loading && !error && !items.length" class="empty"><h2>Seu próximo aprendizado começa aqui</h2><p>Os treinamentos atribuídos a você aparecerão nesta área.</p><a routerLink="/guides">Voltar à biblioteca</a></section></main>`,styleUrls:['./trainings.css']})
export class TrainingListComponent implements OnInit{items:Training[]=[];/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;error='';/* Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular. | @param service — TrainingService; serviço injetado para comunicação e estado da tela. | @returns void/undefined; efeitos nas operações do corpo. */ constructor(private service:TrainingService){}/* Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ ngOnInit(){this.load();}/* Executa a etapa `load` do fluxo de training-list.component.ts; os retornos abaixo identificam o contrato entregue ao chamador. | @returns void/undefined; efeitos nas operações do corpo. */ load(){this.loading=true;this.error='';this.service.mine().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param data — dados do contrato enviado ao serviço. | @returns void/undefined; efeitos nas operações do corpo. */ data=>{this.items=data;this.loading=false;},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ e=>{this.error=trainingError(e);this.loading=false;}});}}
