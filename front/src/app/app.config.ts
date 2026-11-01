/** Providers da aplicação: registra roteador, cliente HTTP e interceptor de sessão sem alterar os contratos dos módulos. */
/**
 * Dependência ({ ApplicationConfig, provideZoneChangeDetection }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
/**
 * Dependência ({ provideRouter }): rotas, parâmetros e navegação entre as telas.
 */
import { provideRouter } from '@angular/router';
/**
 * Dependência ({ provideHttpClient, withInterceptors }): requisições HTTP tipadas e interceptação do acesso à API.
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
/**
 * Dependência ({ routes }): contratos e comportamento compartilhados de ./app.routes.
 */
import { routes } from './app.routes';
/**
 * Dependência ({ authInterceptor }): contratos e comportamento compartilhados de ./services/auth.interceptor.
 */
import { authInterceptor } from './services/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
