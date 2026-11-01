/** Rotas web: associa telas e guards; os guards organizam a navegação e não substituem permissões do backend. */
/**
 * Dependência ({ TrainingListComponent }): contratos e comportamento compartilhados de ./components/trainings/training-list.component.
 */
import { TrainingListComponent } from './components/trainings/training-list.component';
/**
 * Dependência ({ TrainingPlayerComponent }): contratos e comportamento compartilhados de ./components/trainings/training-player.component.
 */
import { TrainingPlayerComponent } from './components/trainings/training-player.component';
/**
 * Dependência ({ TrainingAdminComponent }): contratos e comportamento compartilhados de ./components/trainings/training-admin.component.
 */
import { TrainingAdminComponent } from './components/trainings/training-admin.component';
/**
 * Dependência ({ TrainingDashboardComponent }): contratos e comportamento compartilhados de ./components/trainings/training-dashboard.component.
 */
import { TrainingDashboardComponent } from './components/trainings/training-dashboard.component';
/**
 * Dependência ({ trainingAdminGuard }): contratos e comportamento compartilhados de ./services/training-admin.guard.
 */
import { trainingAdminGuard } from './services/training-admin.guard';
/**
 * Dependência ({ WorkspaceInviteComponent }): contratos e comportamento compartilhados de ./components/guide-list/workspace-invite.component.
 */
import { WorkspaceInviteComponent } from './components/guide-list/workspace-invite.component';
/**
 * Dependência ({ AccountComponent }): contratos e comportamento compartilhados de ./components/login/account.component.
 */
import { AccountComponent } from './components/login/account.component';
/**
 * Dependência ({ authGuard }): contratos e comportamento compartilhados de ./services/auth.guard.
 */
import { authGuard } from './services/auth.guard';
/**
 * Dependência ({ Routes }): rotas, parâmetros e navegação entre as telas.
 */
import { Routes } from '@angular/router';
/**
 * Dependência ({ LoginComponent }): contratos e comportamento compartilhados de ./components/login/login.component.
 */
import { LoginComponent } from './components/login/login.component';
/**
 * Dependência ({ GuideListComponent }): contratos e comportamento compartilhados de ./components/guide-list/guide-list.component.
 */
import { GuideListComponent } from './components/guide-list/guide-list.component';
/**
 * Dependência ({ GuideEditorComponent }): contratos e comportamento compartilhados de ./components/guide-editor/guide-editor.component.
 */
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
