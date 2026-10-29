import {Injectable} from '@angular/core';
import {HttpClient,HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
export interface QuizOption{text:string;correct:boolean}
export interface QuizQuestion{statement:string;explanation:string;alternatives:QuizOption[]}
export interface Training{id:number;guide:number;title:string;description:string;status:string;max_attempts:number;version:number|null;draft_questions?:QuizQuestion[];progress?:any;content?:any;summary?:any;participants?:any[]}
export function trainingError(e:any):string{const flatten=(x:any):string=>typeof x==='string'?x:Array.isArray(x)?x.map(flatten).join(' '):x&&typeof x==='object'?Object.entries(x).map(([k,v])=>k+': '+flatten(v)).join(' '):'';return flatten(e?.error)||'Não foi possível concluir a operação. Tente novamente.';}
@Injectable({providedIn:'root'})
export class TrainingService{
 private base='http://localhost:8000/api/trainings/';
 constructor(private http:HttpClient){}
 capabilities(){return this.http.get<{can_manage:boolean}>(this.base+'capabilities/');}
 mine(){return this.http.get<Training[]>(this.base);}
 get(id:number){return this.http.get<Training>(this.base+id+'/');}
 action(id:number,action:string,data:any={}){return this.http.post<any>(this.base+id+'/'+action+'/',data);}
 adminList(filters:any={}){return this.http.get<any[]>(this.base+'admin/',{params:this.params(filters)});}
 adminGet(id:number,filters:any={}){return this.http.get<Training>(this.base+'admin/'+id+'/',{params:this.params(filters)});}
 create(data:any){return this.http.post<Training>(this.base+'admin/',data);}
 update(id:number,data:any){return this.http.patch<Training>(this.base+'admin/'+id+'/',data);}
 manage(id:number,action:string,data:any={}){return this.http.post<any>(this.base+'admin/'+id+'/'+action+'/',data);}
 inspect(id:number,user:number){return this.http.get<any>(this.base+'admin/'+id+'/participants/'+user+'/');}
 dashboard(filters:any={}){return this.http.get<any>(this.base+'admin/dashboard/',{params:this.params(filters)});}
 private params(filters:any){let params=new HttpParams();for(const [key,value] of Object.entries(filters))if(value!==''&&value!==null&&value!==undefined)params=params.set(key,String(value));return params;}
}
