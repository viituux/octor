/** Escolha local de aparência; sem preferência salva, acompanha o tema do sistema. */
import {Component,Input,OnInit,OnDestroy} from '@angular/core';

@Component({selector:'app-theme-toggle',standalone:true,host:{'[class.inline]':'inline','[class.compact]':'compact'},template:`
  <button type="button" (click)="toggle()" [attr.aria-label]="dark?'Ativar modo claro':'Ativar modo escuro'" [attr.aria-pressed]="dark" [title]="dark?'Ativar modo claro':'Ativar modo escuro'">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="dark ? sun : moon"/></svg>
    <span>{{dark?'Modo claro':'Modo escuro'}}</span>
  </button>`,styles:[`
  :host{position:fixed;right:20px;bottom:20px;z-index:30;display:block}
  :host(.inline){position:static;display:inline-flex;z-index:auto}
  :host(.compact) button{width:44px;padding:10px;justify-content:center}
  :host(.compact) span{display:none}
  button{display:inline-flex;align-items:center;gap:9px;min-height:44px;padding:10px 14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface);color:var(--text-main);box-shadow:var(--shadow-card);font:600 12px var(--font-ui);cursor:pointer}
  button:hover{background:var(--bg-card-hover)}button:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}svg{flex:none}
  @media(max-width:768px){:host{right:12px;bottom:12px}}
  @media print{:host{display:none!important}}
 `]})
export class ThemeToggleComponent implements OnInit,OnDestroy{
  @Input() inline=false;
  @Input() compact=false;
  dark=false;
  readonly moon='M20.5 14.2A8.7 8.7 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z';
  readonly sun='M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
  private media:MediaQueryList|null=null;
  private sync=()=>{const explicit=document.documentElement.getAttribute('data-theme');this.dark=explicit==='dark'||(explicit!=='light'&&!!this.media?.matches);};
  private storage=(event:StorageEvent)=>{
    if(event.key!==null&&event.key!=='octor_theme')return;
    const value=event.newValue;
    if(value==='light'||value==='dark')document.documentElement.setAttribute('data-theme',value);
    else document.documentElement.removeAttribute('data-theme');
    this.sync();
  };
  ngOnInit(){this.media=window.matchMedia('(prefers-color-scheme: dark)');this.sync();this.media.addEventListener('change',this.sync);window.addEventListener('storage',this.storage);}
  ngOnDestroy(){this.media?.removeEventListener('change',this.sync);window.removeEventListener('storage',this.storage);}
  toggle(){
    const theme=this.dark?'light':'dark';document.documentElement.setAttribute('data-theme',theme);document.documentElement.style.colorScheme=theme;this.dark=theme==='dark';
    try{localStorage.setItem('octor_theme',theme);}catch{/* A troca funciona nesta aba mesmo com armazenamento bloqueado. */}
  }
}
