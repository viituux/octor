import { HttpClient } from '@angular/common/http';
import { Directive, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

/** Converte mídia privada em uma URL local, liberada ao trocar o arquivo ou sair da tela. */
@Directive({ selector: '[octorMedia]', exportAs: 'octorMedia', standalone: true })
export class OctorMediaDirective implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private request?: Subscription;
  private objectUrl?: string;

  readonly source = signal<string | null>(null);
  readonly failed = signal(false);
  @Output() readonly mediaReady = new EventEmitter<string>();

  @Input() set octorMedia(value: string | null | undefined) {
    this.release();
    this.source.set(null);
    this.failed.set(false);
    if (!value) return;

    const api = new URL(this.auth.apiBase);
    let destination: URL;
    try {
      destination = new URL(value, api.origin);
    } catch {
      this.failed.set(true);
      return;
    }
    if (!destination.pathname.startsWith(api.pathname + 'guides/media/')) {
      this.show(value);
      return;
    }
    if (destination.origin !== api.origin) {
      this.failed.set(true);
      return;
    }
    this.request = this.http.get(destination.href, { responseType: 'blob' }).subscribe({
      next: blob => {
        this.objectUrl = URL.createObjectURL(blob);
        this.show(this.objectUrl);
      },
      error: () => this.failed.set(true),
    });
  }

  private show(url: string): void {
    this.source.set(url);
    this.mediaReady.emit(url);
  }

  private release(): void {
    this.request?.unsubscribe();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
  }

  ngOnDestroy(): void {
    this.release();
  }
}
