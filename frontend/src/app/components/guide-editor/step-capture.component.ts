import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Step } from '../../services/guide.service';
@Component({ selector:'app-step-capture', standalone:true, imports:[CommonModule], template:`
  <div class="capture">
    <svg class="capture-screen" *ngIf="step.screenshot_url" [attr.viewBox]="viewBox" role="img" [attr.aria-label]="'Captura: ' + step.text" [style.aspect-ratio]="ratio">
      <image [attr.href]="step.screenshot_url" x="0" y="0" [attr.width]="width" [attr.height]="height" preserveAspectRatio="none" />
      <rect *ngIf="rect" [attr.x]="rect.left-4" [attr.y]="rect.top-4" [attr.width]="rect.width+8" [attr.height]="rect.height+8" rx="6" fill="none" stroke="var(--highlight)" stroke-width="3" vector-effect="non-scaling-stroke" />
      <circle *ngIf="!rect && step.click_x != null && step.click_y != null" [attr.cx]="step.click_x" [attr.cy]="step.click_y" r="14" fill="var(--highlight-soft)" stroke="var(--highlight)" stroke-width="3" vector-effect="non-scaling-stroke" />
    </svg>
    <svg class="capture-print" *ngIf="step.screenshot_url" [attr.viewBox]="'0 0 '+width+' '+height" role="img" [attr.aria-label]="'Captura: ' + step.text" [style.aspect-ratio]="ratio">
      <image [attr.href]="step.screenshot_url" x="0" y="0" [attr.width]="width" [attr.height]="height" preserveAspectRatio="none" />
      <rect *ngIf="rect" [attr.x]="rect.left-4" [attr.y]="rect.top-4" [attr.width]="rect.width+8" [attr.height]="rect.height+8" rx="6" fill="none" stroke="var(--highlight)" stroke-width="3" vector-effect="non-scaling-stroke" />
      <circle *ngIf="!rect && step.click_x != null && step.click_y != null" [attr.cx]="step.click_x" [attr.cy]="step.click_y" r="14" fill="var(--highlight-soft)" stroke="var(--highlight)" stroke-width="3" vector-effect="non-scaling-stroke" />
    </svg>
    <p *ngIf="!step.screenshot_url" class="missing">Passo preservado sem imagem confiável. Grave novamente para adicionar uma captura.</p>
    <div *ngIf="step.screenshot_url" class="zoom"><button (click)="change(-0.5)" [disabled]="zoom<=1" aria-label="Diminuir zoom">−</button><span>{{zoom}}×</span><button (click)="change(0.5)" [disabled]="zoom>=4" aria-label="Aumentar zoom">+</button><button (click)="reset()">Tela inteira</button></div>
  </div>`, styles:[`.capture{position:relative;background:var(--bg-card-hover);border-radius:14px;overflow:hidden}svg{width:100%;display:block;max-height:620px}.capture-print{display:none}@media print{.capture-screen,.zoom{display:none!important}.capture-print{display:block;width:100%;max-height:150mm;break-inside:avoid}.capture{background:white;border-radius:0;overflow:visible;print-color-adjust:exact}}.zoom{display:flex;gap:10px;align-items:center;position:absolute;bottom:14px;right:14px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:6px;box-shadow:0 4px 16px #0001}.zoom button{border:0;background:var(--bg-card);padding:5px 9px;cursor:pointer;color:var(--text-muted)}.zoom span{font:12px system-ui}.missing{padding:48px 24px;color:var(--warning);text-align:center}`] })
export class StepCaptureComponent implements OnChanges {
 @Input({required:true}) step!:Step;
 @Output() zoomChanged=new EventEmitter<number>();
 width=1440;height=900;zoom=1;rect:any=null;viewBox='0 0 1440 900';ratio='1.6';
 ngOnChanges():void {
  const meta=this.step.annotations?.find(a=>a.type==='capture_metadata');
  this.width=meta?.viewport_width || 1440;this.height=meta?.viewport_height || 900;
  const r=meta?.element_rect;
  this.rect=r && r.width>0 && r.height>0 ? r:null;
  this.zoom=this.step.annotations?.find(a=>a.type==='image_view')?.zoom || (this.rect?2:1);
  this.layout();
  if ((!meta?.viewport_width || !meta?.viewport_height) && this.step.screenshot_url) {
    const currentId=this.step.id, image=new Image();
    image.onload=()=>{
      if(this.step.id!==currentId)return;
      const scale=meta?.device_pixel_ratio || 1;
      this.width=image.naturalWidth/scale;this.height=image.naturalHeight/scale;this.layout();
    };
    image.src=this.step.screenshot_url;
  }
 }
 layout():void {
  this.zoom=Math.max(1,Math.min(4,this.zoom));
  const w=this.width/this.zoom,h=this.height/this.zoom;
  const x=this.rect ? this.rect.left+this.rect.width/2 : this.step.click_x ?? this.width/2;
  const y=this.rect ? this.rect.top+this.rect.height/2 : this.step.click_y ?? this.height/2;
  this.viewBox=[Math.max(0,Math.min(this.width-w,x-w/2)),Math.max(0,Math.min(this.height-h,y-h/2)),w,h].join(' ');
  this.ratio=String(w/h);
 }
 change(delta:number):void {this.zoom+=delta;this.layout();this.zoomChanged.emit(this.zoom);}
 reset():void {this.zoom=1;this.layout();this.zoomChanged.emit(this.zoom);}
}
