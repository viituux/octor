import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface UserSettings { updated_at?: string; }

export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  has_password?: boolean;
  date_joined?: string;
  last_login?: string|null;
  google_email?: string | null;
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

  register(userData: { username: string; first_name: string; email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register/`, userData).pipe(tap(res=>this.acceptSession(res)));
  }
  acceptSession(res: AuthResponse): void {
    localStorage.setItem('access_token',res.access);localStorage.setItem('refresh_token',res.refresh);
    this.saveUser(res.user);this.token.set(res.access);
  }
  private saveUser(user: User): void {localStorage.setItem('current_user',JSON.stringify(user));this.currentUser.set(user);}
  me(): Observable<User> {return this.http.get<User>(this.apiUrl+'/me/').pipe(tap(user=>this.saveUser(user)));}
  updateProfile(data:Record<string,unknown>):Observable<User>{return this.http.patch<User>(this.apiUrl+'/profile/',data).pipe(tap(user=>this.saveUser(user)));}
  changePassword(data:Record<string,unknown>):Observable<AuthResponse>{return this.http.post<AuthResponse>(this.apiUrl+'/password/',data).pipe(tap(res=>this.acceptSession(res)));}
  revokeOtherSessions(data:Record<string,unknown>):Observable<AuthResponse>{return this.http.post<AuthResponse>(this.apiUrl+'/sessions/revoke/',data).pipe(tap(res=>this.acceptSession(res)));}
  googleConfig(): Observable<{enabled:boolean;client_id:string}> {return this.http.get<{enabled:boolean;client_id:string}>(this.apiUrl+'/google/config/');}
  googleChallenge(): Observable<{challenge:string;nonce:string}> {return this.http.post<{challenge:string;nonce:string}>(this.apiUrl+'/google/challenge/',{});}
  googleLogin(credential:string,challenge:string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.apiUrl+'/google/login/',{credential,challenge}).pipe(tap(res=>this.acceptSession(res)));
  }
  googleLink(credential:string,challenge:string): Observable<User> {
    return this.http.post<User>(this.apiUrl+'/google/link/',{credential,challenge}).pipe(tap(user=>this.saveUser(user)));
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
    try {
      const value=this.token();if(!value)return false;
      const payload=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return Number(payload.exp)*1000>Date.now();
    } catch {return false;}
  }
}
