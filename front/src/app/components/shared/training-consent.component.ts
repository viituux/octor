import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

interface TrainingTerm {
  version: string;
  title: string;
  text: string;
  accepted: boolean;
}

@Component({
  selector: 'app-training-consent',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p *ngIf="loading" role="status">Carregando o termo sobre dados do treinamento…</p>
    <p *ngIf="error" role="alert">{{error}} <button type="button" (click)="load()">Tentar novamente</button></p>
    <div class="term" *ngIf="term && !alreadyAccepted">
      <details><summary>{{term.title}} · v{{term.version}}</summary><p>{{term.text}}</p></details>
      <label><input #accept type="checkbox" (change)="change(accept.checked)"> Li e aceito o termo sobre os dados do treinamento.</label>
    </div>
  `,
  styles: [`
    :host { display: block; margin: 12px 0; color: var(--text-main); }
    :host:empty { display: none; }
    .term { padding: var(--training-term-padding, 10px); border: 1px solid var(--training-term-border,var(--border-color)); border-radius: 8px; background: var(--training-term-bg, transparent); }
    p, label, summary { font-size: .85rem; line-height: 1.5; }
    p { margin: 0 0 8px; }
    details p { margin-top: 8px; }
    summary { cursor: pointer; font-weight: 600; color:var(--training-term-link,inherit); }
    label { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; }
    input { margin-top: 2px; width:18px; height:18px; flex:none; accent-color:var(--accent); }
  `],
})
export class TrainingConsentComponent implements OnInit {
  @Input() useSaved = false;
  @Output() versionChange = new EventEmitter<string>();
  term: TrainingTerm | null = null;
  loading = true;
  error = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  get alreadyAccepted() { return !!this.useSaved && !!this.term?.accepted; }

  ngOnInit() { void this.load(); }

  async load() {
    this.loading = true;
    this.error = '';
    this.term = null;
    this.versionChange.emit('');
    try {
      this.term = await firstValueFrom(this.http.get<TrainingTerm>(this.auth.apiBase + 'auth/training-consent/'));
      if (this.alreadyAccepted) this.versionChange.emit(this.term.version);
    } catch {
      this.error = 'Não foi possível carregar o termo.';
    } finally {
      this.loading = false;
    }
  }

  change(accepted: boolean) {
    this.versionChange.emit(accepted ? this.term?.version || '' : '');
  }
}
