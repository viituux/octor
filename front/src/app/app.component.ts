/** Componente raiz: entrega a área de navegação ao RouterOutlet, sem mascote ou efeitos de reprodução adicionais. */
/**
 * Dependência ({ Component }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component } from '@angular/core';
/**
 * Dependência ({ RouterOutlet }): rotas, parâmetros e navegação entre as telas.
 */
import { RouterOutlet } from '@angular/router';
@Component({selector: 'app-root', standalone: true, imports: [RouterOutlet], template: '<router-outlet></router-outlet>', styles: [':host { display: block; }']})
export class AppComponent {}
