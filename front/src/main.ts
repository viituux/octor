/** Bootstrap web: inicializa o componente raiz com os providers da aplicação e encaminha falhas de inicialização ao console. */
/**
 * Dependência ({ bootstrapApplication }): bootstrap da aplicação no navegador.
 */
import { bootstrapApplication } from '@angular/platform-browser';
/**
 * Dependência ({ appConfig }): contratos e comportamento compartilhados de ./app/app.config.
 */
import { appConfig } from './app/app.config';
/**
 * Dependência ({ AppComponent }): contratos e comportamento compartilhados de ./app/app.component.
 */
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
