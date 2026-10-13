import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, UserSettings } from '../../services/auth.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="position: fixed; inset: 0; background: rgba(3, 7, 18, 0.75); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;">
      <div style="width: 100%; max-width: 520px; background: #131b2e; border: 1px solid #233152; border-radius: 14px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); overflow: hidden; display: flex; flex-direction: column;">
        
        <!-- Header -->
        <div style="padding: 18px 24px; border-bottom: 1px solid #233152; display: flex; align-items: center; justify-content: space-between; background: #0c1322;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">⚙️</span>
            <h2 style="font-size: 16px; font-weight: 600; color: #f8fafc;">Configurações de IA (Chaves de API)</h2>
          </div>
          <button (click)="close.emit()" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 12px; font-size: 13px; color: #38bdf8;">
            💡 <b>BYOK (Bring Your Own Key):</b> Insira sua própria chave de API. As chamadas externas para geração de passos, imagens e áudio usarão a sua chave diretamente.
          </div>

          <!-- Provedor de Visão / Texto -->
          <div>
            <label style="display: block; font-size: 13px; font-weight: 500; color: #cbd5e1; margin-bottom: 6px;">
              Provedor de IA (Texto & Visão dos Screenshots)
            </label>
            <select 
              [(ngModel)]="settings.llm_provider"
              style="width: 100%; padding: 10px 12px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 13px; outline: none; margin-bottom: 10px;"
            >
              <option value="gemini">Google Gemini (Recomendado - 2.5 Flash)</option>
              <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
              <option value="anthropic">Anthropic Claude (Claude 3.5)</option>
            </select>

            <div style="position: relative;">
              <input 
                [type]="showLlmKey ? 'text' : 'password'"
                [(ngModel)]="newllmKey"
                [placeholder]="settings.llm_api_key_masked ? ('Chave atual: ' + settings.llm_api_key_masked) : 'Cole sua chave de API aqui...'"
                style="width: 100%; padding: 10px 40px 10px 12px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 13px; outline: none;"
              />
              <button 
                type="button" 
                (click)="showLlmKey = !showLlmKey" 
                style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px;"
              >
                {{ showLlmKey ? 'Ocultar' : 'Ver' }}
              </button>
            </div>
          </div>

          <!-- Provedor de Voz / TTS -->
          <div>
            <label style="display: block; font-size: 13px; font-weight: 500; color: #cbd5e1; margin-bottom: 6px;">
              Provedor de Voz (TTS para os Vídeos)
            </label>
            <select 
              [(ngModel)]="settings.tts_provider"
              style="width: 100%; padding: 10px 12px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 13px; outline: none; margin-bottom: 10px;"
            >
              <option value="gemini">Google Gemini Speech</option>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>

            <div style="position: relative;">
              <input 
                [type]="showTtsKey ? 'text' : 'password'"
                [(ngModel)]="newTtsKey"
                [placeholder]="settings.tts_api_key_masked ? ('Chave atual: ' + settings.tts_api_key_masked) : 'Cole sua chave de voz (opcional)...'"
                style="width: 100%; padding: 10px 40px 10px 12px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 13px; outline: none;"
              />
              <button 
                type="button" 
                (click)="showTtsKey = !showTtsKey" 
                style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px;"
              >
                {{ showTtsKey ? 'Ocultar' : 'Ver' }}
              </button>
            </div>
          </div>

          <div *ngIf="successMessage" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; padding: 10px; border-radius: 6px; font-size: 13px;">
            {{ successMessage }}
          </div>

          <div *ngIf="errorMessage" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; padding: 10px; border-radius: 6px; font-size: 13px;">
            {{ errorMessage }}
          </div>

        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; border-top: 1px solid #233152; display: flex; justify-content: flex-end; gap: 10px; background: #0c1322;">
          <button (click)="close.emit()" style="padding: 8px 16px; background: #1e293b; border: 1px solid #233152; color: #cbd5e1; border-radius: 6px; font-size: 13px; cursor: pointer;">
            Cancelar
          </button>
          <button (click)="saveSettings()" [disabled]="saving" style="padding: 8px 18px; background: #0284c7; border: none; color: #fff; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
            {{ saving ? 'Salvando...' : 'Salvar Chaves' }}
          </button>
        </div>

      </div>
    </div>
  `
})
export class SettingsModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  settings: UserSettings = {
    llm_provider: 'gemini',
    llm_api_key_masked: '',
    tts_provider: 'gemini',
    tts_api_key_masked: '',
  };

  newllmKey = '';
  newTtsKey = '';
  showLlmKey = false;
  showTtsKey = false;
  saving = false;
  successMessage = '';
  errorMessage = '';

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.getSettings().subscribe({
      next: (data) => {
        this.settings = data;
      },
      error: (err) => {
        console.error('Erro ao carregar configurações:', err);
      }
    });
  }

  saveSettings(): void {
    this.saving = true;
    this.successMessage = '';
    this.errorMessage = '';

    const payload: any = {
      llm_provider: this.settings.llm_provider,
      tts_provider: this.settings.tts_provider,
    };

    if (this.newllmKey.trim()) {
      payload.llm_api_key = this.newllmKey.trim();
    }
    if (this.newTtsKey.trim()) {
      payload.tts_api_key = this.newTtsKey.trim();
    }

    this.authService.updateSettings(payload).subscribe({
      next: (res) => {
        this.settings = res;
        this.newllmKey = '';
        this.newTtsKey = '';
        this.saving = false;
        this.successMessage = 'Configurações e chaves salvas com sucesso!';
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      error: () => {
        this.errorMessage = 'Erro ao salvar configurações.';
        this.saving = false;
      }
    });
  }
}
