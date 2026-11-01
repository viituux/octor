/** Módulo front/src/app/services/auth.guard.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
/**
 * Dependência ({ inject }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { inject } from '@angular/core';
/**
 * Dependência ({ CanActivateFn, Router }): rotas, parâmetros e navegação entre as telas.
 */
import { CanActivateFn, Router } from '@angular/router';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ./auth.service.
 */
import { AuthService } from './auth.service';
export const authGuard: CanActivateFn = /* Permite a navegação autenticada ou produz o redirecionamento de login. | @param _route — valor recebido do contexto chamador. | @param state — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ (_route,state) => {
 const auth=inject(AuthService);return auth.isAuthenticated() || inject(Router).createUrlTree(['/login'],{queryParams:{returnUrl:state.url}});
};
