import {Component, EventEmitter, Output} from '@angular/core';
import {CommonModule} from '@angular/common';

export function lastThirtyDays() {
  const today = new Date();
  const first = new Date(today);
  first.setDate(first.getDate() - 29);
  const day = (d: Date) => [d.getFullYear(), d.getMonth()+1, d.getDate()]
    .map(n => String(n).padStart(2,'0')).join('-');
  return {start: day(first), end: day(today)};
}

@Component({
  styleUrls:['./training-filters.css'],
  selector:'app-training-period', standalone:true, imports:[CommonModule],
  template:`<label class="training-filter">Período<select (change)="select($any($event.target).value)">
    <option value="30">Últimos 30 dias</option><option value="all">Todo o período</option>
    <option value="custom">Personalizado</option>
  </select></label>
  <ng-container *ngIf="custom">
    <label class="training-filter">Início<input type="date" [value]="start" (change)="start=$any($event.target).value; apply()"></label>
    <label class="training-filter">Fim<input type="date" [value]="end" (change)="end=$any($event.target).value; apply()"></label>
    <small *ngIf="start && end && start>end" role="alert">O início deve vir antes do fim.</small>
  </ng-container>`,
  styles:[`:host{display:flex;align-items:end;gap:8px;flex-wrap:wrap}`]
})
export class TrainingPeriodComponent {
  @Output() periodChange = new EventEmitter<{start:string;end:string}>();
  custom = false;
  start = '';
  end = '';

  select(value:string) {
    this.custom = value==='custom';
    if (this.custom) { this.apply(); return; }
    const dates = value==='30' ? lastThirtyDays() : {start:'',end:''};
    this.periodChange.emit(dates);
  }

  apply() {
    if (this.start && this.end && this.start > this.end) return;
    if (this.start && this.end) this.periodChange.emit({start:this.start,end:this.end});
  }
}
