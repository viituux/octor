/** Central paginada de avisos; leitura e ações só mudam após confirmação da API. */
import {Component,OnInit,DestroyRef,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule,Router} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {NotificationService,OctorNotification} from '../../services/notification.service';
@Component({standalone:true,imports:[CommonModule,RouterModule],templateUrl:'./notifications.component.html',styleUrls:['./notifications.component.css']})
export class NotificationsComponent implements OnInit {
  items:OctorNotification[]=[];loading=false;busy=false;error='';unread=0;onlyUnread=false;page=1;hasNext=false;
  private destroyRef=inject(DestroyRef);private requestVersion=0;
  constructor(private service:NotificationService,private router:Router){}
  ngOnInit(){this.load();}
  /** O identificador evita que respostas antigas substituam um filtro mais recente. */
  load(page=1){const version=++this.requestVersion;this.loading=true;this.error='';this.service.list(page,this.onlyUnread).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:data=>{if(version!==this.requestVersion)return;this.items=data.results;this.unread=data.unread_count;this.page=page;this.hasNext=!!data.next;this.loading=false;},error:()=>{if(version!==this.requestVersion)return;this.loading=false;this.error='Não foi possível carregar as notificações.';}});}
  filter(unread:boolean){this.onlyUnread=unread;this.load();}
  open(item:OctorNotification){if(this.busy)return;if(item.read_at){this.navigate(item);return;}this.busy=true;this.error='';this.service.read(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:data=>{this.busy=false;this.unread=data.unread_count;item.read_at=new Date().toISOString();if(item.path)this.navigate(item);else if(this.onlyUnread)this.load();},error:()=>{this.busy=false;this.error='Não foi possível marcar a notificação como lida. Tente novamente.';}});}
  private navigate(item:OctorNotification){if(item.path.startsWith('/')&&!item.path.startsWith('//'))void this.router.navigateByUrl(item.path);}
  markAll(){if(this.busy||!this.unread)return;this.busy=true;this.error='';this.service.readAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:()=>{this.busy=false;this.load();},error:()=>{this.busy=false;this.error='Não foi possível marcar as notificações como lidas.';}});}
}
