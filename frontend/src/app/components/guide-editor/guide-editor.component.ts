import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { GuideService, Guide, Step, VideoJob } from '../../services/guide.service';
import { AuthService } from '../../services/auth.service';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';

@Component({
  selector: 'app-guide-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SettingsModalComponent],
  template: `
    <div style="height: 100vh; display: flex; flex-direction: column; background: var(--bg-main); overflow: hidden;">
      
      <!-- Top Navbar -->
      <header style="height: 56px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <a routerLink="/guides" style="color: #94a3b8; font-size: 13px; display: flex; align-items: center; gap: 4px;">
            ← Meus Guias
          </a>
          <span style="color: #334155;">|</span>
          <input 
            type="text" 
            [(ngModel)]="guideTitle" 
            (blur)="saveGuideTitle()"
            style="background: #1a233a; border: 1px solid var(--border-color); color: #fff; font-size: 15px; font-weight: 600; padding: 4px 10px; border-radius: 6px; outline: none; width: 320px;"
          />
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <!-- Botão Configurações de IA -->
          <button 
            (click)="showSettings = true"
            style="background: #1e293b; border: 1px solid var(--border-color); color: #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;"
          >
            ⚙️ Chaves de IA
          </button>

          <!-- Botão IA -->
          <button 
            (click)="generateAiText()" 
            [disabled]="isAiGenerating"
            style="background: #3b0764; border: 1px solid #7e22ce; color: #d8b4fe; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;"
          >
            <span>✨</span>
            <span>{{ isAiGenerating ? 'IA Gerando...' : 'Gerar com IA' }}</span>
          </button>

          <!-- Botão Vídeo -->
          <button 
            (click)="triggerVideoJob()"
            [disabled]="isVideoRendering"
            style="background: #0284c7; border: none; color: #fff; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;"
          >
            <span>🎬</span>
            <span>{{ isVideoRendering ? ('Vídeo (' + videoJobProgress + '%)') : 'Gerar Vídeo' }}</span>
          </button>

          <!-- Exportar -->
          <button 
            (click)="exportHtml()"
            style="background: #1e293b; border: 1px solid var(--border-color); color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 13px; cursor: pointer;"
          >
            📄 Exportar
          </button>
        </div>
      </header>

      <!-- Modal de Configurações -->
      <app-settings-modal *ngIf="showSettings" (close)="showSettings = false"></app-settings-modal>

      <!-- Main Editor 3-Column Layout -->
      <div style="flex: 1; display: flex; overflow: hidden;">
        
        <!-- COLUNA ESQUERDA: LISTA DE PASSOS -->
        <aside style="width: 280px; border-right: 1px solid var(--border-color); background: #0c1322; display: flex; flex-direction: column;">
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Passos ({{ guide?.steps?.length || 0 }})</span>
          </div>

          <div style="flex: 1; overflow-y: auto; padding: 12px;">
            <div 
              *ngFor="let step of guide?.steps; let idx = index"
              (click)="selectStep(step)"
              [style.background]="selectedStep?.id === step.id ? '#1e293b' : 'transparent'"
              [style.borderColor]="selectedStep?.id === step.id ? '#38bdf8' : 'var(--border-color)'"
              style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; margin-bottom: 10px; cursor: pointer; display: flex; gap: 10px; transition: all 0.15s;"
            >
              <!-- Miniatura -->
              <div style="width: 54px; height: 38px; background: #020617; border-radius: 4px; overflow: hidden; flex-shrink: 0; position: relative; border: 1px solid #1e293b;">
                <img *ngIf="step.screenshot_url" [src]="step.screenshot_url" style="width: 100%; height: 100%; object-fit: cover;" />
                <span style="position: absolute; bottom: 2px; left: 2px; font-size: 9px; font-weight: 700; background: rgba(0,0,0,0.8); color: #fff; padding: 1px 4px; border-radius: 2px;">
                  #{{ idx + 1 }}
                </span>
              </div>

              <!-- Descrição curta -->
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 12px; font-weight: 500; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {{ step.text || (step.action_type + ' em ' + (step.element_text || 'elemento')) }}
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                  {{ step.action_type | uppercase }}
                </div>
              </div>

              <!-- Excluir passo -->
              <button 
                (click)="deleteStep(step.id, $event)"
                title="Excluir passo"
                style="background: none; border: none; color: #ef4444; font-size: 14px; cursor: pointer; align-self: flex-start; padding: 2px 6px;"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>

        <!-- COLUNA CENTRAL: CANVAS / VISUALIZADOR DA TELA COM HOTSPOT -->
        <main style="flex: 1; background: #050811; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; padding: 20px;">
          
          <div *ngIf="!selectedStep" style="color: #64748b; font-size: 14px;">
            Selecione um passo na lista lateral para editar.
          </div>

          <div *ngIf="selectedStep" style="position: relative; max-width: 100%; max-height: 100%; display: flex; align-items: center; justify-content: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color);">
            <img 
              #screenshotImg
              [src]="selectedStep.screenshot_url" 
              alt="Screenshot do passo" 
              style="max-width: 100%; max-height: calc(100vh - 120px); display: block; object-fit: contain;"
            />

            <!-- Marcador / Hotspot do Clique -->
            <div 
              *ngIf="selectedStep.click_x !== undefined && selectedStep.click_y !== undefined && selectedStep.click_x !== null"
              [style.left.px]="selectedStep.click_x"
              [style.top.px]="selectedStep.click_y"
              style="position: absolute; transform: translate(-50%, -50%); pointer-events: none;"
            >
              <div style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ef4444; background: rgba(239, 68, 68, 0.25); animation: pulse 1.5s infinite; box-shadow: 0 0 15px rgba(239, 68, 68, 0.8);"></div>
              <div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; white-space: nowrap;">
                Clique
              </div>
            </div>
          </div>

          <!-- Barra de Anotações Flutuante -->
          <div *ngIf="selectedStep" style="position: absolute; bottom: 24px; background: rgba(19, 27, 46, 0.95); backdrop-filter: blur(8px); border: 1px solid var(--border-color); border-radius: 30px; padding: 6px 16px; display: flex; gap: 12px; align-items: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
            <span style="font-size: 12px; color: #94a3b8;">Alvo:</span>
            <span style="font-size: 12px; color: #38bdf8; font-weight: 500;">{{ selectedStep.element_text || selectedStep.selector || 'Elemento' }}</span>
            <span style="color: #334155;">|</span>
            <span style="font-size: 11px; color: #64748b;">URL: {{ selectedStep.url }}</span>
          </div>
        </main>

        <!-- COLUNA DIREITA: EDIÇÃO DO PASSO -->
        <aside style="width: 320px; border-left: 1px solid var(--border-color); background: #0c1322; padding: 20px; display: flex; flex-direction: column;">
          <h3 style="font-size: 14px; font-weight: 600; color: #f8fafc; margin-bottom: 16px;">
            Editar Instrução
          </h3>

          <div *ngIf="selectedStep" style="display: flex; flex-direction: column; gap: 16px; flex: 1;">
            <div>
              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">Texto Explicativo</label>
              <textarea 
                [(ngModel)]="selectedStep.text"
                (ngModelChange)="onStepTextChange()"
                rows="5"
                placeholder="Ex: Clique no botão Salvar no canto superior direito..."
                style="width: 100%; padding: 10px; background: #1a233a; border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px; outline: none; resize: vertical;"
              ></textarea>
            </div>

            <div style="background: #131b2e; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-size: 12px;">
              <div style="color: #94a3b8; margin-bottom: 4px;">Tipo de Ação:</div>
              <div style="color: #38bdf8; font-weight: 600; text-transform: uppercase;">{{ selectedStep.action_type }}</div>
              
              <div *ngIf="selectedStep.input_value" style="margin-top: 8px;">
                <div style="color: #94a3b8; margin-bottom: 4px;">Valor inserido:</div>
                <div style="color: #fff; background: #090d16; padding: 4px 8px; border-radius: 4px;">{{ selectedStep.input_value }}</div>
              </div>

              <div style="margin-top: 8px;">
                <div style="color: #94a3b8; margin-bottom: 4px;">Seletor CSS:</div>
                <div style="color: #cbd5e1; font-family: monospace; font-size: 11px; word-break: break-all;">{{ selectedStep.selector || 'N/A' }}</div>
              </div>
            </div>

            <!-- Video Status Card if Active -->
            <div *ngIf="activeVideoJob" style="background: #1e1b4b; border: 1px solid #4338ca; border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 600; color: #c7d2fe;">Status do Vídeo:</span>
                <span style="font-size: 11px; color: #818cf8; font-weight: 600;">{{ activeVideoJob.progress }}%</span>
              </div>
              <div style="width: 100%; height: 6px; background: #312e81; border-radius: 999px; overflow: hidden;">
                <div [style.width.%]="activeVideoJob.progress" style="height: 100%; background: #6366f1; transition: width 0.3s;"></div>
              </div>
              <div style="font-size: 11px; color: #a5b4fc; margin-top: 6px;">
                {{ activeVideoJob.status }}
              </div>
            </div>

          </div>
        </aside>

      </div>
    </div>
  `
})
export class GuideEditorComponent implements OnInit, OnDestroy {
  guideId!: string;
  guide: Guide | null = null;
  selectedStep: Step | null = null;
  guideTitle = '';
  showSettings = false;
  isAiGenerating = false;
  isVideoRendering = false;
  videoJobProgress = 0;
  activeVideoJob: VideoJob | null = null;
  private pollInterval: any;
  private saveTimeout: any;

