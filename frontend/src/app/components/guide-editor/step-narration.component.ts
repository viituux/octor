import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GuideService, Step } from '../../services/guide.service';

@Component({
  selector: 'app-step-narration', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section style="padding:12px;background:var(--bg-main);border:1px solid var(--border-color);border-radius:8px;color:var(--text-main)">
      <strong>Narração deste passo</strong>
      <p *ngIf="!readOnly" style="font-size:12px;color:var(--text-muted)">Grave até 2 minutos. Ao salvar, sua fala será usada para gerar a instrução deste passo. Ouça e revise.</p>
      <audio *ngIf="previewUrl || step.narration_url" [src]="previewUrl || step.narration_url" controls style="width:100%;margin-bottom:10px"></audio>
      <div *ngIf="step.live_narration_url && !step.narration_url && !draft" style="margin-bottom:12px">
        <p style="font-size:12px">Voz gravada durante o procedimento. Ajuste o trecho deste passo em segundos.</p>
        <audio #liveAudio [src]="step.live_narration_url" controls (play)="beginLive(liveAudio)" (timeupdate)="limitLive(liveAudio)" style="width:100%"></audio>
        <div *ngIf="!readOnly" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
          <label>Início <input type="number" min="0" step="0.1" [(ngModel)]="liveStart" style="width:80px"></label>
          <label>Fim <input type="number" min="0" step="0.1" [(ngModel)]="liveEnd" style="width:80px"></label>
        </div>
        <button *ngIf="!readOnly" (click)="saveLiveRange()" [disabled]="saving || recording || requesting">Salvar trecho</button>
      </div>
      <div *ngIf="!readOnly" style="display:flex;gap:8px;flex-wrap:wrap">
        <button *ngIf="!recording" (click)="start()" [disabled]="requesting || saving">{{ requesting ? 'Aguardando microfone...' : (previewUrl || step.narration_url ? 'Regravar' : 'Gravar voz') }}</button>
        <button *ngIf="recording" (click)="stop()">Parar ({{ seconds }}s)</button>
        <button *ngIf="draft && !recording" (click)="save()" [disabled]="saving">{{ saving ? 'Salvando...' : 'Salvar áudio' }}</button>
        <button *ngIf="draft && !recording" (click)="discard()" [disabled]="saving">Descartar gravação</button>
        <button *ngIf="step.narration_url && !recording && !draft" (click)="remove()" [disabled]="saving || requesting">Excluir áudio</button>
      </div>
      <p role="status" style="font-size:12px;margin-bottom:0">{{ message }}</p>
    </section>
  `,
  styles: ['input[type=number]{padding:8px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-main)}button{cursor:pointer;background:var(--primary);color:white;border:0;border-radius:var(--radius-sm);padding:9px 12px}button:disabled{opacity:.5;cursor:default}']
})
export class StepNarrationComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) step!: Step;
  @Input() readOnly = false;
  @ViewChild('liveAudio') liveAudio?: ElementRef<HTMLAudioElement>;
  liveStart = 0; liveEnd = 0;
  @Output() narrationSaved = new EventEmitter<Step>();
  @Output() updated = new EventEmitter<Step>();
  recording = false; requesting = false; saving = false; seconds = 0; message = '';
  previewUrl = ''; draft: Blob | null = null;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;

  constructor(private guides: GuideService) {}
  ngOnChanges(): void {
    this.reset();
    const range = this.step.annotations?.find(item => item.type === 'live_narration');
    this.liveStart = range?.start || 0; this.liveEnd = range?.end || 0;
  }
  beginLive(audio: HTMLAudioElement): void { audio.currentTime = Math.max(0, Number(this.liveStart) || 0); }
  limitLive(audio: HTMLAudioElement): void { if (!audio.paused && audio.currentTime >= this.liveEnd) audio.pause(); }
  saveLiveRange(): void {
    if (this.saving) return;
    const start = Number(this.liveStart), end = Number(this.liveEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      this.message = 'Informe um início válido e um fim maior que o início.'; return;
    }
    const annotations = (this.step.annotations || []).filter(item => item.type !== 'live_narration');
    annotations.push({ type: 'live_narration', start, end });
    const version = this.generation; this.saving = true;
    this.guides.updateStep(this.step.id, { annotations }).subscribe({
      next: updated => {
        if (version !== this.generation) return;
        Object.assign(this.step, updated); this.saving = false; this.message = 'Trecho salvo.'; this.updated.emit(updated); this.narrationSaved.emit(updated);
      },
      error: () => { if (version === this.generation) { this.saving = false; this.message = 'Não foi possível salvar o trecho. Tente novamente.'; } }
    });
  }
  ngOnDestroy(): void { this.reset(); }

  private release(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.recording = false;
  }
  private reset(): void {
    this.generation++;
    this.liveAudio?.nativeElement.pause();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null; this.recorder.ondataavailable = null;
      this.recorder.stop();
    }
    this.release(); this.recorder = undefined; this.requesting = false; this.saving = false;
    this.discard(); this.message = '';
  }
  discard(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = ''; this.draft = null;
  }
  async start(): Promise<void> {
    if (this.requesting || this.recording || this.saving) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.message = 'Use Chrome ou Edge em localhost ou HTTPS para gravar.'; return;
    }
    const version = ++this.generation;
    this.requesting = true; this.message = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Formato de gravação não suportado neste navegador.');
      const recorder = new MediaRecorder(stream, { mimeType });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (version !== this.generation) return;
        this.generation++; this.release(); this.message = 'Erro no microfone. Tente gravar novamente.';
      };
      recorder.onstop = () => {
        if (version !== this.generation) return;
        this.release();
        const audio = new Blob(chunks, { type: recorder.mimeType });
        if (!audio.size) { this.message = 'A gravação ficou vazia. Tente novamente.'; return; }
        if (audio.size > 15 * 1024 * 1024) { this.message = 'Áudio muito grande. Grave um trecho menor.'; return; }
        this.discard(); this.draft = audio; this.previewUrl = URL.createObjectURL(audio);
        this.message = 'Ouça a gravação e clique em Salvar áudio.';
      };
      recorder.start(); this.recording = true; this.seconds = 0;
      this.timer = setInterval(() => { this.seconds++; if (this.seconds >= 120) this.stop(); }, 1000);
      this.message = 'Gravando sua voz...';
    } catch (error: any) {
      if (version !== this.generation) return;
      this.release();
      this.message = error?.name === 'NotAllowedError' ? 'Permita o acesso ao microfone e tente novamente.' : (error?.message || 'Não foi possível acessar o microfone.');
    } finally { if (version === this.generation) this.requesting = false; }
  }
  stop(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    // Release the microphone immediately; the final data event still supplies the audio.
    this.release();
  }
  save(): void {
    if (!this.draft || this.saving) return;
    this.persist(false);
  }
  remove(): void { if (!this.saving) this.persist(true); }
  private persist(remove: boolean): void {
    const version = this.generation; this.saving = true;
    const operation = remove ? this.guides.deleteNarration(this.step.id) : this.guides.saveNarration(this.step.id, this.draft!);
    operation.subscribe({
      next: updated => {
        if (version !== this.generation) return;
        Object.assign(this.step, updated); this.discard(); this.saving = false;
        this.message = remove ? 'Áudio excluído.' : 'Áudio salvo.'; this.updated.emit(updated); if (!remove) this.narrationSaved.emit(updated);
      },
      error: () => {
        if (version !== this.generation) return;
        this.saving = false; this.message = 'Não foi possível salvar. Sua gravação continua disponível para tentar novamente.';
      }
    });
  }
}
