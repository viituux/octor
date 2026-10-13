import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Step {
  id: number;
  guide: number;
  order: number;
  text: string;
  screenshot_url?: string;
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

export interface Guide {
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

  getGuides(): Observable<Guide[]> {
    return this.http.get<Guide[]>(`${this.apiBase}/guides/`);
  }

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

  deleteStep(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/guides/steps/${id}/`);
  }

  generateAiText(guideId: number | string): Observable<Guide> {
    return this.http.post<Guide>(`${this.apiBase}/guides/${guideId}/generate-text/`, {});
  }

  createVideoJob(guideId: number | string, options: { voice?: string; language?: string; avatar?: string }): Observable<VideoJob> {
    return this.http.post<VideoJob>(`${this.apiBase}/guides/${guideId}/video/`, options);
  }

  getVideoJob(jobId: number | string): Observable<VideoJob> {
    return this.http.get<VideoJob>(`${this.apiBase}/video-jobs/${jobId}/`);
  }
}
