import { API_BASE } from '../api-config';
/** Sessão web: login/cadastro/Google retornam JWT e perfil; o serviço sincroniza armazenamento local e signals após a confirmação da API. */
/**
 * Dependência ({ Injectable, signal }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Injectable, signal } from '@angular/core';
/**
 * Dependência ({ HttpClient }): requisições HTTP tipadas e interceptação do acesso à API.
 */
import { HttpClient } from '@angular/common/http';
/**
 * Dependência ({ Observable, tap }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import { Observable, tap, finalize, shareReplay, map, of, catchError, throwError } from 'rxjs';

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
  google_picture?: string | null;
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
  /**
   * string: URL base do contrato HTTP deste serviço.
   */
  readonly apiBase = API_BASE + '/';
  private apiUrl = this.apiBase + 'auth';
  /**
   * signal de User|null: perfil compartilhado da sessão, atualizado com os dados recebidos da API.
   */
  currentUser = signal<User | null>(null);
  /**
   * credencial de acesso ou signal correspondente; seu formato e uso seguem o contrato da sessão.
   */
  token = signal<string | null>(localStorage.getItem('access_token'));

  /**
   * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
   * @param http — HttpClient; cliente HTTP injetado pelo Angular.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
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

  /**
   * Envia credenciais ao servidor e atualiza tokens/perfil locais apenas a partir da sessão recebida.
   * @param credentials — { username: string; password: string }; nome de usuário e senha local enviados ao login.
   * @returns Observable<AuthResponse>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  login(credentials: { username: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login/`, credentials).pipe(
      tap(res => this.acceptSession(res))
    );
  }

  /**
   * Solicita o cadastro e aplica a sessão autenticada devolvida pelo servidor.
   * @param userData — { username: string; first_name: string; email: string; password: string }; campos de cadastro aceitos pela API.
   * @returns Observable<AuthResponse>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  register(userData: { username?: string; first_name: string; email: string; password: string; consent_version: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register/`, userData).pipe(tap(res=>this.acceptSession(res)));
  }
  /**
   * Substitui os tokens e o usuário locais pelo contrato de sessão confirmado pelo servidor.
   * @param res — AuthResponse; resposta do contrato HTTP.
   * @returns void.
   */
  acceptSession(res: AuthResponse): void {
    this.sessionEpoch++;
    this.refreshing = undefined;
    localStorage.setItem('access_token',res.access);localStorage.setItem('refresh_token',res.refresh);
    this.saveUser(res.user);this.token.set(res.access);
  }
  /**
   * Sincroniza o perfil recebido entre o armazenamento local e o signal da sessão.
   * @param user — User; identificação da conta conforme o tipo declarado.
   * @returns void.
   */
  private saveUser(user: User): void {localStorage.setItem('current_user',JSON.stringify(user));this.currentUser.set(user);}
  /**
   * Consulta e sincroniza o perfil da conta autenticada.
   * @returns Observable<User>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  me(): Observable<User> {return this.http.get<User>(this.apiUrl+'/me/').pipe(tap(user=>this.saveUser(user)));}
  /**
   * Envia alterações do perfil e sincroniza o usuário confirmado na resposta.
   * @param data — Record<string,unknown>; dados do contrato enviado ao serviço.
   * @returns Observable<User>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  getAvatar() {
    return this.http.get(this.apiUrl+'/profile/avatar/', {responseType:'blob'});
  }

  updateAvatar(photo: Blob) {
    const body = new FormData();
    body.append('avatar', photo, 'avatar.png');
    return this.http.post<void>(this.apiUrl+'/profile/avatar/', body);
  }

  removeAvatar() {
    return this.http.delete<void>(this.apiUrl+'/profile/avatar/');
  }

  updateProfile(data:Record<string,unknown>):Observable<User>{return this.http.patch<User>(this.apiUrl+'/profile/',data).pipe(tap(user=>this.saveUser(user)));}
  /**
   * Solicita a troca de senha e aplica os tokens da nova versão de sessão.
   * @param data — Record<string,unknown>; dados do contrato enviado ao serviço.
   * @returns Observable<AuthResponse>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  changePassword(data:Record<string,unknown>):Observable<AuthResponse>{return this.http.post<AuthResponse>(this.apiUrl+'/password/',data).pipe(tap(res=>this.acceptSession(res)));}
  /**
   * Solicita a revogação e aplica a sessão retornada, preservando o acesso atual.
   * @param data — Record<string,unknown>; dados do contrato enviado ao serviço.
   * @returns Observable<AuthResponse>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  revokeOtherSessions(data:Record<string,unknown>):Observable<AuthResponse>{return this.http.post<AuthResponse>(this.apiUrl+'/sessions/revoke/',data).pipe(tap(res=>this.acceptSession(res)));}
  /**
   * Consulta se o login Google está configurado e o identificador público do cliente.
   * @returns Observable<{enabled:boolean;client_id:string}>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  googleConfig(): Observable<{enabled:boolean;client_id:string}> {return this.http.get<{enabled:boolean;client_id:string}>(this.apiUrl+'/google/config/');}
  /**
   * Solicita desafio e nonce para uma tentativa de autenticação Google.
   * @returns Observable<{challenge:string;nonce:string}>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  googleChallenge(): Observable<{challenge:string;nonce:string}> {return this.http.post<{challenge:string;nonce:string}>(this.apiUrl+'/google/challenge/',{});}
  /**
   * Troca a credencial Google e o desafio por uma sessão local da aplicação.
   * @param credential — string; credencial Google da tentativa atual.
   * @param challenge — string; identificador do desafio recebido do servidor.
   * @returns Observable<AuthResponse>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  googleLogin(credential:string,challenge:string,consentVersion?:string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.apiUrl+'/google/login/',{credential,challenge,consent_version:consentVersion || undefined}).pipe(tap(res=>this.acceptSession(res)));
  }
  /**
   * Associa a credencial Google à conta autenticada e sincroniza o perfil recebido.
   * @param credential — string; credencial Google da tentativa atual.
   * @param challenge — string; identificador do desafio recebido do servidor.
   * @returns Observable<User>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  googleLink(credential:string,challenge:string): Observable<User> {
    return this.http.post<User>(this.apiUrl+'/google/link/',{credential,challenge}).pipe(tap(user=>this.saveUser(user)));
  }

  /**
   * Consulta as preferências da conta pelo contrato da API.
   * @returns Observable<UserSettings>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>(`${this.apiUrl}/settings/`);
  }

  /**
   * Persiste as preferências aceitas pelo endpoint da conta.
   * @param settings — Partial<UserSettings>; contrato tipado na assinatura.
   * @returns Observable<UserSettings>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  updateSettings(settings: Partial<UserSettings>): Observable<UserSettings> {
    return this.http.patch<UserSettings>(`${this.apiUrl}/settings/`, settings);
  }

  /**
   * Limpa os dados locais usados pela sessão e atualiza a navegação/estado previstos neste contexto.
   * @returns void.
   */
  private refreshing?: Observable<string>;
  private sessionEpoch = 0;

  extensionSession() {
    return this.http.post<{access: string; refresh: string}>(this.apiUrl + '/extension-session/', {});
  }

  ensureAccess(): Observable<string> {
    if (this.isAuthenticated()) return of(this.token()!);
    if (this.refreshing) return this.refreshing;
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) return throwError(() => new Error('Sessão indisponível.'));
    const epoch = this.sessionEpoch;
    this.refreshing = this.http.post<{access: string; refresh: string}>(this.apiUrl + '/refresh/', {refresh}).pipe(
      map(session => {
        if (epoch !== this.sessionEpoch) {
          this.revoke(session.refresh);
          throw new Error('Sessão encerrada.');
        }
        localStorage.setItem('access_token', session.access);
        localStorage.setItem('refresh_token', session.refresh);
        this.token.set(session.access);
        return session.access;
      }),
      catchError(error => {
        if (epoch === this.sessionEpoch && [400, 401, 403].includes(error.status)) {
          const latest = localStorage.getItem('access_token');
          // Outra aba pode ter renovado o token enquanto esta aguardava a resposta.
          if (latest && latest !== this.token() && localStorage.getItem('refresh_token') !== refresh) {
            this.token.set(latest);
            if (this.isAuthenticated()) return of(latest);
          }
          this.logout();
        }
        return throwError(() => error);
      }),
      finalize(() => { if (epoch === this.sessionEpoch) this.refreshing = undefined; }),
      shareReplay(1),
    );
    return this.refreshing;
  }

  private revoke(refresh: string) {
    this.http.post(this.apiUrl + '/logout/', {refresh}).subscribe({error: () => {}});
  }

  logout(): void {
    const refresh = localStorage.getItem('refresh_token');
    this.sessionEpoch++;
    this.refreshing = undefined;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
    this.token.set(null);
    this.currentUser.set(null);
    if (refresh) this.revoke(refresh);
  }

  /**
   * Verifica as condições locais da sessão; a validação e autorização definitivas permanecem no servidor.
   * @returns boolean.
   */
  isAuthenticated(): boolean {
    try {
      const value=this.token();if(!value)return false;
      const payload=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return Number(payload.exp)*1000>Date.now();
    } catch {return false;}
  }
}
