/** Administração de treinamento: rascunho, revisão de perguntas, publicação e participantes. A publicação versiona conteúdo no servidor. */
/**
 * Dependência ({inject}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {inject} from '@angular/core';
/**
 * Dependência ({CanActivateFn,Router}): rotas, parâmetros e navegação entre as telas.
 */
import {CanActivateFn,Router} from '@angular/router';
/**
 * Dependência ({catchError,map,of}): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import {catchError,map,of} from 'rxjs';
/**
 * Dependência ({TrainingService}): contratos e comportamento compartilhados de ./training.service.
 */
import {TrainingService} from './training.service';
export const trainingAdminGuard:CanActivateFn=/* Consulta a capacidade administrativa antes de liberar a rota de gestão de treinamentos. | @returns resultado de inject(TrainingService).capabilities().pipe(...). */ ()=>{const router=inject(Router);return inject(TrainingService).capabilities().pipe(map(c=>c.can_manage?true:router.createUrlTree(['/trainings'])),catchError(()=>of(router.createUrlTree(['/trainings']))));};
