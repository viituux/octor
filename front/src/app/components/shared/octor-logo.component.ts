import { Component, Input } from '@angular/core';

/** Identidade visual compartilhada; o enquadramento remove apenas a margem transparente do recurso. */
@Component({
  selector: 'app-octor-logo', standalone: true,
  template: `<span class="wordmark" [style.width.px]="width"><img src="assets/img/brand/octor-logo.png" alt="OCTOR" decoding="async"></span>`,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; max-width: 100%; }
    .wordmark { display: block; position: relative; overflow: hidden; max-width: 100%; aspect-ratio: 1924 / 463; }
    img { position: absolute; width: 112.89%; max-width: none; height: auto; left: -6.705%; top: -33.91%; filter: var(--brand-logo-filter, none); }
    @media print { img { filter: none !important; } }
  `]
})
export class OctorLogoComponent { @Input() width = 132; }
