import { OctorLoadingComponent } from '../shared/octor-loading.component';
import {OctorLogoComponent} from '../shared/octor-logo.component';
import {DialogService} from '../../services/dialog.service';
/** Editor de procedimentos: carrega guia, mantém rascunhos, persiste alterações e oferece geração, exportação e Me guie; permissões vêm do contrato da API. */
/**
 * Dependência ({ firstValueFrom }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import { firstValueFrom } from 'rxjs';
/**
 * Dependência ({ StepCaptureComponent }): contratos e comportamento compartilhados de ./step-capture.component.
 */
import { StepCaptureComponent } from './step-capture.component';
/**
 * Dependência ({ StepNarrationComponent }): contratos e comportamento compartilhados de ./step-narration.component.
 */
import { StepNarrationComponent } from './step-narration.component';
/**
 * Dependência ({ Component, OnInit, OnDestroy }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
/**
 * Dependência ({ CommonModule }): diretivas e apresentação compartilhada dos templates Angular.
 */
import { CommonModule } from '@angular/common';
/**
 * Dependência ({ FormsModule }): vínculo e validação dos formulários da interface.
 */
import { FormsModule } from '@angular/forms';
/**
 * Dependência ({ ActivatedRoute, RouterModule, Router }): rotas, parâmetros e navegação entre as telas.
 */
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
/**
 * Dependência ({ GuideService, Guide, Step, VideoJob }): contratos e comportamento compartilhados de ../../services/guide.service.
 */
import { GuideService, Guide, Step, VideoJob } from '../../services/guide.service';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ../../services/auth.service.
 */
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-guide-editor',
  standalone: true,
  imports:[OctorLoadingComponent,OctorLogoComponent,CommonModule, FormsModule, RouterModule, StepNarrationComponent, StepCaptureComponent],
  templateUrl: './guide-editor.component.html',
  styleUrls: ['./guide-editor.component.css']
})
export class GuideEditorComponent implements OnInit, OnDestroy {
  /**
   * Converte as coordenadas do clique em porcentagens da captura para posicionar o destaque sem depender da largura exibida.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @param axis — 'x' | 'y'; contrato tipado na assinatura.
   * @param image — HTMLImageElement; contrato tipado na assinatura.
   * @returns number.
   */
  getHotspotPercent(step: Step, axis: 'x' | 'y', image: HTMLImageElement): number {
    const metadata = (step.annotations || []).find((item: any) => item.type === 'capture_metadata');
    const size = axis === 'x' ? metadata?.viewport_width : metadata?.viewport_height;
    const original = axis === 'x' ? image.naturalWidth : image.naturalHeight;
    const coordinate = axis === 'x' ? step.click_x : step.click_y;
    return Math.max(0, Math.min(100, ((coordinate || 0) / (size || original || 1)) * 100));
  }

  pendingApprovals: {id: number; training: string; participant: string; status: string; eligible: boolean; approved: boolean}[] = [];
  approvalTab: 'individual' | 'all' = 'individual';
  selectedApprovals = new Set<number>();
  approvalError = '';
  approvalResult = '';
  get canApproveAny(): boolean { return this.pendingApprovals.some(row => row.eligible); }

  openApprovals(dialog: HTMLDialogElement): void {
    this.approvalTab = 'individual';
    this.selectedApprovals.clear();
    this.approvalError = this.approvalResult = '';
    if (this.guide) this.refreshApprovals(this.guide.id);
    dialog.showModal();
  }

  selectApproval(id: number, checked: boolean): void {
    if (checked) this.selectedApprovals.add(id);
    else this.selectedApprovals.delete(id);
    this.approvalError = '';
  }
  approving = false;

  private refreshApprovals(id: number): void {
    this.guideService.pendingApprovals(id).subscribe({
      next: pending => this.pendingApprovals = pending,
      error: () => this.pendingApprovals = [],
    });
  }

