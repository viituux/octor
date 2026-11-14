import {Component, DestroyRef, inject, Input, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AuthService} from '../../services/auth.service';

@Component({
  selector:'app-profile-avatar',
  standalone:true,
  imports:[CommonModule],
  template:`<img *ngIf="photo && !failed; else fallback" [src]="photo" alt=""
    referrerpolicy="no-referrer" (error)="failed=true"><ng-template #fallback>{{initials}}</ng-template>`,
  styles:[`:host{position:relative;overflow:hidden}img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}`]
})
export class ProfileAvatarComponent implements OnInit {
  @Input() initials = 'O';
  private readonly auth = inject(AuthService);
  private readonly lifetime = inject(DestroyRef);
  private localPhoto = '';
  private hidden = false;
  failed = false;

  get photo() {
    return this.localPhoto || (this.hidden ? '' : this.auth.currentUser()?.google_picture);
  }

  ngOnInit() {
    this.lifetime.onDestroy(() => URL.revokeObjectURL(this.localPhoto));
    this.auth.getAvatar().pipe(takeUntilDestroyed(this.lifetime)).subscribe({
      next: async blob => {
        if (blob.type.includes('application/json')) {
          try { this.hidden = JSON.parse(await blob.text()).hidden === true; } catch { return; }
        } else if (blob.size) {
          this.localPhoto = URL.createObjectURL(blob);
          this.failed = false;
        }
      },
      error: () => {}
    });
  }
}
