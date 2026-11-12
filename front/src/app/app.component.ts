import {AppDialogComponent} from './components/shared/app-dialog.component';
/** Componente raiz: mantém a navegação e o host compartilhado dos diálogos de confirmação. */
/**
 * Dependência ({ Component }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component } from '@angular/core';
/**
 * Dependência ({ RouterOutlet }): rotas, parâmetros e navegação entre as telas.
 */
import { RouterOutlet } from '@angular/router';
@Component({selector: 'app-root', standalone: true, imports: [RouterOutlet,AppDialogComponent], template: '<div class="bg-tentacle" aria-hidden="true"></div><router-outlet></router-outlet><app-dialog></app-dialog>', styles: [':host { display: block; isolation: isolate; }']})
export class AppComponent {}