  constructor(
    private route: ActivatedRoute,
    private guideService: GuideService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.guideId = this.route.snapshot.paramMap.get('id') || '';
    if (this.guideId) {
      this.loadGuide();
    }
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
  }

  loadGuide(): void {
    this.guideService.getGuide(this.guideId).subscribe({
      next: (data) => {
        this.guide = data;
        this.guideTitle = data.title;
        if (data.steps && data.steps.length > 0) {
          this.selectedStep = data.steps[0];
        }
      },
      error: () => {
        this.router.navigate(['/guides']);
      }
    });
  }

  selectStep(step: Step): void {
    this.selectedStep = step;
  }

  saveGuideTitle(): void {
    if (this.guideTitle && this.guideTitle !== this.guide?.title) {
      this.guideService.updateGuide(this.guideId, { title: this.guideTitle }).subscribe();
    }
  }

  onStepTextChange(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      if (this.selectedStep) {
        this.guideService.updateStep(this.selectedStep.id, { text: this.selectedStep.text }).subscribe();
      }
    }, 600);
  }

  deleteStep(stepId: number, event: Event): void {
    event.stopPropagation();
    if (confirm('Deseja excluir este passo?')) {
      this.guideService.deleteStep(stepId).subscribe(() => {
        if (this.guide && this.guide.steps) {
          this.guide.steps = this.guide.steps.filter(s => s.id !== stepId);
          if (this.selectedStep?.id === stepId) {
            this.selectedStep = this.guide.steps[0] || null;
          }
        }
      });
    }
  }

  generateAiText(): void {
    this.isAiGenerating = true;
    this.guideService.generateAiText(this.guideId).subscribe({
      next: (response: any) => {
        const updatedGuide = response.guide || response;
        this.guide = updatedGuide;
        this.selectedStep = updatedGuide.steps?.find((s: any) => s.id === this.selectedStep?.id) || updatedGuide.steps?.[0] || null;
        this.isAiGenerating = false;
        if (response.ai_warning) {
          alert(`Aviso da IA: ${response.ai_warning}`);
        }
      },
      error: (err) => {
        this.isAiGenerating = false;
        alert('Erro ao chamar API de IA: ' + (err.error?.detail || err.message || 'Verifique sua conexão e chave.'));
      }
    });
  }

  triggerVideoJob(): void {
    this.isVideoRendering = true;
    this.guideService.createVideoJob(this.guideId, { voice: 'default' }).subscribe({
      next: (job) => {
        this.activeVideoJob = job;
        this.pollVideoJob(job.id);
      },
      error: () => {
        this.isVideoRendering = false;
      }
    });
  }

  pollVideoJob(jobId: number): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.guideService.getVideoJob(jobId).subscribe((job) => {
        this.activeVideoJob = job;
        this.videoJobProgress = job.progress;
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(this.pollInterval);
          this.isVideoRendering = false;
          if (job.status === 'completed') {
            alert('Vídeo renderizado com sucesso!');
          }
        }
      });
    }, 2000);
  }

  exportHtml(): void {
    window.print();
  }
}
