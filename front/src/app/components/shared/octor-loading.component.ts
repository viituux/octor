import { Component } from '@angular/core';

/** Indicador decorativo. O texto ao lado identifica a operação em andamento. */
@Component({
  selector: 'app-octor-loading',
  standalone: true,
  host: { 'aria-hidden': 'true' },
  template: '<img src="assets/img/brand/octor-loading.jpg" alt="" width="637" height="605">',
  styles: [`
    :host {
      display: inline-block;
      width: var(--octor-loading-size, 1.5rem);
      line-height: 0;
      vertical-align: middle;
      margin-inline-end: .4em;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      /* O xadrez faz parte do JPEG. O recorte exibe só o disco. */
      clip-path: ellipse(44.5% 46.8% at 49.45% 50.4%);
      animation: octor-spin 1.8s linear infinite;
    }
    @keyframes octor-spin { to { transform: rotate(1turn); } }
    @media (prefers-reduced-motion: reduce), print { img { animation: none; } }
  `],
})
export class OctorLoadingComponent {}
