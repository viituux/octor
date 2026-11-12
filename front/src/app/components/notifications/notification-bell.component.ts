/** Contador discreto na biblioteca; polling é cancelado ao sair do componente. */
import {Component,OnInit,OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {Subscription,timer,exhaustMap,catchError,EMPTY} from 'rxjs';
import {NotificationService} from '../../services/notification.service';
import {OctorIconComponent} from '../shared/octor-icon.component';
@Component({selector:'app-notification-bell',standalone:true,imports:[CommonModule,RouterModule,OctorIconComponent],template:`<a routerLink="/notifications" [attr.aria-label]="'Notificações'+(unread?' · '+unread+' não lidas':'')"><octor-icon name="bell"></octor-icon><span *ngIf="unread" class="count">{{unread>99?'99+':unread}}</span></a>`,styles:[`:host{display:inline-flex}a{position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid var(--border-color);border-radius:10px;color:var(--text-main);background:var(--bg-surface);text-decoration:none}a:hover{background:var(--bg-sidebar)}a:focus-visible{outline:3px solid var(--primary);outline-offset:3px}.count{position:absolute;top:-6px;right:-7px;background:var(--ui-0284c7);color:var(--on-primary);border-radius:20px;padding:2px 5px;font-size:10px;min-width:14px;text-align:center}`]})
export class NotificationBellComponent implements OnInit,OnDestroy {
  unread=0;private subscription?:Subscription;
  constructor(private service:NotificationService){}
  ngOnInit(){this.subscription=timer(0,60000).pipe(exhaustMap(()=>this.service.list().pipe(catchError(()=>EMPTY)))).subscribe(data=>this.unread=data.unread_count);}
  ngOnDestroy(){this.subscription?.unsubscribe();}
}
