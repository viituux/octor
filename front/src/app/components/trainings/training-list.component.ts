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
 * Dependência ({TrainingService,TrainingListItem,trainingError}): contratos e comportamento compartilhados de ../../services/training.service.
 */
import {TrainingService,TrainingListItem,trainingError} from '../../services/training.service';
/**
 * Dependência ({TrainingNavComponent}): contratos e comportamento compartilhados de ./training-nav.component.
 */
import {AuthService} from '../../services/auth.service';
import {TrainingNavComponent} from './training-nav.component';
@Component({standalone:true,imports:[CommonModule,RouterModule,TrainingNavComponent],template:`<app-training-nav></app-training-nav><main class="training-page"><div class="row"><h1>Meus treinamentos</h1><button type="button" [disabled]="loading" (click)="load()" class="refresh-list" aria-label="Atualizar lista" title="Atualizar lista">↻</button></div><p class="muted">Consulte os treinamentos atribuídos a você e retome de onde parou.</p><p *ngIf="loading" role="status">Carregando treinamentos…</p><p *ngIf="error" role="alert" class="alert error">{{error}} <button (click)="load()">Tentar novamente</button></p><div class="training-grid"><article *ngFor="let t of items" class="panel training-card"><ng-container *ngIf="t.status==='draft'; else publishedTraining"><span class="badge">Aguardando publicação</span><h2>{{t.title}}</h2><p class="muted">O conteúdo será liberado quando o responsável publicar o treinamento.</p></ng-container><ng-template #publishedTraining><span class="badge">{{t.progress?.feedback?'Concluído e avaliado':t.progress?.requires_quiz&&t.progress?.quiz?.finished_at?'Avaliação pendente':t.progress?.requires_quiz&&t.progress?.content_completed_at?'Quiz pendente':t.progress?.completed_at?'Avaliação pendente':t.progress?.started_at?'Em andamento':'Não iniciado'}}</span><h2>{{t.title}}</h2><p class="muted">{{t.description}}</p><p *ngIf="t.step_count" class="training-format">{{t.step_count}} {{t.step_count===1?"passo":"passos"}} · {{t.reference_only?"Treinamento por capturas":"Me guie em ambiente de teste"}}</p><p *ngIf="t.status==='archived'" class="muted">Arquivado · consulta do histórico</p><a class="button primary" [routerLink]="['/trainings',t.id]">{{nextAction(t)}} →</a></ng-template></article></div><section *ngIf="!loading && !error && !items.length" class="empty"><span class="empty-symbol" aria-hidden="true">▤</span><h2>Nenhum treinamento atribuído</h2><p>Quando você receber um treinamento, ele aparecerá aqui.</p><a class="button primary" routerLink="/guides">Ir para a biblioteca</a></section></main>`,styleUrls:['./trainings.css']})
export class TrainingListComponent implements OnInit{items: TrainingListItem[] = [];

  nextAction(training: TrainingListItem): string {
    if (training.status === 'archived') return 'Consultar histórico';
    const progress = training.progress;
    if (progress?.feedback) return 'Ver conclusão';
    if (progress?.requires_quiz && progress.quiz?.finished_at) {
      return progress.attempt_limit > progress.quiz.attempt ? 'Refazer quiz' : 'Ver resultado e avaliar';
    }
    if (progress?.requires_quiz && (progress.content_completed_at || progress.completed_at)) {
      return progress.quiz?.started_at ? 'Continuar quiz' : 'Responder ao quiz';
    }
    if (progress?.completed_at) return 'Avaliar treinamento';
    if (!progress?.started_at) return 'Iniciar treinamento';
    const user = this.auth.currentUser()?.id;
    if (user != null && training.step_count) {
      try {
        const saved = localStorage.getItem(`octor:training-step:${user}:${training.id}:${progress.started_at}`);
        const index = Number(saved);
        if (saved !== null && Number.isInteger(index) && index >= 0 && index < training.step_count) {
          return `Continuar no passo ${index + 1} de ${training.step_count}`;
        }
      } catch { /* A lista continua utilizável sem armazenamento local. */ }
    }
    return 'Continuar treinamento';
  }

  /* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;error='';/* Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular. | @param service — TrainingService; serviço injetado para comunicação e estado da tela. | @returns void/undefined; efeitos nas operações do corpo. */ constructor(private service:TrainingService, private auth:AuthService){}/* Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ ngOnInit(){this.load();}/* Executa a etapa `load` do fluxo de training-list.component.ts; os retornos abaixo identificam o contrato entregue ao chamador. | @returns void/undefined; efeitos nas operações do corpo. */ load(){this.loading=true;this.error='';this.service.mine().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param data — dados do contrato enviado ao serviço. | @returns void/undefined; efeitos nas operações do corpo. */ data=>{this.items=data;this.loading=false;},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ e=>{this.error=trainingError(e);this.loading=false;}});}}
