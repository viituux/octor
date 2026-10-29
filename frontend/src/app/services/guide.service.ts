import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Step {
  generation_prompt?: string;
  generation_prompt_suggestion?: string;
  generation_prompt_mode?: 'automatic' | 'manual';
  id: number;
  guide: number;
  order: number;
  text: string;
  screenshot_url?: string;
  narration_url?: string | null;
  live_narration_url?: string | null;
  selector: string;
  url: string;
  click_x?: number;
  click_y?: number;
  element_text?: string;
  action_type: string;
  input_value?: string;
  annotations: any[];
  created_at: string;
}

export interface Workspace { id:number; name:string; owner:number|null; role:'owner'|'member'; member_count:number; }
export interface TeamMember { id:number; name:string; email:string; role:'owner'|'member'; }
export interface TeamInvite { id:number; email:string; expires_at:string; expired?:boolean; token?:string; }
export interface Guide {
  workspace?:number|null; workspace_name?:string|null; can_edit?:boolean; is_favorite?:boolean; shared_directly?:boolean; trashed_at?:string|null;
  capture_audio_url?: string | null;
  owner_username?: string;
  id: number;
  title: string;
  description: string;
  status: string;
  language: string;
  step_count?: number;
  first_step_screenshot?: string;
  steps?: Step[];
  created_at: string;
  updated_at: string;
}

export interface VideoJob {
  id: number;
  guide: number;
  status: string;
  voice: string;
  language: string;
  avatar: string;
  video_url?: string;
  progress: number;
  error_message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GuideService {
  private apiBase = 'http://localhost:8000/api';

  constructor(private http: HttpClient) {}

  getGuides(includeTrash = false): Observable<Guide[]> {
    return this.http.get<Guide[]>(`${this.apiBase}/guides/${includeTrash ? '?include_trash=1' : ''}`);
  }

  createGuide(title:string, workspace:number|null): Observable<Guide> {return this.http.post<Guide>(this.apiBase+'/guides/',{title,workspace});}
  createStep(guideId:string|number):Observable<Step> {return this.http.post<Step>(this.apiBase+'/guides/'+guideId+'/steps/',{text:'Descreva esta etapa.',action_type:'click'});}
  favorite(id:number,value:boolean) {return this.http.post<{is_favorite:boolean}>(this.apiBase+'/guides/'+id+'/favorite/',{favorite:value});}
  restoreGuide(id:number) {return this.http.post<Guide>(this.apiBase+'/guides/'+id+'/restore/',{});}
  permanentlyDelete(id:number) {return this.http.post<void>(this.apiBase+'/guides/'+id+'/permanent-delete/',{});}
  guideShares(id:number) {return this.http.get<TeamMember[]>(this.apiBase+'/guides/'+id+'/share/');}
  shareGuide(id:number,email:string) {return this.http.post<TeamMember[]>(this.apiBase+'/guides/'+id+'/share/',{email});}
  revokeShare(id:number,user_id:number) {return this.http.request<TeamMember[]>('DELETE',this.apiBase+'/guides/'+id+'/share/',{body:{user_id}});}
  workspaces() {return this.http.get<Workspace[]>(this.apiBase+'/workspaces/');}
  createWorkspace(name:string) {return this.http.post<Workspace>(this.apiBase+'/workspaces/',{name});}
  renameWorkspace(id:number,name:string) {return this.http.patch<Workspace>(this.apiBase+'/workspaces/'+id+'/',{name});}
  members(id:number) {return this.http.get<TeamMember[]>(this.apiBase+'/workspaces/'+id+'/members/');}
  removeMember(id:number,user_id:number) {return this.http.request<TeamMember[]>('DELETE',this.apiBase+'/workspaces/'+id+'/members/',{body:{user_id}});}
  invites(id:number) {return this.http.get<TeamInvite[]>(this.apiBase+'/workspaces/'+id+'/invitations/');}
  invite(id:number,email:string) {return this.http.post<TeamInvite>(this.apiBase+'/workspaces/'+id+'/invitations/',{email});}
  revokeInvite(id:number,invitation_id:number) {return this.http.request<TeamInvite[]>('DELETE',this.apiBase+'/workspaces/'+id+'/invitations/',{body:{invitation_id}});}
  invitation(token:string) {return this.http.get<{name:string;accepted:boolean}>(this.apiBase+'/workspaces/invitations/'+encodeURIComponent(token)+'/');}
  acceptInvite(token:string) {return this.http.post<Workspace>(this.apiBase+'/workspaces/invitations/'+encodeURIComponent(token)+'/',{});}

  getGuide(id: number | string): Observable<Guide> {
    return this.http.get<Guide>(`${this.apiBase}/guides/${id}/`);
  }

  updateGuide(id: number | string, data: Partial<Guide>): Observable<Guide> {
    return this.http.patch<Guide>(`${this.apiBase}/guides/${id}/`, data);
  }

  deleteGuide(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/guides/${id}/`);
  }

  updateStep(id: number | string, data: Partial<Step>): Observable<Step> {
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, data);
  }

  saveNarration(id: number, audio: Blob): Observable<Step> {
    const data = new FormData();
    const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    data.append('narration', audio, 'narration.' + extension);
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, data);
  }

  deleteNarration(id: number): Observable<Step> {
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, { narration: null });
  }

  deleteStep(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/guides/steps/${id}/`);
  }

  prepareNarration(guideId: number | string, stepId?: number): Observable<{prepared:number}> {
    return this.http.post<{prepared:number}>(`${this.apiBase}/guides/${guideId}/prepare-narration/`, stepId ? {step_id:stepId} : {});
  }

  generateStepText(guideId: number | string, stepId: number, prompt: string, mode?: 'automatic' | 'manual'): Observable<Step> {
    return this.http.post<Step>(`${this.apiBase}/guides/${guideId}/steps/${stepId}/generate-text/`, { prompt, prompt_mode:mode });
  }

  createVideoJob(guideId: number | string, options: { voice?: string; language?: string; avatar?: string }): Observable<VideoJob> {
    return this.http.post<VideoJob>(`${this.apiBase}/guides/${guideId}/video/`, options);
  }

  getVideoJob(jobId: number | string): Observable<VideoJob> {
    return this.http.get<VideoJob>(`${this.apiBase}/video-jobs/${jobId}/`);
  }
}
