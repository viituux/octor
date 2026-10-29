import {inject} from '@angular/core';
import {CanActivateFn,Router} from '@angular/router';
import {catchError,map,of} from 'rxjs';
import {TrainingService} from './training.service';
export const trainingAdminGuard:CanActivateFn=()=>{const router=inject(Router);return inject(TrainingService).capabilities().pipe(map(c=>c.can_manage?true:router.createUrlTree(['/trainings'])),catchError(()=>of(router.createUrlTree(['/trainings']))));};
