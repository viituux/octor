import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService,trainingError} from '../../services/training.service';
import {TrainingNavComponent} from './training-nav.component';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,TrainingNavComponent],templateUrl:'./training-dashboard.component.html',styleUrls:['./trainings.css']})
export class TrainingDashboardComponent implements OnInit{
 data:any=null;trainings:any[]=[];loading=true;error='';training='';start='';end='';rating='';minPercent='';
 constructor(private service:TrainingService){}
 ngOnInit(){this.service.adminList().subscribe({next:items=>this.trainings=items,error:()=>{}});this.load();}
 async load(){this.loading=true;this.error='';try{this.data=await firstValueFrom(this.service.dashboard({training:this.training,start:this.start,end:this.end,rating:this.rating,min_percent:this.minPercent}));}catch(e){this.error=trainingError(e);this.data=null;}finally{this.loading=false;}}
 get points(){const items=this.data?.timeline||[],max=Math.max(1,...items.map((r:any)=>r.completions));return items.map((r:any,i:number)=>(30+(items.length===1?260:i*520/(items.length-1)))+','+(170-r.completions/max*140)).join(' ');}
 get chartSummary(){return (this.data?.timeline||[]).map((r:any)=>r.month+': '+r.completions+' conclusões').join('; ');}
}
