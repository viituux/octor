/** Módulo front/src/app/components/settings-modal/settings-modal.component.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
/**
 * Dependência ({ Component, Output, EventEmitter }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component, Output, EventEmitter } from '@angular/core';
@Component({selector:'app-settings-modal',standalone:true,template:'<p>As instruções de geração estão disponíveis em cada captura.</p><button (click)="close.emit()">Fechar</button>'})
export class SettingsModalComponent { @Output() close = new EventEmitter<void>(); }
