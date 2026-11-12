/** Host único: o elemento dialog oferece foco contido e fundo inerte nativamente. */
import {Component,ViewChild,ElementRef,effect,OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DialogService} from '../../services/dialog.service';
@Component({selector:'app-dialog',standalone:true,imports:[CommonModule],template:`
<dialog #dialog aria-labelledby="octor-dialog-title" aria-describedby="octor-dialog-description" (cancel)="cancel($event)" (close)="nativeClose()" (click)="backdrop($event)" (keydown)="onKey($event)">
 <ng-container *ngIf="dialogs.current() as data"><div class="dialog-heading"><span class="dialog-label">OCTOR</span><button type="button" class="close" aria-label="Fechar diálogo" (click)="dialogs.close(false)">×</button></div>
 <h2 id="octor-dialog-title">{{data.title}}</h2><p id="octor-dialog-description">{{data.message}}</p>
 <footer><button type="button" class="cancel" *ngIf="data.showCancel" (click)="dialogs.close(false)">{{data.cancelText}}</button><button type="button" class="confirm" [class.danger]="data.danger" (click)="dialogs.close(true)">{{data.confirmText}}</button></footer></ng-container>
</dialog>`,styleUrls:['./app-dialog.component.css']})
export class AppDialogComponent implements OnDestroy {
  @ViewChild('dialog',{static:true}) element!:ElementRef<HTMLDialogElement>;
  private previousFocus:HTMLElement|null=null;
  constructor(public dialogs:DialogService){
    effect(()=>{const request=this.dialogs.current();queueMicrotask(()=>{
      const dialog=this.element?.nativeElement;if(!dialog||this.dialogs.current()!==request)return;
      if(request){if(!dialog.open){this.previousFocus=document.activeElement as HTMLElement;dialog.showModal();}(dialog.querySelector(request.showCancel?'.cancel':'.confirm') as HTMLElement)?.focus();}
      else if(dialog.open){dialog.close();if(this.previousFocus?.isConnected)this.previousFocus.focus();this.previousFocus=null;}
    });});
  }
  /** Mantém Tab e Shift+Tab nos controles, inclusive ao alcançar o último botão. */
  onKey(event:KeyboardEvent){
    if(event.key!=='Tab')return;
    const buttons=Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const first=buttons[0],last=buttons[buttons.length-1];if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  cancel(event:Event){event.preventDefault();this.dialogs.close(false);}
  nativeClose(){if(!this.element.nativeElement.open)this.dialogs.close(false);}
  backdrop(event:MouseEvent){const el=this.element.nativeElement;if(event.target!==el)return;const r=el.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.dialogs.close(false);}
  ngOnDestroy(){this.dialogs.close(false);}
}
