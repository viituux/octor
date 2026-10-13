import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { GuideListComponent } from './components/guide-list/guide-list.component';
import { GuideEditorComponent } from './components/guide-editor/guide-editor.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'guides', component: GuideListComponent },
  { path: 'guides/:id', component: GuideEditorComponent },
  { path: '', redirectTo: '/guides', pathMatch: 'full' },
  { path: '**', redirectTo: '/guides' },
];
