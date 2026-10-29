import { TrainingListComponent } from './components/trainings/training-list.component';
import { TrainingPlayerComponent } from './components/trainings/training-player.component';
import { TrainingAdminComponent } from './components/trainings/training-admin.component';
import { TrainingDashboardComponent } from './components/trainings/training-dashboard.component';
import { trainingAdminGuard } from './services/training-admin.guard';
import { WorkspaceInviteComponent } from './components/guide-list/workspace-invite.component';
import { AccountComponent } from './components/login/account.component';
import { authGuard } from './services/auth.guard';
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { GuideListComponent } from './components/guide-list/guide-list.component';
import { GuideEditorComponent } from './components/guide-editor/guide-editor.component';

export const routes: Routes = [
  {path:'trainings',component:TrainingListComponent,canActivate:[authGuard]},
  {path:'trainings/:id',component:TrainingPlayerComponent,canActivate:[authGuard]},
  {path:'training-admin',component:TrainingAdminComponent,canActivate:[authGuard,trainingAdminGuard]},
  {path:'training-admin/new',component:TrainingAdminComponent,canActivate:[authGuard,trainingAdminGuard],data:{editor:true}},
  {path:'training-admin/:id',component:TrainingAdminComponent,canActivate:[authGuard,trainingAdminGuard],data:{editor:true}},
  {path:'training-dashboard',component:TrainingDashboardComponent,canActivate:[authGuard,trainingAdminGuard]},
  { path: 'login', component: LoginComponent },
  { path: 'register', component: LoginComponent, data:{register:true} },
  { path: 'account', component: AccountComponent, canActivate:[authGuard] },
  { path: 'join/:token', component: WorkspaceInviteComponent, canActivate:[authGuard] },
  { path: 'guides', component: GuideListComponent, canActivate:[authGuard] },
  { path: 'guides/:id', component: GuideEditorComponent, canActivate:[authGuard] },
  { path: '', redirectTo: '/guides', pathMatch: 'full' },
  { path: '**', redirectTo: '/guides' },
];
