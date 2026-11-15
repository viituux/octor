/** Manual por URL: leitura, conferência de prints e revisão humana antes da criação do guia. */
import { OctorLoadingComponent } from '../shared/octor-loading.component';
import {Component,OnInit,OnDestroy,DestroyRef,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterModule} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {firstValueFrom,Subscription,timer,exhaustMap,catchError,EMPTY} from 'rxjs';
import {ManualService,ManualRun,ManualDocument,ManualStep,manualError} from '../../services/manual.service';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterModule,OctorLoadingComponent],templateUrl:'./manuals.component.html',styleUrls:['./manuals.component.css']})
export class ManualsComponent implements OnInit,OnDestroy {
  url='';objective='';consent=false;autoGenerate=false;
  capturesReviewed = false;
  deletionTarget: ManualRun | null = null;
  deleting = false;
  deletionError = '';

  confirmDeletion(item: ManualRun, dialog: HTMLDialogElement): void {
    this.deletionTarget = item;
    this.deletionError = '';
    dialog.showModal();
  }

  deleteManual(dialog: HTMLDialogElement): void {
    const item = this.deletionTarget;
    if (!item || this.deleting) return;
    this.deleting = true;
    this.deletionError = '';
    this.service.delete(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.items = this.items.filter(manual => manual.id !== item.id);
        this.deleting = false;
        dialog.close();
        this.notice = 'Manual excluído.';
      },
      error: error => {
        this.deleting = false;
        this.deletionError = manualError(error);
      },
    });
  }
  readonly loadedCaptures = new Set<number>();
  items:ManualRun[]=[];run:ManualRun|null=null;document:ManualDocument|null=null;images:Record<number,string>={};imageErrors:Record<number,boolean>={};reviewed=false;
  busy=false;generating=false;canceling=false;loading=false;error='';notice='';private polling?:Subscription;private destroyRef=inject(DestroyRef);private destroyed=false;private imagePending=new Set<number>();private currentId:string|null=null;private generationError=false;
  constructor(public service:ManualService,private route:ActivatedRoute,private router:Router){}
  ngOnInit(){this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params=>{
    this.polling?.unsubscribe();Object.values(this.images).forEach(url=>URL.revokeObjectURL(url));this.images={};this.imagePending.clear();this.loadedCaptures.clear();this.imageErrors={};this.run=null;this.document=null;this.reviewed=false;this.capturesReviewed=false;this.error='';this.generationError=false;
    const id=params.get('id');this.currentId=id;
    if(id){this.loading=true;this.load(id);this.polling=timer(3000,3000).pipe(exhaustMap(()=>this.run&&['waiting','capturing','queued','generating'].includes(this.run.status)?this.service.get(id).pipe(catchError(()=>EMPTY)):EMPTY),takeUntilDestroyed(this.destroyRef)).subscribe(run=>this.accept(run));}
    else this.service.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:items=>this.items=items,error:e=>this.error=manualError(e)});
  });}
  ngOnDestroy(){this.destroyed=true;this.polling?.unsubscribe();Object.values(this.images).forEach(url=>URL.revokeObjectURL(url));}
  load(id:string){this.service.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:run=>{this.loading=false;this.accept(run);},error:e=>{this.loading=false;this.error=manualError(e);}});}
  get capturesAvailable(): boolean {
    const captures = this.run?.captures ?? [];
    return captures.length > 0 && captures.every(capture => this.loadedCaptures.has(capture.id));
  }

  get reviewImagesAvailable(): boolean {
    return !!this.document?.sections.length && this.document.sections.every(section =>
      section.steps.every(step => this.loadedCaptures.has(step.capture_id))
    );
  }

  refreshCaptures(id: string): void {
    this.imageErrors = {};
    this.load(id);
  }

  imageFailed(id: number): void {
    const url = this.images[id];
    if (url) URL.revokeObjectURL(url);
    delete this.images[id];
    this.loadedCaptures.delete(id);
    this.imageErrors[id] = true;
    this.capturesReviewed = false;
    this.reviewed = false;
  }
  private accept(run:ManualRun){
    if(run.id!==this.currentId)return;if(this.generationError&&['review','approved'].includes(run.status)){this.error='';this.generationError=false;}this.run=run;if(sessionStorage.getItem('manual-start-'+run.id)==='1'){sessionStorage.removeItem('manual-start-'+run.id);void this.start();}if(run.document?.sections&&!this.document){this.document=structuredClone(run.document);for(const section of this.document.sections)for(const step of section.steps){step.control_index??=null;step.kind??='guidance';}}
    for(const capture of run.captures||[]){if(this.images[capture.id]||this.imageErrors[capture.id]||this.imagePending.has(capture.id))continue;this.imagePending.add(capture.id);this.imageErrors[capture.id]=false;this.service.image(run.id,capture.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:blob=>{this.imagePending.delete(capture.id);if(this.currentId!==run.id)return;if(this.images[capture.id])URL.revokeObjectURL(this.images[capture.id]);this.images[capture.id]=URL.createObjectURL(blob);},error:()=>{this.imagePending.delete(capture.id);if(this.currentId===run.id)this.imageErrors[capture.id]=true;}});}
    if(run.status==='captured'&&sessionStorage.getItem('manual-auto-'+run.id)==='1'&&!this.busy){sessionStorage.removeItem('manual-auto-'+run.id);void this.generate(true);}
  }
  private get sourceUrl(): string | null {
    try {
      const value = new URL(this.url);
      if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.hash) return null;
      return value.href;
    } catch {
      return null;
    }
  }

  get canCreate(): boolean {
    return this.consent && !!this.sourceUrl && !!this.objective.trim();
  }

  get reviewFieldsValid(): boolean {
    const document = this.document;
    return !!document?.title.trim() && !!document.summary.trim() && document.sections.length > 0
      && document.sections.every(section => !!section.title.trim() && section.steps.length > 0
        && section.steps.every(step => !!step.text.trim()));
  }

  async create(){
    if(this.busy)return;this.error='';
    if(!this.consent){this.error='Autorize a leitura e o uso das capturas para continuar.';return;}
    const url = this.sourceUrl;
    if (!url || !this.objective.trim()) return;
    this.busy=true;
    try{await this.service.checkConnection();const run=await firstValueFrom(this.service.create({url,objective:this.objective,consent:this.consent}));sessionStorage.setItem('manual-auto-'+run.id,this.autoGenerate?'1':'0');sessionStorage.setItem('manual-start-'+run.id,'1');await this.router.navigate(['/manuals',run.id]);}
    catch(e){this.error=manualError(e);}finally{this.busy=false;}
  }
  async start(){if(!this.run||this.busy)return;this.busy=true;this.error='';try{await this.service.bridge(this.run.id);this.notice='A coleta abriu em uma aba. Mantenha essa aba ativa durante os prints.';}catch(e){this.error=manualError(e);}finally{this.busy=false;if(this.run?.status==='captured')this.accept(this.run);}}
  async cancel(){if(!this.run||this.canceling)return;this.canceling=true;this.error='';const id=this.run.id;sessionStorage.removeItem('manual-auto-'+id);try{this.accept(await firstValueFrom(this.service.action(id,'cancel')));void this.service.bridge(id,true).catch(()=>{});}catch(e){this.error=manualError(e);}finally{this.canceling=false;}}
  async generate(automatic = false): Promise<void> {
    const run = this.run;
    if (!run || this.busy || !['captured', 'failed'].includes(run.status)) return;
    if (!automatic && (!this.capturesReviewed || !this.capturesAvailable)) return;

    this.busy = this.generating = true;
    this.error = '';
    this.generationError = false;
    try {
      this.accept(await firstValueFrom(this.service.action(run.id, 'generate')));
    } catch (error) {
      if (this.currentId !== run.id) return;
      this.generationError = true;
      this.error = manualError(error);
      this.load(run.id);
    } finally {
      this.busy = this.generating = false;
    }
  }
  async approve(){if(!this.run||!this.document||this.busy)return;if(!this.reviewed||!this.reviewImagesAvailable||!this.reviewFieldsValid){this.error='Confirme a revisão dos textos e imagens.';return;}this.busy=true;this.error='';try{const run=await firstValueFrom(this.service.action(this.run.id,'approve',{document:this.document,reviewed:true}));this.accept(run);await this.router.navigate(['/guides',run.guide_id]);}catch(e){this.error=manualError(e);}finally{this.busy=false;}}
  controls(step:ManualStep){const capture=this.run?.captures.find(item=>item.id===step.capture_id);return (capture?.evidence.controls||[]).map((control:any,index:number)=>({...control,index})).filter((control:any)=>!!control.rect);}
  highlight(step:ManualStep){
    if(step.control_index==null)return null;
    const capture=this.run?.captures.find(item=>item.id===step.capture_id),rect=capture?.evidence.controls?.[step.control_index]?.rect;
    if(!rect||!capture.evidence.viewport_width||!capture.evidence.viewport_height)return null;
    return {left:rect.left/capture.evidence.viewport_width*100,top:rect.top/capture.evidence.viewport_height*100,width:rect.width/capture.evidence.viewport_width*100,height:rect.height/capture.evidence.viewport_height*100};
  }
  statusLabel(status:string):string{return ({waiting:'Aguardando coleta',capturing:'Capturando telas',captured:'Capturas prontas',queued:'Na fila',generating:'Gerando manual',review:'Revisão pendente',approved:'Manual revisado',cancelled:'Interrompido',failed:'Falha na geração'} as Record<string,string>)[status]||status;}
  removeStep(section:number,step:number){if(!this.document||this.busy)return;this.document.sections[section].steps.splice(step,1);if(!this.document.sections[section].steps.length)this.document.sections.splice(section,1);this.reviewed=false;}
}
