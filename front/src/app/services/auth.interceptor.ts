/** Interceptor HTTP: inclui a sessão conforme as condições atuais do serviço. Este código não adiciona filtragem por domínio de destino. */
/**
 * Dependência ({ HttpInterceptorFn }): requisições HTTP tipadas e interceptação do acesso à API.
 */
import { HttpInterceptorFn } from '@angular/common/http';
/**
 * Dependência ({ inject }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { inject } from '@angular/core';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ./auth.service.
 */
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = /* Lê a sessão disponível, clona a requisição com Bearer quando autenticada e delega ao próximo handler. | @param req — requisição HTTP interceptada. | @param next — próximo handler HTTP ou valor do callback, conforme a assinatura. | @returns resultado de next(...). */ (req, next) => {
  const authService = inject(AuthService);
  const /* credencial de acesso ou signal correspondente; seu formato e uso seguem o contrato da sessão. */ token = authService.token();

  if (token && authService.isAuthenticated()) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req);
};
