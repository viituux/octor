/** Cliente HTTP de guias, equipes, passos e mídia. Os métodos devolvem Observables; os componentes controlam assinatura e mensagens, e o servidor decide as permissões. */
/**
 * Dependência ({ Injectable }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Injectable } from '@angular/core';
/**
 * Dependência ({ HttpClient }): requisições HTTP tipadas e interceptação do acesso à API.
 */
import { HttpClient } from '@angular/common/http';
/**
 * Dependência ({ Observable }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
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
  /**
   * string: prefixo dos endpoints do módulo no servidor local.
   */
  private apiBase = 'http://localhost:8000/api';

  /**
   * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
   * @param http — HttpClient; cliente HTTP injetado pelo Angular.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  constructor(private http: HttpClient) {}

  /**
   * Encaminha a operação `getGuides` à API por this.http.get; a autorização e validação final são do servidor.
   * @param includeTrash — opção de incluir os procedimentos na lixeira (padrão: false).
   * @returns Observable<Guide[]>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  getGuides(includeTrash = false): Observable<Guide[]> {
    return this.http.get<Guide[]>(`${this.apiBase}/guides/${includeTrash ? '?include_trash=1' : ''}`);
  }

  /**
   * Cria o procedimento e navega para sua edição após receber a identificação persistida.
   * @param title — string; título do procedimento ou equipe.
   * @param workspace — number|null; identificador/contexto da equipe.
   * @returns Observable<Guide>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  createGuide(title:string, workspace:number|null): Observable<Guide> {return this.http.post<Guide>(this.apiBase+'/guides/',{title,workspace});}
  /**
   * Encaminha a operação `createStep` à API por this.http.post; a autorização e validação final são do servidor.
   * @param guideId — string|number; contrato tipado na assinatura.
   * @returns Observable<Step>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  createStep(guideId:string|number):Observable<Step> {return this.http.post<Step>(this.apiBase+'/guides/'+guideId+'/steps/',{text:'Descreva esta etapa.',action_type:'click'});}
  /**
   * Altera o favorito pessoal do guia usando a confirmação da API.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param value — boolean; valor recebido pelo controle ou transformação.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  favorite(id:number,value:boolean) {return this.http.post<{is_favorite:boolean}>(this.apiBase+'/guides/'+id+'/favorite/',{favorite:value});}
  /**
   * Encaminha a operação `restoreGuide` à API por this.http.post; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  restoreGuide(id:number) {return this.http.post<Guide>(this.apiBase+'/guides/'+id+'/restore/',{});}
  /**
   * Solicita a exclusão definitiva após a confirmação prevista na interface.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  permanentlyDelete(id:number) {return this.http.post<void>(this.apiBase+'/guides/'+id+'/permanent-delete/',{});}
  /**
   * Encaminha a operação `guideShares` à API por this.http.get; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns resultado de this.http.get(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  guideShares(id:number) {return this.http.get<TeamMember[]>(this.apiBase+'/guides/'+id+'/share/');}
  /**
   * Envia a associação de compartilhamento direto do guia à API.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param email — string; endereço do usuário ou destinatário do convite.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  shareGuide(id:number,email:string) {return this.http.post<TeamMember[]>(this.apiBase+'/guides/'+id+'/share/',{email});}
  /**
   * Solicita a remoção de acesso compartilhado diretamente ao guia.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param user_id — number; contrato tipado na assinatura.
   * @returns resultado de this.http.request(...).
   */
  revokeShare(id:number,user_id:number) {return this.http.request<TeamMember[]>('DELETE',this.apiBase+'/guides/'+id+'/share/',{body:{user_id}});}
  /**
   * Encaminha a operação `workspaces` à API por this.http.get; a autorização e validação final são do servidor.
   * @returns resultado de this.http.get(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  workspaces() {return this.http.get<Workspace[]>(this.apiBase+'/workspaces/');}
  /**
   * Solicita a criação da equipe e atualiza o contexto após a confirmação.
   * @param name — string; nome de apresentação do recurso.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  createWorkspace(name:string) {return this.http.post<Workspace>(this.apiBase+'/workspaces/',{name});}
  /**
   * Persiste a alteração do nome da equipe pelo endpoint autorizado.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param name — string; nome de apresentação do recurso.
   * @returns resultado de this.http.patch(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  renameWorkspace(id:number,name:string) {return this.http.patch<Workspace>(this.apiBase+'/workspaces/'+id+'/',{name});}
  /**
   * Encaminha a operação `members` à API por this.http.get; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns resultado de this.http.get(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  members(id:number) {return this.http.get<TeamMember[]>(this.apiBase+'/workspaces/'+id+'/members/');}
  /**
   * Solicita a remoção do membro e atualiza a apresentação da equipe.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param user_id — number; contrato tipado na assinatura.
   * @returns resultado de this.http.request(...).
   */
  removeMember(id:number,user_id:number) {return this.http.request<TeamMember[]>('DELETE',this.apiBase+'/workspaces/'+id+'/members/',{body:{user_id}});}
  /**
   * Encaminha a operação `invites` à API por this.http.get; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns resultado de this.http.get(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  invites(id:number) {return this.http.get<TeamInvite[]>(this.apiBase+'/workspaces/'+id+'/invitations/');}
  /**
   * Encaminha a operação `invite` à API por this.http.post; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param email — string; endereço do usuário ou destinatário do convite.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  invite(id:number,email:string) {return this.http.post<TeamInvite>(this.apiBase+'/workspaces/'+id+'/invitations/',{email});}
  /**
   * Executa a etapa `revokeInvite` do fluxo de guide.service.ts; os retornos abaixo identificam o contrato entregue ao chamador.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param invitation_id — number; contrato tipado na assinatura.
   * @returns resultado de this.http.request(...).
   */
  revokeInvite(id:number,invitation_id:number) {return this.http.request<TeamInvite[]>('DELETE',this.apiBase+'/workspaces/'+id+'/invitations/',{body:{invitation_id}});}
  /**
   * Encaminha a operação `invitation` à API por this.http.get; a autorização e validação final são do servidor.
   * @param token — string; credencial de acesso usada no cabeçalho Bearer.
   * @returns resultado de this.http.get(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  invitation(token:string) {return this.http.get<{name:string;accepted:boolean}>(this.apiBase+'/workspaces/invitations/'+encodeURIComponent(token)+'/');}
  /**
   * Encaminha a operação `acceptInvite` à API por this.http.post; a autorização e validação final são do servidor.
   * @param token — string; credencial de acesso usada no cabeçalho Bearer.
   * @returns resultado de this.http.post(...).
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  acceptInvite(token:string) {return this.http.post<Workspace>(this.apiBase+'/workspaces/invitations/'+encodeURIComponent(token)+'/',{});}

  /**
   * Encaminha a operação `getGuide` à API por this.http.get; a autorização e validação final são do servidor.
   * @param id — number | string; identificador do recurso ou elemento alvo.
   * @returns Observable<Guide>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  getGuide(id: number | string): Observable<Guide> {
    return this.http.get<Guide>(`${this.apiBase}/guides/${id}/`);
  }

  /**
   * Persiste os campos informados do guia sem interpretar alterações localmente como autorização.
   * @param id — number | string; identificador do recurso ou elemento alvo.
   * @param data — Partial<Guide>; dados do contrato enviado ao serviço.
   * @returns Observable<Guide>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  updateGuide(id: number | string, data: Partial<Guide>): Observable<Guide> {
    return this.http.patch<Guide>(`${this.apiBase}/guides/${id}/`, data);
  }

  /**
   * Encaminha a operação `deleteGuide` à API por this.http.delete; a autorização e validação final são do servidor.
   * @param id — number | string; identificador do recurso ou elemento alvo.
   * @returns Observable<void>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  deleteGuide(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/guides/${id}/`);
  }

  /**
   * Encaminha a operação `updateStep` à API por this.http.patch; a autorização e validação final são do servidor.
   * @param id — number | string; identificador do recurso ou elemento alvo.
   * @param data — Partial<Step>; dados do contrato enviado ao serviço.
   * @returns Observable<Step>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  updateStep(id: number | string, data: Partial<Step>): Observable<Step> {
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, data);
  }

  /**
   * Encaminha a operação `saveNarration` à API por this.http.patch; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @param audio — Blob; contrato tipado na assinatura.
   * @returns Observable<Step>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  saveNarration(id: number, audio: Blob): Observable<Step> {
    const data = new FormData();
    const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    data.append('narration', audio, 'narration.' + extension);
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, data);
  }

  /**
   * Encaminha a operação `deleteNarration` à API por this.http.patch; a autorização e validação final são do servidor.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns Observable<Step>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  deleteNarration(id: number): Observable<Step> {
    return this.http.patch<Step>(`${this.apiBase}/guides/steps/${id}/`, { narration: null });
  }

  /**
   * Solicita a exclusão do passo autorizado e atualiza a sequência após a resposta.
   * @param id — number | string; identificador do recurso ou elemento alvo.
   * @returns Observable<void>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  deleteStep(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/guides/steps/${id}/`);
  }

  /**
   * Encaminha a operação `prepareNarration` à API por this.http.post; a autorização e validação final são do servidor.
   * @param guideId — number | string; contrato tipado na assinatura.
   * @param stepId — number; contrato tipado na assinatura.
   * @returns Observable<{prepared:number}>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  prepareNarration(guideId: number | string, stepId?: number): Observable<{prepared:number}> {
    return this.http.post<{prepared:number}>(`${this.apiBase}/guides/${guideId}/prepare-narration/`, stepId ? {step_id:stepId} : {});
  }

  /**
   * Solicita geração textual para o contexto indicado e aplica a resposta confirmada pelo serviço.
   * @param guideId — number | string; contrato tipado na assinatura.
   * @param stepId — number; contrato tipado na assinatura.
   * @param prompt — string; contrato tipado na assinatura.
   * @param mode — 'automatic' | 'manual'; contrato tipado na assinatura.
   * @returns Observable<Step>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  generateStepText(guideId: number | string, stepId: number, prompt: string, mode?: 'automatic' | 'manual'): Observable<Step> {
    return this.http.post<Step>(`${this.apiBase}/guides/${guideId}/steps/${stepId}/generate-text/`, { prompt, prompt_mode:mode });
  }

  /**
   * Encaminha a operação `createVideoJob` à API por this.http.post; a autorização e validação final são do servidor.
   * @param guideId — number | string; contrato tipado na assinatura.
   * @param options — { voice?: string; language?: string; avatar?: string }; opções da requisição.
   * @returns Observable<VideoJob>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  createVideoJob(guideId: number | string, options: { voice?: string; language?: string; avatar?: string }): Observable<VideoJob> {
    return this.http.post<VideoJob>(`${this.apiBase}/guides/${guideId}/video/`, options);
  }

  /**
   * Encaminha a operação `getVideoJob` à API por this.http.get; a autorização e validação final são do servidor.
   * @param jobId — number | string; contrato tipado na assinatura.
   * @returns Observable<VideoJob>.
   * Falhas HTTP seguem pelo canal de erro do Observable; este método não confirma sucesso antes da resposta.
   */
  getVideoJob(jobId: number | string): Observable<VideoJob> {
    return this.http.get<VideoJob>(`${this.apiBase}/video-jobs/${jobId}/`);
  }
}
