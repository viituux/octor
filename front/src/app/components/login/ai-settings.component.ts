import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { DialogService } from '../../services/dialog.service';

interface AIConnectionStatus {
  gemini_configured: boolean;
}

interface AIConnectionPatch {
  gemini_key?: string | null;
}

@Component({
  selector: 'app-ai-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-settings.component.html',
  styleUrls: ['../trainings/trainings.css'],
  styles: ['.ai-settings fieldset { margin: 0 0 20px; } .ai-settings legend { font-size: 1rem; margin-bottom: 0; }'],
})
export class AISettingsComponent implements OnChanges, OnDestroy {
  @Input() workspaceId: number | null = null;
  @Input() scopeName = '';
  private requestRevision = 0;
  status: AIConnectionStatus | null = null;
  geminiKey = '';
  busy = false;
  error = '';
  notice = '';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private dialogs: DialogService,
  ) {}

  ngOnChanges() { void this.load(); }

  ngOnDestroy() { this.requestRevision++; }

  private get endpoint() {
    return this.auth.apiBase + 'ai/connections/' + (this.workspaceId ? 'workspaces/' + this.workspaceId + '/' : '');
  }

  async load() {
    const revision = ++this.requestRevision;
    this.status = null;
    this.geminiKey = '';
    this.error = this.notice = '';
    this.busy = true;
    try {
      const status = await firstValueFrom(this.http.get<AIConnectionStatus>(this.endpoint));
      if (revision !== this.requestRevision) return;
      this.status = status;
    } catch {
      if (revision === this.requestRevision) this.error = 'Não foi possível carregar as conexões de IA.';
    } finally {
      if (revision === this.requestRevision) this.busy = false;
    }
  }

  async save() {
    if (this.busy || !this.status) return;
    const key = this.geminiKey.trim();
    if (!key) return;
    const changes: AIConnectionPatch = {gemini_key: key};
    await this.update(changes);
  }

  async remove() {
    if (this.busy) return;
    const revision = this.requestRevision;
    const confirmed = await this.dialogs.confirm('Remover a chave própria deste espaço? A função voltará à configuração padrão do OCTOR, quando disponível.', {
      title: 'Remover chave', confirmText: 'Remover chave', danger: true,
    });
    if (confirmed && !this.busy && revision === this.requestRevision) await this.update({gemini_key: null});
  }

  private async update(changes: AIConnectionPatch) {
    const revision = ++this.requestRevision;
    this.busy = true;
    this.error = this.notice = '';
    try {
      const status = await firstValueFrom(this.http.patch<AIConnectionStatus>(this.endpoint, changes));
      if (revision !== this.requestRevision) return;
      this.status = status;
      this.geminiKey = '';
      this.notice = 'Configuração de IA salva.';
    } catch (error) {
      if (revision !== this.requestRevision) return;
      const detail = (error as {error?: {detail?: unknown}})?.error?.detail;
      this.error = typeof detail === 'string' ? detail : 'Não foi possível salvar. Confira os campos.';
    } finally {
      if (revision === this.requestRevision) this.busy = false;
    }
  }
}
