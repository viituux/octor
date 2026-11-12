import { API_BASE } from '../api-config';
/** Contratos dos avisos internos, sempre filtrados pelo destinatário na API. */
import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
export interface OctorNotification {id:number;kind:string;title:string;message:string;path:string;read_at:string|null;created_at:string;}
export interface NotificationPage {count:number;next:string|null;previous:string|null;unread_count:number;results:OctorNotification[];}
@Injectable({providedIn:'root'})
export class NotificationService {
  private url=API_BASE + '/auth/notifications/';
  constructor(private http:HttpClient){}
  list(page=1,unread=false){return this.http.get<NotificationPage>(this.url,{params:{page,unread:String(unread)}});}
  read(id:number){return this.http.post<{unread_count:number}>(this.url+id+'/read/',{});}
  readAll(){return this.http.post<{unread_count:number}>(this.url+'read-all/',{});}
}
