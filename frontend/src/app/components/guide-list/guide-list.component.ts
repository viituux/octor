import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { GuideService, Guide } from '../../services/guide.service';
import { AuthService } from '../../services/auth.service';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';

@Component({
  selector: 'app-guide-list',
  standalone: true,
  imports: [CommonModule, RouterModule, SettingsModalComponent],
  template: `
    <div style="min-height: 100vh; background: var(--bg-main);">
      <!-- Top Navbar -->
      <header style="height: 64px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); display: flex; align-items: center; justify-content: space-between; padding: 0 32px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 20px; font-weight: 700; color: #38bdf8;">⚡ AutoGuide</span>
          <span style="font-size: 12px; background: #233152; color: #94a3b8; padding: 2px 8px; border-radius: 999px;">Painel de Procedimentos</span>
        </div>

        <div style="display: flex; align-items: center; gap: 16px;">
          <button (click)="showSettings = true" style="background: #1e293b; border: 1px solid var(--border-color); color: #cbd5e1; padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            ⚙️ Chaves de IA
          </button>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #94a3b8;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
            <span>Extensão Conectada (:8000)</span>
          </div>
          <span style="color: #64748b;">|</span>
          <span style="font-size: 13px; color: #f8fafc; font-weight: 500;">user: {{ authService.currentUser()?.username || 'admin' }}</span>
          <button (click)="logout()" style="background: none; border: 1px solid var(--border-color); color: #ef4444; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
            Sair
          </button>
        </div>
      </header>

      <!-- Modal de Configurações -->
      <app-settings-modal *ngIf="showSettings" (close)="showSettings = false"></app-settings-modal>

      <!-- Main Container -->
      <main style="max-width: 1200px; margin: 0 auto; padding: 36px 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
          <div>
            <h1 style="font-size: 24px; font-weight: 700; color: #f8fafc;">Meus Guias e Procedimentos</h1>
            <p style="font-size: 14px; color: #94a3b8; margin-top: 4px;">
              Grave tarefas no navegador com a extensão do Chrome ou crie tutoriais manualmente.
            </p>
          </div>

          <div style="display: flex; gap: 12px;">
            <button (click)="loadGuides()" style="padding: 10px 16px; background: #1e293b; border: 1px solid var(--border-color); color: #fff; border-radius: 8px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              🔄 Atualizar
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" style="text-align: center; padding: 60px 0; color: #94a3b8;">
          Carregando procedimentos...
        </div>

        <!-- Empty State -->
        <div *ngIf="!loading && guides.length === 0" style="text-align: center; padding: 80px 20px; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 12px;">
          <div style="font-size: 40px; margin-bottom: 12px;">🎯</div>
          <h3 style="font-size: 18px; font-weight: 600; color: #f8fafc;">Nenhum guia gravado ainda</h3>
          <p style="font-size: 14px; color: #94a3b8; max-width: 480px; margin: 8px auto 20px auto;">
            Abra a extensão AutoGuide no Google Chrome, clique em <b>"Iniciar Gravação"</b> e navegue normalmente. Cada clique gerará um passo automaticamente aqui!
          </p>
        </div>

        <!-- Grid of Guides -->
        <div *ngIf="!loading && guides.length > 0" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px;">
          <div 
            *ngFor="let guide of guides"
            style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, border-color 0.2s;"
          >
            <!-- Thumbnail preview -->
            <div style="height: 160px; background: #0f172a; position: relative; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border-color);">
              <img 
                *ngIf="guide.first_step_screenshot" 
                [src]="guide.first_step_screenshot" 
                alt="Screenshot Preview"
                style="width: 100%; height: 100%; object-fit: cover;"
              />
              <div *ngIf="!guide.first_step_screenshot" style="color: #64748b; font-size: 13px;">
                Sem screenshot
              </div>
              <span style="position: absolute; top: 12px; right: 12px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">
                {{ guide.step_count || 0 }} passos
              </span>
            </div>

            <!-- Card Content -->
            <div style="padding: 18px; flex: 1; display: flex; flex-direction: column;">
              <h3 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 6px;">{{ guide.title }}</h3>
              <p style="font-size: 13px; color: #94a3b8; flex: 1; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                {{ guide.description || 'Sem descrição cadastrada.' }}
              </p>

              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #64748b; border-top: 1px solid var(--border-color); padding-top: 14px;">
                <span>{{ guide.created_at | date:'dd/MM/yyyy HH:mm' }}</span>
                <div style="display: flex; gap: 8px;">
                  <button (click)="deleteGuide(guide.id, $event)" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; padding: 4px;">
                    Excluir
                  </button>
                  <a [routerLink]="['/guides', guide.id]" style="background: #0284c7; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: 500; font-size: 12px;">
                    Abrir Editor ➔
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  `
})
export class GuideListComponent implements OnInit {
  guides: Guide[] = [];
  loading = true;
  showSettings = false;

  constructor(
    private guideService: GuideService,
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadGuides();
  }

  loadGuides(): void {
    this.loading = true;
    this.guideService.getGuides().subscribe({
      next: (data) => {
        this.guides = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  deleteGuide(id: number, event: Event): void {
    event.stopPropagation();
    if (confirm('Deseja realmente excluir este guia?')) {
      this.guideService.deleteGuide(id).subscribe(() => {
        this.guides = this.guides.filter(g => g.id !== id);
      });
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