  async approveTraining(): Promise<void> {
    if (!this.guide || this.approving) return;
    const all = this.approvalTab === 'all';
    const ids = this.pendingApprovals.filter(row => row.eligible && this.selectedApprovals.has(row.id)).map(row => row.id);
    this.approvalError = this.approvalResult = '';
    if (!all && !ids.length) {
      this.approvalError = 'Selecione pelo menos um usuário que concluiu.';
      return;
    }
    const guideId = this.guide.id;
    this.approving = true;
    try {
      const result = await firstValueFrom(this.guideService.approveParticipation(guideId, ids, all));
      this.selectedApprovals.clear();
      this.approvalResult = result.approved_count === 1 ? '1 usuário aprovado' : `${result.approved_count} usuários aprovados`;
      this.refreshApprovals(guideId);
    } catch (error: any) {
      this.approvalError = error.error?.detail || 'Não foi possível aprovar o treinamento.';
    } finally {
      this.approving = false;
    }
  }

  playbackStarting = false;
  savingPlaybackEnvironment = false;

  /** Registra o aceite do criador e usa exclusivamente o resultado confirmado pela API. */
  releaseMessage = '';

  authorizeTest(enabled: boolean): void {
    if (!this.guide || !this.canEdit || this.savingPlaybackEnvironment) return;
    this.savingPlaybackEnvironment = true;
    this.releaseMessage = '';
    this.guideService.authorizeTest(this.guide.id,enabled).subscribe({
      next: saved => {
        Object.assign(this.guide!, saved);
        this.savingPlaybackEnvironment = false;
        this.releaseMessage = saved.test_authorized ? 'Teste liberado.' : 'Liberação desativada. Histórico preservado.';
      },
      error: err => {
        this.savingPlaybackEnvironment = false;
        this.releaseMessage = err.error?.detail || 'Não foi possível alterar a liberação.';
      },
    });
  }
  playbackMessage = '';
  private playbackTimer: ReturnType<typeof setTimeout> | undefined;
  private playbackListener: ((event: MessageEvent) => void) | undefined;

