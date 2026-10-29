import { Component, Output, EventEmitter } from '@angular/core';
@Component({selector:'app-settings-modal',standalone:true,template:'<p>As instruções de geração estão disponíveis em cada captura.</p><button (click)="close.emit()">Fechar</button>'})
export class SettingsModalComponent { @Output() close = new EventEmitter<void>(); }
