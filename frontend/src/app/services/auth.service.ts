import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface UserSettings {
  llm_provider: string;
  llm_api_key?: string;
  llm_api_key_masked: string;
  tts_provider: string;
  tts_api_key?: string;
  tts_api_key_masked: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  settings?: UserSettings;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:8000/api/auth';
  currentUser = signal<User | null>(null);
  token = signal<string | null>(localStorage.getItem('access_token'));

  constructor(private http: HttpClient) {
    const savedUser = localStorage.getItem('current_user');
    if (savedUser) {
      try {
        this.currentUser.set(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('current_user');
      }
    }
  }

  login(credentials: { username: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login/`, credentials).pipe(
      tap(res => {
        localStorage.setItem('access_token', res.access);
        localStorage.setItem('refresh_token', res.refresh);
        localStorage.setItem('current_user', JSON.stringify(res.user));
        this.token.set(res.access);
        this.currentUser.set(res.user);
      })
    );
  }

  register(userData: { username: string; email?: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/register/`, userData);
  }

  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>(`${this.apiUrl}/settings/`);
  }

  updateSettings(settings: Partial<UserSettings>): Observable<UserSettings> {
    return this.http.patch<UserSettings>(`${this.apiUrl}/settings/`, settings);
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
    this.token.set(null);
    this.currentUser.set(null);
  }

  isAuthenticated(): boolean {
    return !!this.token();
  }
}