  /**
   * Prepara os passos do guia e solicita o início do Me guie à extensão conectada.
   * @returns void.
   */
  get isReferenceManual():boolean{return !!this.guide?.steps?.some(step=>step.action_type==='reference');}
  getManualSection(index:number):string{const steps=this.guide?.steps||[];const title=(step:Step)=>step.annotations?.find((item:any)=>item.type==='manual_section')?.title||'';const current=steps[index]?title(steps[index]):'';return index===0||current!==title(steps[index-1])?current:'';}
  async startPlayback(ownerTest = false): Promise<void> {
    if(this.isReferenceManual){this.playbackMessage='Este manual documenta telas observadas e deve ser consultado no editor ou PDF.';return;}
    if (!this.guide?.steps?.length || this.playbackStarting) return;
    if (this.savingPlaybackEnvironment || (ownerTest ? !this.isGuideOwner : !this.guide.can_start_playback)) {
      this.playbackMessage = 'Aguarde a autorização Válido para Teste do criador.';
      return;
    }
    this.playbackStarting = true;
    this.playbackMessage = '';
    try {
      const access = await firstValueFrom(ownerTest ? this.guideService.previewTraining(this.guide.id) : this.guideService.playbackAccess(this.guide.id));
      if (access.training_id) {
        this.playbackStarting = false;
        await this.router.navigate(['/trainings', access.training_id]);
        return;
      }
    } catch (err:any) {
      this.playbackStarting = false;
      this.playbackMessage = err.error?.detail || 'O teste não está autorizado para sua conta.';
      return;
    }

    const firstUrl = this.guide.steps[0].url;
    let origin: string;
    try {
      origin = new URL(firstUrl).origin;
    } catch {
      this.playbackStarting = false;
      this.playbackMessage = 'O primeiro passo está sem um endereço válido. Revise a captura.';
      return;
    }
    const confirmed = await this.dialogs.confirm(
      `O roteiro começa em ${origin}. Se os endereços estiverem autorizados para testes, o Me guie abrirá outra aba e mostrará as instruções nela.`,
      {title: 'Testar meu guia', confirmText: 'Iniciar teste'},
    );
    if (!confirmed || this.destroyed) {
      this.playbackStarting = false;
      return;
    }
    const requestId = crypto.randomUUID();
    this.playbackListener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.requestId !== requestId) return;
      if (/^[a-p]{32}$/.test(event.data.extensionId || '')) localStorage.setItem('autoguide_extension_id', event.data.extensionId);
      if (event.data.type !== 'AUTOGUIDE_RESULT') return;
      this.clearPlaybackRequest();
      this.playbackMessage = event.data.success ? 'Tutorial aberto na aba de orientação.' :
        (event.data.error || 'Não foi possível abrir o tutorial.');
    };
    window.addEventListener('message', this.playbackListener);
    this.playbackTimer = setTimeout(() => {
      this.clearPlaybackRequest();
      this.playbackMessage = 'A extensão não respondeu. Recarregue o OCTOR em chrome://extensions e esta página. Se necessário, use Entrar pelo navegador na barra lateral para reconectar.';
    }, 10000);
    const payload = { type: 'AUTOGUIDE_START', requestId, title: this.guideTitle,
      steps: this.guide.steps.map(step => ({ url: step.url, selector: step.selector, text: step.text, element_text: step.element_text,
        narration: {
          path: this.guideNarrationPath(step.narration_url || step.live_narration_url),
          range: step.narration_url ? null : step.annotations?.find(item => item.type === 'live_narration'),
        },
        target: step.annotations?.find((annotation: any) => annotation.type === 'capture_metadata')?.target })) };
    this.sendPlaybackRequest(payload);
  }

  /**
   * Envia a solicitação à ponte da extensão e acompanha a confirmação da abertura do tutorial.
   * @param payload — any; contrato tipado na assinatura.
   * @returns void.
   */
  private guideNarrationPath(value?: string | null): string | undefined {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.pathname.startsWith('/api/guides/media/') ? url.pathname : undefined;
    } catch { return undefined; }
  }

  private sendPlaybackRequest(payload: any): void {
    const runtime = (window as any).chrome?.runtime;
    const extensionId = localStorage.getItem('autoguide_extension_id');
    const bridge = /* Recebe a resposta da ponte da extensão no contexto da página e atualiza o estado da solicitação. | @returns resultado de window.postMessage(...). */ () => window.postMessage(payload, location.origin);
    if (!runtime?.sendMessage || !extensionId || !/^[a-p]{32}$/.test(extensionId)) { bridge(); return; }
    try {
      runtime.sendMessage(extensionId, { ...payload, action: 'START_PLAYBACK' }, (response: any) => {
        if (runtime.lastError || !response) { bridge(); return; }
        window.postMessage({ type: 'AUTOGUIDE_RESULT', requestId: payload.requestId, ...response }, location.origin);
      });
    } catch { bridge(); }
  }

  /**
   * Cancela a espera da solicitação atual e remove as referências usadas para acompanhar sua resposta.
   * @returns void.
   */
  private clearPlaybackRequest(): void {
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    if (this.playbackListener) window.removeEventListener('message', this.playbackListener);
    this.playbackTimer = undefined;
    this.playbackListener = undefined;
    this.playbackStarting = false;
  }

  guideId!: string;
  guide: Guide | null = null;
  selectedStep: Step | null = null;
  guideTitle = '';
  generatingStepId: number | null = null;
  generatingAll = false;
  generatingAllNarration = false;
  narrationBatchMessage = '';
  @ViewChild(StepNarrationComponent) private activeNarration?: StepNarrationComponent;
  private cancelNarrationWait?: () => void;

  get narratableSteps(): Step[] {
    return (this.guide?.steps || []).filter(step =>
      step.text?.trim() && !step.narration_url && !step.live_narration_url
    );
  }

  get canGenerateAllNarration(): boolean {
    const narration = this.activeNarration;
    return this.canEdit && !this.generatingAllNarration && !this.generatingAll
      && this.generatingStepId === null && !this.savingStepIds.size && this.narratableSteps.length > 0
      && !(narration?.recording || narration?.requesting || narration?.saving || narration?.draft);
  }
  generationMessage = '';
  private destroyed = false;
  aiMessages: Record<number, string> = {};
  isVideoRendering = false;
  videoJobProgress = 0;
  activeVideoJob: VideoJob | null = null;
  private pollInterval: any;
  private saveTimeout: any;

  /**
   * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
   * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
   * @param guideService — GuideService; contrato tipado na assinatura.
   * @param router — Router; roteador injetado para navegação.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  get avatarInitials(): string {
    const user = this.auth.currentUser();
    const name = user?.first_name?.trim() || user?.email || user?.username || '';
    return name.split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase() || 'O';
  }

  private stepTitle(step: Step): string {
    return this.getPrintStepTitle(step);
  }

  displayStepTitle(step: Step): string {
    return this.stepTitle(step).replace(/\S+@[^\s@]+\.[^\s@]+.*/, '…');
  }

  beginTitleEdit(event: Event, step: Step): void {
    if (this.canEdit) (event.target as HTMLTextAreaElement).value = this.stepTitle(step);
  }

  saveStepTitle(event: Event, step: Step): void {
    if (!this.canEdit) return;
    const input = event.target as HTMLTextAreaElement;
    const title = input.value.trim().slice(0, 90);
    if (title === this.stepTitle(step)) {
      input.value = this.displayStepTitle(step);
      return;
    }
    const annotations = (step.annotations || []).filter(item => item.type !== 'editor_step_title');
    if (title) annotations.push({type: 'editor_step_title', title});
    this.guideService.updateStep(step.id, {annotations}).subscribe({
      next: () => { step.annotations = annotations; input.value = this.displayStepTitle(step); },
      error: () => { input.value = this.displayStepTitle(step); this.saveMessage = 'Não foi possível salvar o título do passo.'; },
    });
  }

  constructor(
    private route: ActivatedRoute,
    private guideService: GuideService,
    private router: Router,
    private dialogs: DialogService,
    private auth: AuthService
  ) {}

  /**
   * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
   * @returns void.
   */
  private authorizationTimer?: ReturnType<typeof setInterval>;
  private checkingAuthorization = false;
  /** Atualiza somente permissões, preservando os textos ainda em edição. */
  private refreshAuthorization(): void {
    if(this.destroyed || this.checkingAuthorization || !this.guide || document.hidden)return;
    this.checkingAuthorization=true;
    this.refreshApprovals(this.guide.id);
    this.guideService.getGuide(this.guideId).subscribe({
      next: fresh=>{if(this.guide){this.guide.test_authorized=fresh.test_authorized;this.guide.can_start_playback=fresh.can_start_playback;}this.checkingAuthorization=false;},
      error:()=>{if(this.guide)this.guide.can_start_playback=false;this.checkingAuthorization=false;}
    });
  }
  ngOnInit(): void {
    this.authorizationTimer=setInterval(()=>this.refreshAuthorization(),10000);
    this.guideId = this.route.snapshot.paramMap.get('id') || '';
    if (this.guideId) {
      this.loadGuide();
    }
  }

  /**
   * Libera os recursos mantidos pelo componente ao sair da tela, conforme os timers, listeners e objetos registrados neste fluxo.
   * @returns void.
   */
  ngOnDestroy(): void {
    this.destroyed = true;
    clearInterval(this.authorizationTimer);
    this.cancelNarrationWait?.();
    this.clearPlaybackRequest();
    this.textTimers.forEach(timer=>clearTimeout(timer));
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
  }

  /**
   * Busca o guia na API e inicializa os passos e estados do editor a partir da resposta.
   * @returns void.
   */
  loadGuide(): void {
    this.guideService.getGuide(this.guideId).subscribe({
      next: /* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param data — dados do contrato enviado ao serviço. | @returns void/undefined; efeitos nas operações do corpo. */ (data) => {
        this.guide = data;
        this.refreshApprovals(data.id);
        this.guideTitle = data.title;
        if (this.route.snapshot.queryParamMap.get('generate') === 'voice') {
          this.router.navigate([], {relativeTo:this.route, queryParams:{generate:null}, queryParamsHandling:'merge', replaceUrl:true});
          void this.generateAllInstructions(true);
        }
        if (data.steps && data.steps.length > 0) {
          const reference = this.route.snapshot.queryParamMap.get('referenceStep');
          const index = reference && /^[1-9]\d*$/.test(reference) ? Number(reference) - 1 : -1;
          const step = data.steps[index];
          this.selectedStep = step || data.steps[0];
          if (step) setTimeout(() => this.selectStep(step), 0);
        }
      },
      error: /* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ () => {
        this.router.navigate(['/guides']);
      }
    });
  }

  /**
   * Expõe a autorização de edição recebida da API para habilitar os controles do editor.
   * @returns boolean.
   */
  get isGuideOwner(): boolean { return this.guide?.can_edit === true; }
  get canEdit(): boolean { return this.isGuideOwner; }
  /**
   * Solicita a criação de um passo manual e incorpora o registro confirmado pela API ao editor.
   * @returns void.
   */
  addStep(): void { if(!this.canEdit || !this.guide)return; this.guideService.createStep(this.guideId).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param step — passo com instruções, imagem e metadados. | @returns void/undefined; efeitos nas operações do corpo. */ step=>{this.guide!.steps=[...(this.guide!.steps||[]),step];this.selectStep(step);},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns expressão calculada/comparada no corpo. */ ()=>this.saveMessage="Não foi possível adicionar o passo."}); }
  saveMessage = '';
  activeOutlineId: number | null = null;
  savingStepIds = new Set<number>();
  private textTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /**
   * Atualiza o passo ativo com base na navegação/visibilidade usada pelo editor.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns void.
   */
  activateStep(step: Step): void { this.selectedStep = step; this.activeOutlineId=step.id; }
  /**
   * Seleciona o passo do editor e sincroniza a navegação visual do procedimento.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns void.
   */
  selectStep(step: Step): void {
    this.selectedStep = step;
    document.getElementById('step-' + step.id)?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  /**
   * Atualiza a seleção visual do passo durante a rolagem do documento.
   * @param event — Event; evento do navegador ou ação capturada.
   * @returns void.
   */
  onDocumentScroll(event: Event): void {
    const container = event.target as HTMLElement;
    const top = container.getBoundingClientRect().top + 80;
    const cards = Array.from(container.querySelectorAll<HTMLElement>('.step-card'));
    const closest = cards.reduce<HTMLElement | null>((best,card) => !best || Math.abs(card.getBoundingClientRect().top-top) < Math.abs(best.getBoundingClientRect().top-top) ? card : best,null);
    // Mantém o editor com microfone montado durante a rolagem para não interromper a gravação.
    if (closest) {
      this.activeOutlineId=Number(closest.id.replace('step-',''));
      container.querySelectorAll('.step-card').forEach(card=>card.classList.toggle('in-view',card===closest));
    }
  }
  /**
   * Persiste a instrução editada no passo e mantém o tratamento de resposta e falha da API.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns void.
   */
  saveStepText(step: Step): void {
    if (!this.canEdit) return;
    const previous = this.textTimers.get(step.id); if (previous) clearTimeout(previous);
    this.textTimers.set(step.id,setTimeout(()=>{
      this.savingStepIds.add(step.id);
      this.guideService.updateStep(step.id,{text:step.text}).subscribe({
        next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.savingStepIds.delete(step.id);this.saveMessage='Alterações salvas.';},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.savingStepIds.delete(step.id);this.saveMessage='Não foi possível salvar o texto. Edite novamente para tentar.';}
      });this.textTimers.delete(step.id);
    },600));
  }
  /**
   * Persiste as anotações de enquadramento sem substituir os demais metadados da captura.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @param zoom — number; contrato tipado na assinatura.
   * @returns void.
   */
  saveStepZoom(step: Step, zoom: number): void {
    if (!this.canEdit) return;
    const annotations = (step.annotations || []).filter(a=>a.type!=='image_view');
    annotations.push({type:'image_view',zoom});
    this.guideService.updateStep(step.id,{annotations}).subscribe({
      next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{step.annotations=annotations;this.saveMessage='Enquadramento salvo.';},
      error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.saveMessage='Não foi possível salvar o enquadramento.';}
    });
  }

  /**
   * Envia a edição do título do guia para persistência na API.
   * @returns void.
   */
  saveGuideTitle(): void {
    if (!this.canEdit) return;
    if (this.guideTitle && this.guideTitle !== this.guide?.title) {
      this.guideService.updateGuide(this.guideId, { title: this.guideTitle }).subscribe();
    }
  }

  /**
   * Registra a edição da instrução e agenda a persistência conforme o fluxo de rascunhos do editor.
   * @returns void.
   */
  onStepTextChange(): void {
    if (!this.canEdit) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      if (this.selectedStep) {
        this.guideService.updateStep(this.selectedStep.id, { text: this.selectedStep.text }).subscribe();
      }
    }, 600);
  }

  /**
   * Solicita a exclusão do passo autorizado e atualiza a sequência após a resposta.
   * @param stepId — number; contrato tipado na assinatura.
   * @param event — Event; evento do navegador ou ação capturada.
   * @returns void.
   */
  async deleteStep(stepId: number, event: Event): Promise<void> {
    if (!this.canEdit) return;
    event.stopPropagation();
    if (await this.dialogs.confirm('Deseja excluir este passo? Esta ação remove o texto e a captura desta etapa.',{title:'Excluir passo',confirmText:'Excluir passo',danger:true})) {
      this.guideService.deleteStep(stepId).subscribe(() => {
        if (this.guide && this.guide.steps) {
          this.guide.steps = this.guide.steps.filter(s => s.id !== stepId);
          if (this.selectedStep?.id === stepId) {
            this.selectedStep = this.guide.steps[0] || null;
          }
        }
      });
    }
  }

  /**
   * Verifica se o passo possui narração individual ou referência à gravação compartilhada.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns boolean.
   */
  private hasNarration(step?: Step): boolean {
    return !!(step?.narration_url || step?.live_narration_url || (!step && (this.guide?.capture_audio_url || this.guide?.steps?.some(s => s.narration_url || s.live_narration_url))));
  }

  /**
   * Conclui as persistências de rascunhos pendentes antes da operação que depende do texto atualizado.
   * @param steps — Step[]; contrato tipado na assinatura.
   * @returns Promise<void>.
   */
  private async flushDrafts(steps: Step[]): Promise<void> {
    const pending = steps.filter(step => this.textTimers.has(step.id));
    for (const step of pending) { clearTimeout(this.textTimers.get(step.id)); this.textTimers.delete(step.id); }
    for (const step of pending) await firstValueFrom(this.guideService.updateStep(step.id, {text:step.text}));
  }

  /**
   * Orquestra a geração de uma instrução com tratamento de estado e erro no editor.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns Promise<void>.
   * @throws exceção do fluxo nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
   */
  private async generateOne(step: Step): Promise<void> {
    const /* identificador do acompanhamento temporal; deve ser liberado no encerramento do componente. */ timer = this.textTimers.get(step.id);
    if (timer) {
      clearTimeout(timer); this.textTimers.delete(step.id);
      await firstValueFrom(this.guideService.updateStep(step.id, {text:step.text}));
    }
    this.generatingStepId = step.id;
    this.aiMessages[step.id] = '';
    try {
      const result = await firstValueFrom(this.guideService.generateStepText(this.guideId, step.id, step.generation_prompt_mode === 'automatic' ? '' : step.generation_prompt || '', step.generation_prompt_mode));
      step.text = result.text; step.generation_prompt = result.generation_prompt;
      step.generation_prompt_suggestion = result.generation_prompt_suggestion;
      step.generation_prompt_mode = result.generation_prompt_mode;
      step.annotations = result.annotations;
      this.aiMessages[step.id] = 'Instrução gerada e salva. Revise antes de compartilhar.';
    } catch (err: any) {
      this.aiMessages[step.id] = err.error?.detail || 'Não foi possível gerar a instrução. O texto anterior foi preservado.';
      throw err;
    } finally { this.generatingStepId = null; }
  }

  /**
   * Solicita geração textual para o contexto indicado e aplica a resposta confirmada pelo serviço.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @param narrated — valor recebido do contexto chamador (padrão: false).
   * @returns Promise<void>.
   */
  async generateStepText(step: Step, narrated = false): Promise<void> {
    if (!this.canEdit) return;
    if (this.generatingAllNarration || this.generatingAll || this.generatingStepId !== null || this.savingStepIds.size) return;
    this.generatingStepId = step.id;
    try {
      await this.flushDrafts([step]);
      if (narrated || this.hasNarration(step)) {
        this.aiMessages[step.id] = 'Transcrevendo a narração deste passo…';
        await firstValueFrom(this.guideService.prepareNarration(this.guideId, step.id));
      }
      await this.generateOne(step);
    } catch (err: any) {
      this.aiMessages[step.id] = err.error?.detail || 'Não foi possível gerar a instrução. O áudio e o texto anterior foram preservados.';
    } finally { this.generatingStepId = null; }
  }

  /**
   * Percorre os passos para gerar instruções, mantendo estados de processamento e falhas do fluxo existente.
   * @param automatic — valor recebido do contexto chamador (padrão: false).
   * @returns Promise<void>.
   */
  async generateAllInstructions(automatic = false): Promise<void> {
    if (!this.canEdit) return;
    if (this.generatingAllNarration || this.generatingAll || this.generatingStepId !== null || this.savingStepIds.size || !this.guide?.steps?.length) return;
    if (!automatic && !(await this.dialogs.confirm('Gerar as instruções de todas as capturas? Os textos atuais serão substituídos nos passos gerados com sucesso.',{title:'Gerar instruções',confirmText:'Gerar todas as instruções'}))) return;
    if(this.generatingAllNarration || this.generatingAll || this.generatingStepId !== null || this.savingStepIds.size || !this.canEdit)return;
    this.generatingAll = true;
    const steps = [...this.guide.steps];
    let completed = 0, failed = 0;
    try {
      await this.flushDrafts(steps);
      if (this.hasNarration()) {
        this.generationMessage = 'Transcrevendo a narração e associando a fala aos passos…';
        await firstValueFrom(this.guideService.prepareNarration(this.guideId));
      }
      for (let i = 0; i < steps.length && !this.destroyed; i++) {
        this.generationMessage = 'Gerando passo ' + (i + 1) + ' de ' + steps.length + '…';
        try { await this.generateOne(steps[i]); completed++; } catch { failed++; }
      }
      this.generationMessage = completed + ' instruções geradas.' + (failed ? ' ' + failed + ' passos falharam e mantiveram o texto anterior. Você pode tentar novamente individualmente.' : ' Revise o guia antes de compartilhar.');
    } catch (err: any) {
      this.generationMessage = err.error?.detail || 'Não foi possível preparar a narração. O áudio e os textos foram preservados. Tente novamente.';
    } finally { this.generatingAll = false; this.generatingStepId = null; }
  }

  /** Gera apenas áudio faltante. Um erro nunca desfaz os passos já salvos. */
  async generateAllNarration(): Promise<void> {
    if (!this.canGenerateAllNarration) return;
    const confirmed = await this.dialogs.confirm(
      'Gerar áudio para os passos com instrução e sem narração? Os áudios existentes serão preservados.',
      {title: 'Gerar narrações', confirmText: 'Gerar narrações'}
    );
    if (!confirmed || this.destroyed || !this.canGenerateAllNarration) return;

    const steps = this.narratableSteps;
    this.generatingAllNarration = true;
    let completed = 0;
    let failed = 0;
    let lastError = '';
    let stopped = false;
    try {
      for (const [index, step] of steps.entries()) {
        if (this.destroyed) return;
        this.narrationBatchMessage = 'Gerando narração ' + (index + 1) + ' de ' + steps.length + '…';
        try {
          await this.flushDrafts([step]);
          if (this.destroyed) return;
          const updated = await this.generateMissingNarration(step);
          if (this.destroyed || !updated) return;
          step.narration_url = updated.narration_url;
          completed++;
        } catch (error: any) {
          lastError = typeof error?.error?.detail === 'string' ? error.error.detail : 'Não foi possível salvar um dos áudios.';
          if ([0, 401, 403, 429].includes(error?.status) || error?.status >= 500) {
            stopped = true;
            break;
          }
          failed++;
        }
      }
      const remaining = steps.length - completed;
      this.narrationBatchMessage = completed + ' de ' + steps.length + ' narrações geradas.';
      if (stopped || failed) {
        this.narrationBatchMessage += ' ' + lastError + ' ' + remaining
          + ' pendente(s). Use o botão novamente para retomar.';
      }
    } finally {
      this.generatingAllNarration = false;
    }
  }

  private async generateMissingNarration(step: Step): Promise<Step | null> {
    const generate = () => firstValueFrom(this.guideService.generateSpeech(
      Number(this.guideId), step.id, step.text, false, true
    ));
    try {
      return await generate();
    } catch (error: any) {
      if (error?.status !== 429 || this.destroyed) throw error;
      // O limite local devolve 429. A cota do provedor devolve 503 e encerra o lote.
      const retry = Number(error.headers?.get('Retry-After'));
      const seconds = Number.isFinite(retry) && retry > 0 ? Math.min(61, Math.ceil(retry) + 1) : 61;
      this.narrationBatchMessage = 'Aguardando o limite de requisições. O lote continuará em até ' + seconds + ' segundos.';
      await this.waitForNarrationQuota(seconds);
      return this.destroyed ? null : await generate();
    }
  }

  private waitForNarrationQuota(seconds: number): Promise<void> {
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        this.cancelNarrationWait = undefined;
        resolve();
      };
      const timer = setTimeout(finish, seconds * 1000);
      this.cancelNarrationWait = finish;
    });
  }

  /**
   * Solicita a tarefa de vídeo e inicia o acompanhamento de progresso retornado pela API.
   * @returns void.
   */
  triggerVideoJob(): void {
    this.isVideoRendering = true;
    this.guideService.createVideoJob(this.guideId, { voice: 'default' }).subscribe({
      next: /* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param job — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ (job) => {
        this.activeVideoJob = job;
        this.pollVideoJob(job.id);
      },
      error: /* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ () => {
        this.isVideoRendering = false;
      }
    });
  }

  /**
   * Consulta periodicamente o estado da tarefa de vídeo até a condição de encerramento definida no corpo.
   * @param jobId — number; contrato tipado na assinatura.
   * @returns void.
   */
  pollVideoJob(jobId: number): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.guideService.getVideoJob(jobId).subscribe((job) => {
        this.activeVideoJob = job;
        this.videoJobProgress = job.progress;
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(this.pollInterval);
          this.isVideoRendering = false;
          if (job.status === 'completed') {
            void this.dialogs.alert('O processamento do vídeo foi concluído.','Processamento concluído');
          }
        }
      });
    }, 2000);
  }

  /**
   * Extrai a apresentação do título da instrução usada no documento impresso.
   * @param step — Step; passo com instruções, imagem e metadados.
   * @returns string.
   */
  getPrintStepTitle(step: Step): string {
    const meaningful = (value: string) => value && !/^(button|input|select|textarea|a|div|span|link|label|textbox|checkbox|radio|form|submit|element|elemento|botão|campo)$/i.test(value);
    const clean = (value?: string) => (value || '').trim().replace(/\s+/g, ' ');
    const shorten = (value: string) => value.length <= 90
      ? value : value.slice(0, 87).replace(/\s+\S*$/, '') + '…';
    const title = clean(step.annotations?.find(item => item.type === 'editor_step_title')?.title);
    if (meaningful(title) && title.length <= 90 && !clean(step.text).startsWith(title)) return title;

    const label = clean(step.element_text);
    const actions: Record<string, string> = {
      click: 'Selecione', input: 'Digite em', change: 'Selecione',
      navigation: 'Acesse', reference: 'Consulte'
    };
    if (meaningful(label)) return shorten((actions[step.action_type] || 'Selecione') + ' ' + label);

    const fallback: Record<string, string> = {
      input: 'Digite a informação no campo indicado',
      change: 'Selecione a opção indicada',
      click: 'Clique no controle destacado',
      navigation: 'Acesse a página do procedimento',
      reference: 'Consulte a tela de referência'
    };
    return fallback[step.action_type] || 'Siga a orientação do passo';
  }

  /**
   * Persiste a descrição do procedimento e mantém a mensagem de erro funcional quando a requisição falha.
   * @returns void.
   */
  saveGuideDescription(): void {
    if (!this.canEdit) return;
    if (!this.guide) return;
    this.guideService.updateGuide(this.guideId, {description:this.guide.description}).subscribe({
      next: /* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param updated — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ updated => { if(this.guide) this.guide.updated_at=updated.updated_at; this.saveMessage='Objetivo salvo.'; },
      error: /* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ () => { this.saveMessage='Não foi possível salvar o objetivo. Tente novamente.'; }
    });
  }

  /**
   * Monta o documento exportável do procedimento e inicia o download pelo navegador.
   * @returns void.
   */
  async exportHtml(): Promise<void> {
    if (!this.guide || this.printing) return;
    if (document.querySelector('.editor-shell [data-capture-loading]')) {
      this.printMessage = 'Aguarde o carregamento das capturas antes de exportar.';
      return;
    }

    this.printing = true;
    this.printMessage = '';
    try {
      const sources = new Set(Array.from(document.querySelectorAll('.editor-shell .capture-print image'))
        .map(image => image.getAttribute('href')).filter((source): source is string => !!source));
      await Promise.allSettled(Array.from(sources, source => {
        const image = new Image();
        image.src = source;
        return image.decode();
      }));
      if (!this.destroyed) window.print();
    } finally {
      this.printing = false;
    }
  }

  printing = false;
  printMessage = '';
}
