/** Gestão de procedimentos publicados, participantes e avaliações; sem cadastro de perguntas. */
import {Component,OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterModule} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {TrainingService,Training,trainingError} from '../../services/training.service';
import {GuideService,Guide} from '../../services/guide.service';
import {TrainingNavComponent} from './training-nav.component';

@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,TrainingNavComponent],
  templateUrl:'./training-admin.component.html',styleUrls:['./trainings.css']})
export class TrainingAdminComponent implements OnInit {
  id=0;view:'list'|'edit'='list';items:any[]=[];guides:Guide[]=[];training:Training|null=null;
  loading=true;busy=false;error='';notice='';title='';description='';guideId:number|null=null;
  emails='';inspection:any=null;start='';end='';rating='';
  constructor(private service:TrainingService,private guidesService:GuideService,private route:ActivatedRoute,private router:Router){}
  ngOnInit(){this.id=Number(this.route.snapshot.paramMap.get('id'))||0;this.view=this.route.snapshot.data['editor']?'edit':'list';this.load();}
  filters(){return {start:this.start,end:this.end,rating:this.rating};}
  /** Carrega apenas guias elegíveis e os dados administrativos autorizados pela API. */
  async load(){
    this.loading=true;this.error='';
    try {
      if(this.view==='list')this.items=await firstValueFrom(this.service.adminList(this.filters()));
      else {
        const [guides,spaces]=await Promise.all([firstValueFrom(this.guidesService.getGuides()),firstValueFrom(this.guidesService.workspaces())]);
        this.guides=guides.filter(g=>g.can_edit!==false||spaces.some(w=>w.role==='owner'&&w.id===g.workspace&&g.status==='published'));
        if(this.id){
          this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));
          this.title=this.training.title;this.description=this.training.description;this.guideId=this.training.guide;
        }else{
          const source=Number(this.route.snapshot.queryParamMap.get('guide')),guide=this.guides.find(g=>g.id===source);
          if(guide){this.guideId=guide.id;this.title=guide.title;this.description=guide.description;}
        }
      }
    }catch(e){this.error=trainingError(e);}finally{this.loading=false;}
  }
  /** Salva os dados do procedimento; erro mantém o rascunho e impede a publicação seguinte. */
  async save(){
    if(this.busy)return;this.busy=true;this.error='';this.notice='';
    try{
      const data={guide:this.guideId,title:this.title,description:this.description};
      this.training=await firstValueFrom(this.id?this.service.update(this.id,data):this.service.create(data));
      if(!this.id){await this.router.navigate(['/training-admin',this.training.id]);return;}
      this.notice='Rascunho salvo. Publique uma nova versão para disponibilizar as alterações.';
    }catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Publica um snapshot somente depois de persistir o rascunho com sucesso. */
  async publish(){
    if(this.busy||!this.id)return;await this.save();if(this.error)return;this.busy=true;
    try{this.training=await firstValueFrom(this.service.manage(this.id,'publish'));this.notice='Treinamento publicado. Participantes que já iniciaram mantêm o procedimento original.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Associa contas existentes; a API valida todos os participantes antes da gravação. */
  async assign(){
    if(this.busy)return;const emails=this.emails.split(/[,;\s]+/).filter(Boolean);if(!emails.length)return;
    this.busy=true;this.error='';
    try{const data=await firstValueFrom(this.service.manage(this.id,'assign',{emails}));this.emails='';this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));this.notice=data.assigned+' participantes vinculados. Atribuições repetidas não são duplicadas.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Arquivamento preserva o histórico e bloqueia novas atividades. */
  async archive(){
    if(this.busy||!confirm('Arquivar este treinamento? O histórico será preservado e novas atividades serão bloqueadas.'))return;
    this.busy=true;
    try{await firstValueFrom(this.service.manage(this.id,'archive'));await this.load();this.notice='Treinamento arquivado.';}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  /** Consulta datas e feedback do participante selecionado e direciona o foco aos detalhes. */
  async inspect(user:number){
    this.busy=true;this.error='';
    try{this.inspection=await firstValueFrom(this.service.inspect(this.id,user));setTimeout(()=>document.getElementById('participant-details')?.focus(),0);}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
  async applyFilters(){
    if(this.busy)return;this.busy=true;this.error='';
    try{if(this.view==='list')this.items=await firstValueFrom(this.service.adminList(this.filters()));else this.training=await firstValueFrom(this.service.adminGet(this.id,this.filters()));}
    catch(e){this.error=trainingError(e);}finally{this.busy=false;}
  }
}
