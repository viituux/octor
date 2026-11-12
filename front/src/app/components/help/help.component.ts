import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main>
      <a routerLink="/guides">← Voltar à biblioteca</a>
      <h1>Ajuda do OCTOR</h1>
      <div class="help-grid">
        <section aria-labelledby="faq">
          <h2 id="faq">Perguntas frequentes</h2>
          <details *ngFor="let item of questions"><summary>{{item.question}}</summary><p>{{item.answer}}</p></details>
        </section>
        <section aria-labelledby="report">
          <h2 id="report">Reportar um problema</h2>
          <p>Seu relato será registrado para a equipe de desenvolvimento.</p>
          <form (ngSubmit)="send()">
            <label for="subject">Assunto</label>
            <input id="subject" name="subject" required maxlength="120" [(ngModel)]="subject">
            <label for="description">O que aconteceu?</label>
            <textarea id="description" name="description" required rows="6" maxlength="2000" [(ngModel)]="description"
              placeholder="Informe a tela, os passos e o resultado esperado." aria-describedby="report-hint"></textarea>
            <p id="report-hint">Evite incluir senhas, chaves de API ou dados pessoais de outras pessoas.</p>
            <button type="submit" [disabled]="sending || !subject.trim() || !description.trim()">
              {{sending ? 'Enviando…' : 'Enviar relato'}}
            </button>
            <p *ngIf="receivedId" role="status">Relato #{{receivedId}} registrado para a equipe.</p>
            <p *ngIf="error" role="alert">{{error}}</p>
          </form>
        </section>
      </div>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--text-main)}
    main{max-width:1050px;margin:auto;padding:32px 20px 60px}
    .help-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
    section{padding:22px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface)}
    h2{margin-top:0;font-size:1.2rem}details{border-top:1px solid var(--border-color);padding:14px 0}
    summary{font-weight:600;cursor:pointer}p{line-height:1.55}
    label{display:block;margin:14px 0 6px;font-weight:600}
    input,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-surface);color:inherit;font:inherit}
    textarea{resize:vertical}button{padding:10px 16px;border:1px solid var(--primary);border-radius:8px;background:var(--primary);color:var(--on-primary,#fff);cursor:pointer}
    button:disabled{opacity:.55;cursor:default}a{color:var(--primary)}
    #report-hint{font-size:.85rem;color:var(--text-muted)}[role=alert]{font-weight:600}
    @media(max-width:740px){.help-grid{grid-template-columns:1fr}}
  `],
})
export class HelpComponent {
  readonly questions = [
    {question: 'Onde vejo os treinamentos que recebi?', answer: 'Abra Meus treinamentos e clique em Atualizar lista. Se a atribuição não aparecer, confirme com o responsável se ela foi feita para a conta com que você entrou.'},
    {question: 'Por que o Me guie não abre o sistema?', answer: 'O Me guie interativo exige a extensão Chrome conectada e um ambiente de teste autorizado. Em treinamentos por capturas, siga os passos no próprio OCTOR.'},
    {question: 'Como conecto a extensão?', answer: 'No Chrome, abra o painel lateral do OCTOR e selecione Entrar pelo navegador. Confirme o vínculo na tela Minha conta.'},
    {question: 'Posso fechar a tela enquanto o manual é gerado?', answer: 'Sim. Volte ao Manual por URL para consultar o status. Se a geração falhar, você pode tentar novamente usando as capturas existentes.'},
    {question: 'Como exporto um guia?', answer: 'Abra o guia, clique em Imprimir / PDF e selecione Salvar como PDF na janela do navegador.'},
  ];
  subject = '';
  description = '';
  sending = false;
  receivedId: number | null = null;
  error = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  async send() {
    const subject = this.subject.trim();
    const description = this.description.trim();
    if (!subject || !description || this.sending) return;
    this.sending = true;
    this.error = '';
    this.receivedId = null;
    try {
      const result = await firstValueFrom(this.http.post<{id: number}>(
        this.auth.apiBase + 'auth/support/reports/', {subject, description},
      ));
      this.receivedId = result.id;
      this.subject = '';
      this.description = '';
    } catch (error: any) {
      this.error = error.status === 429
        ? 'Você atingiu o limite de relatos. Tente novamente mais tarde.'
        : 'Não foi possível enviar. Seu texto foi preservado para tentar novamente.';
    } finally {
      this.sending = false;
    }
  }
}
