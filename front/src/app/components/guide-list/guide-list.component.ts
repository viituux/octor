import { OctorLoadingComponent } from '../shared/octor-loading.component';
import {OctorLogoComponent} from '../shared/octor-logo.component';
import {AISettingsComponent} from '../login/ai-settings.component';
import {DialogService} from '../../services/dialog.service';
import {NotificationBellComponent} from '../notifications/notification-bell.component';
import { OctorMediaDirective } from '../shared/octor-media.directive';
import {ThemeToggleComponent} from '../shared/theme-toggle.component';
import {OnboardingTourComponent} from '../shared/onboarding-tour.component';
/** Biblioteca: organiza procedimentos por contexto, seção e equipe; alterações de acesso e exclusão são confirmadas pela API. */
/**
 * Dependência ({ OctorIconComponent }): contratos e comportamento compartilhados de ../shared/octor-icon.component.
 */
import { OctorIconComponent } from '../shared/octor-icon.component';
/**
 * Dependência ({ Component, OnInit, OnDestroy, HostListener }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { afterNextRender, Component, HostListener, Injector, OnDestroy, OnInit, ViewChild } from '@angular/core';
/**
 * Dependência ({ CommonModule }): diretivas e apresentação compartilhada dos templates Angular.
 */
import { CommonModule } from '@angular/common';
/**
 * Dependência ({ FormsModule }): vínculo e validação dos formulários da interface.
 */
import { FormsModule } from '@angular/forms';
/**
 * Dependência ({ RouterModule, Router, ActivatedRoute }): rotas, parâmetros e navegação entre as telas.
 */
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
/**
 * Dependência ({ forkJoin, firstValueFrom }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import { forkJoin, firstValueFrom } from 'rxjs';
/**
 * Dependência ({ GuideService, Guide, Workspace, TeamMember, TeamInvite, UserSearchResult }): contratos e comportamento compartilhados de ../../services/guide.service.
 */
import { GuideService, Guide, Workspace, TeamMember, TeamInvite, UserSearchResult } from '../../services/guide.service';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ../../services/auth.service.
 */
import { AuthService } from '../../services/auth.service';

type Section = 'drafts'|'published'|'shared'|'starred'|'team'|'trash'|'settings'|'updates'|'search';
@Component({selector:'app-guide-list',standalone:true,imports:[OctorMediaDirective,OctorLoadingComponent,AISettingsComponent,OctorLogoComponent,OnboardingTourComponent,ThemeToggleComponent,NotificationBellComponent,OctorIconComponent,CommonModule,FormsModule,RouterModule],templateUrl:'./guide-list.component.html',styleUrls:['./guide-list.component.css']})
export class GuideListComponent implements OnInit, OnDestroy {
  memberQuery='';memberResults:UserSearchResult[]=[];memberSearchLoading=false;memberSearchDone=false;memberSearchError='';memberSearchVersion=0;
  guides:Guide[]=[];workspaces:Workspace[]=[];members:TeamMember[]=[];invitations:TeamInvite[]=[];
  /**
   * boolean: diferencia carga inicial, estado vazio e conteúdo já recebido.
   */
  loading=true;teamLoading=false;errorMessage='';notice='';section:Section='drafts';workspaceId:number|null=null;
  query='';view:'grid'|'list'='grid';mobileNav=false;saving=false;busyId:number|null=null;
  sidebarCollapsed=false;mobileViewport=false;
  @ViewChild(OnboardingTourComponent) tour?:OnboardingTourComponent;
  tourActive=false;private sidebarBeforeTour:{collapsed:boolean;mobile:boolean}|null=null;
  startTour(){this.tour?.start(true);}
  prepareTour(){this.sidebarBeforeTour={collapsed:this.sidebarCollapsed,mobile:this.mobileNav};this.tourActive=true;}
  tourStep(target:string|null){
    if(target==='[data-tour="manual-url"]'||target==='[data-tour="trainings"]'){this.sidebarCollapsed=false;this.mobileNav=this.mobileViewport;}
    else{this.sidebarCollapsed=this.sidebarBeforeTour?.collapsed??this.sidebarCollapsed;this.mobileNav=false;}
  }
  finishTour(event:{status:string;saved:boolean}){
    this.tourActive=false;
    if(this.sidebarBeforeTour){this.sidebarCollapsed=this.sidebarBeforeTour.collapsed;this.mobileNav=this.mobileViewport&&this.sidebarBeforeTour.mobile;}
    this.sidebarBeforeTour=null;
    if(!event.saved)this.notice='Tour encerrado. Não foi possível salvar a preferência na conta; ela fica registrada neste navegador.';
  }
  get sidebarOpen(){return this.mobileViewport?this.mobileNav:!this.sidebarCollapsed;}
  /** Desktop recolhe e persiste a preferência; no celular abre um painel temporário. */
  toggleSidebar(){
    if(this.mobileViewport){this.mobileNav=!this.mobileNav;if(this.mobileNav)setTimeout(()=>document.getElementById('library-sidebar-close')?.focus(),0);}
    else{this.sidebarCollapsed=!this.sidebarCollapsed;try{localStorage.setItem('octor_sidebar_collapsed',String(this.sidebarCollapsed));}catch{/* Recolhimento continua funcional nesta página. */}}
  }
  closeSidebar(){const open=this.mobileNav;this.mobileNav=false;if(open)setTimeout(()=>document.getElementById('library-menu-toggle')?.focus(),0);}
  @HostListener('window:resize') resizeSidebar(){this.mobileViewport=window.innerWidth<=720;if(!this.mobileViewport)this.mobileNav=false;}
  dialog:''|'workspace'|'invite'|'share'|'new'|'capture'='';dialogError='';newName='';email='';inviteUrl='';newTitle='';
  workspaceName='';selectedGuide:Guide|null=null;recipients:TeamMember[]=[];private previousFocus:HTMLElement|null=null;
  readonly sections:{id:Section;label:string;icon:string}[]=[{id:'drafts',label:'Rascunhos',icon:'draft'},{id:'published',label:'Publicados',icon:'check'},{id:'shared',label:'Compartilhados comigo',icon:'shared'},{id:'starred',label:'Favoritos',icon:'star'},{id:'team',label:'Biblioteca da equipe',icon:'users'},{id:'trash',label:'Lixeira',icon:'trash'}];
  /**
   * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
   * @param guideService — GuideService; contrato tipado na assinatura.
   * @param authService — AuthService; contrato tipado na assinatura.
   * @param router — Router; roteador injetado para navegação.
   * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  constructor(public guideService:GuideService,public authService:AuthService,private router:Router,private route:ActivatedRoute,private dialogs:DialogService,private injector:Injector){}
  /**
   * Calcula o nome de apresentação da conta com os dados disponíveis da sessão.
   * @returns expressão calculada/comparada no corpo.
   */
  get displayName(){return this.authService.currentUser()?.first_name || this.authService.currentUser()?.username || 'Meu espaço';}
  /**
   * Calcula as iniciais usadas na identificação visual da conta/equipe.
   * @returns resultado de this.displayName.slice(0,1).toUpperCase(...).
   */
  get initials(){return this.displayName.slice(0,1).toUpperCase();}
  /**
   * Escolhe o título do estado vazio conforme a seção selecionada.
   * @returns valor calculado no corpo.
   */
  get emptyTitle(){return this.query?'Nenhum resultado':this.section==='trash'?'Nenhum guia na lixeira':this.section==='starred'?'Seus favoritos ficam por aqui':this.section==='shared'?'Conhecimento fica melhor compartilhado':'Um oceano de possibilidades';}
  /**
   * Escolhe a orientação do estado vazio conforme a seção selecionada.
   * @returns valor calculado no corpo.
   */
  get emptyDescription(){return this.query?'Tente buscar por outro título.':this.section==='trash'?'Os guias que você excluir poderão ser restaurados aqui.':this.section==='starred'?'Marque a estrela de um guia para encontrá-lo rapidamente.':this.section==='shared'?'Guias compartilhados com você aparecerão nesta seção.':'Cada procedimento compartilhado leva sua equipe mais longe.';}
  /**
   * Resolve a equipe selecionada entre as equipes carregadas da API.
   * @returns resultado de this.workspaces.find(...).
   */
  get workspace(){return this.workspaces.find(w=>w.id===this.workspaceId);}
  /**
   * Deriva o título da biblioteca a partir da seção e da equipe selecionadas.
   * @returns valor calculado no corpo.
   */
  get heading(){return ({drafts:'Rascunhos',published:'Publicados',shared:'Compartilhados comigo',starred:'Favoritos',team:'Biblioteca da equipe',trash:'Lixeira',settings:'Configurações e membros',updates:'Novidades do OCTOR',search:'Buscar procedimentos'} as Record<Section,string>)[this.section];}
  /**
   * Deriva o texto de apoio da biblioteca a partir do contexto selecionado.
   * @returns valor calculado no corpo.
   */
  get subtitle(){return ({drafts:'Ideias em andamento, prontas para virar conhecimento.',published:'Procedimentos revisados e organizados neste espaço.',shared:'Guias que outras pessoas compartilharam diretamente com você.',starred:'Seus procedimentos importantes, sempre por perto.',team:'Guias publicados nos espaços dos quais você participa.',trash:'Seus guias excluídos ficam aqui até serem restaurados ou removidos definitivamente.',settings:'Organize seu espaço e gerencie quem faz parte dele.',updates:'Conheça os recursos disponíveis no seu OCTOR.',search:'Encontre guias pelo título ou pela descrição.'} as Record<Section,string>)[this.section];}
  /**
   * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
   * @returns void/undefined.
   */
  ngOnInit(){this.resizeSidebar();try{this.sidebarCollapsed=localStorage.getItem('octor_sidebar_collapsed')==='true';}catch{}if(!this.authService.isAuthenticated()){this.router.navigate(['/login']);return;}const value=localStorage.getItem('octor-library-view');if(value==='list')this.view='list';const id=Number(this.route.snapshot.queryParamMap.get('workspace'));if(id>0){this.workspaceId=id;this.section='team';}if(this.route.snapshot.queryParamMap.get('section')==='settings')this.section='settings';this.loadGuides();}
  /**
   * Verifica se o guia corresponde aos critérios de visualização informados.
   * @param g — Guide; contrato tipado na assinatura.
   * @param s — Section; contrato tipado na assinatura.
   * @returns boolean.
   */
  private matches(g:Guide,s:Section):boolean {
    if(s==='trash')return !!g.trashed_at&&g.can_edit===true;
    if(g.trashed_at)return false;
    const inSpace=(g.workspace??null)===this.workspaceId;
    if(s==='drafts')return inSpace&&g.can_edit===true&&g.status==='draft';
    if(s==='published')return inSpace&&g.can_edit===true&&g.status==='published';
    if(s==='shared')return !!g.shared_directly&&g.can_edit!==true;
    if(s==='starred')return !!g.is_favorite&&(!this.workspaceId||inSpace);
    if(s==='team')return !!g.workspace&&g.status==='published'&&(!this.workspaceId||inSpace);
    return s==='search';
  }
  /**
   * Conta os guias que correspondem à seção sem alterar a coleção recebida da API.
   * @param s — Section; contrato tipado na assinatura.
   * @returns this.guides.filter(g=>this.matches(g,s)).length.
   */
  count(s:Section){return this.guides.filter(g=>this.matches(g,s)).length;}
  /**
   * Produz a lista apresentada após aplicar os filtros locais da biblioteca.
   * @returns resultado de this.guides.filter(...).
   */
  get filteredGuides(){const q=this.query.trim().toLocaleLowerCase('pt-BR');return this.guides.filter(g=>this.matches(g,this.section)&&(!q||(g.title+' '+g.description).toLocaleLowerCase('pt-BR').includes(q)));}
  /**
   * Seleciona a seção da biblioteca e atualiza os dados/estado associados.
   * @param s — Section; contrato tipado na assinatura.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  setSection(s:Section){this.section=s;this.query='';this.closeSidebar();this.notice='';if(s==='settings')void this.loadTeam();if(s==='search')queueMicrotask(()=>document.getElementById('guide-search')?.focus());}
  /**
   * Troca o contexto de equipe e recarrega as informações correspondentes.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  changeWorkspace(){this.resetMemberSearch();this.workspaceName=this.workspace?.name||'';this.setSection(this.section==='settings'?'settings':'drafts');}
  /**
   * Atualiza a preferência local de apresentação dos guias.
   * @param v — 'grid'|'list'; contrato tipado na assinatura.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  setView(v:'grid'|'list'){this.view=v;localStorage.setItem('octor-library-view',v);}
  /**
   * Carrega a biblioteca usando o escopo selecionado e trata os estados de carga e falha.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  loadGuides(){this.loading=true;this.errorMessage='';forkJoin({guides:this.guideService.getGuides(true),spaces:this.guideService.workspaces()}).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param data — dados do contrato enviado ao serviço. | @returns void/undefined; efeitos nas operações do corpo. */ data=>{this.guides=data.guides;this.workspaces=data.spaces;if(this.workspaceId&&!this.workspace)this.workspaceId=null;this.workspaceName=this.workspace?.name||'';this.loading=false;if(this.section==='settings')void this.loadTeam();},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.loading=false;this.errorMessage='Não foi possível carregar a biblioteca. Tente atualizar novamente.';}});}
  /**
   * Carrega os dados de equipe utilizados nos controles de membros e convites.
   * @returns void/undefined.
   */
  async loadTeam(){this.members=[];this.invitations=[];const id=this.workspaceId;if(!id)return;this.teamLoading=true;try{const members=await firstValueFrom(this.guideService.members(id));if(this.workspaceId!==id)return;this.members=members;if(this.workspace?.role==='owner')this.invitations=await firstValueFrom(this.guideService.invites(id));}catch(e:any){this.errorMessage=e.error?.detail||'Não foi possível carregar a equipe.';}finally{this.teamLoading=false;}}
  ngOnDestroy(){this.memberSearchVersion++;}
  resetMemberSearch(){this.memberSearchVersion++;this.memberQuery='';this.memberResults=[];this.memberSearchDone=false;this.memberSearchLoading=false;this.memberSearchError='';}
  /** Busca explícita, limitada, com proteção contra respostas de outro espaço/termo. */
  async searchMembers(){
    const id=this.workspaceId;const q=this.memberQuery.trim();const version=++this.memberSearchVersion;
    this.memberResults=[];this.memberSearchError='';this.memberSearchDone=false;
    if(!id||q.length<2){this.memberSearchLoading=false;this.memberSearchError='Digite pelo menos 2 caracteres do nome de usuário.';return;}
    this.memberSearchLoading=true;
    try{const rows=await firstValueFrom(this.guideService.searchUsers(id,q));if(version!==this.memberSearchVersion||id!==this.workspaceId)return;this.memberResults=rows;this.memberSearchDone=true;}
    catch(e:any){if(version===this.memberSearchVersion)this.memberSearchError=e.error?.detail||'Não foi possível buscar os usuários.';}
    finally{if(version===this.memberSearchVersion)this.memberSearchLoading=false;}
  }
  /** Concede acesso somente após confirmação explícita e sucesso real da API. */
  async addMember(user:UserSearchResult){
    const id=this.workspaceId;
    if(!id||this.saving||!(await this.dialogs.confirm('Adicionar @'+user.username+' ao espaço '+this.workspace?.name+'? A pessoa terá acesso aos guias publicados da equipe.',{title:'Adicionar membro',confirmText:'Adicionar à equipe'})))return;
    if(this.saving||id!==this.workspaceId)return;
    this.saving=true;this.memberSearchError='';
    try{const rows=await firstValueFrom(this.guideService.addMember(id,user.id));if(id!==this.workspaceId)return;this.members=rows;this.memberResults=this.memberResults.filter(item=>item.id!==user.id);const w=this.workspace;if(w)w.member_count=rows.length;this.notice='@'+user.username+' adicionado à equipe. A pessoa recebeu uma notificação.';}
    catch(e:any){if(id===this.workspaceId)this.memberSearchError=e.error?.detail||'Não foi possível adicionar o usuário.';}
    finally{this.saving=false;}
  }
  /**
   * Prepara os dados e abre o diálogo da operação selecionada.
   * @param kind — typeof this.dialog; contrato tipado na assinatura.
   * @param guide — Guide; procedimento recebido da API.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  openDialog(kind:typeof this.dialog, guide?:Guide) {
    if (!this.dialog) this.previousFocus = document.activeElement as HTMLElement;
    this.dialog = kind;
    this.dialogError = '';
    this.email = '';
    this.inviteUrl = '';
    this.newName = '';
    this.newTitle = '';
    this.selectedGuide = guide || null;
    this.recipients = [];
    afterNextRender(() => {
      if (this.dialog === kind) document.getElementById('library-dialog-title')?.focus();
    }, { injector: this.injector });
    if (kind === 'share' && guide) {
      this.guideService.guideShares(guide.id).subscribe({
        next: items => this.recipients = items,
        error: () => this.dialogError = 'Não foi possível carregar os acessos.',
      });
    }
  }
  /**
   * Fecha o diálogo e limpa o estado transitório associado à operação.
   * @returns void/undefined.
   */
  closeDialog() {
    if (this.saving) return;
    this.dialog = '';
    const previousFocus = this.previousFocus;
    this.previousFocus = null;
    afterNextRender(() => {
      if (!this.dialog && previousFocus?.isConnected) previousFocus.focus();
    }, { injector: this.injector });
  }
  /**
   * Trata os atalhos de teclado previstos para busca e fechamento do diálogo.
   * @param e — KeyboardEvent; evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
   * @returns void/undefined.
   */
  @HostListener('document:keydown',['$event']) onKey(e:KeyboardEvent){
    if(this.tourActive)return;
    if(!this.dialog && this.mobileViewport && this.mobileNav && e.key==='Tab'){
      const controls=Array.from(document.querySelectorAll<HTMLElement>('#library-sidebar button:not([disabled]),#library-sidebar a,#library-sidebar select')).filter(n=>n.offsetParent!==null);
      if(controls.length){const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;
    }
    if (!this.dialog) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.setSection('search');
      }
      if (e.key === 'Escape') this.closeSidebar();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeDialog();
      return;
    }
    if (e.key !== 'Tab') return;

    const dialog = document.getElementById('library-dialog');
    const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
    ) ?? []).filter(control => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const focusOnControl = controls.some(control => control === document.activeElement);
    if (!focusOnControl || document.activeElement === (e.shiftKey ? first : last)) {
      e.preventDefault();
      (e.shiftKey ? last : first)?.focus();
    }
  }
  /**
   * Prepara a interface de convite no contexto da equipe selecionada.
   * @returns void/undefined.
   */
  invitePeople(){if(!this.workspaceId){this.openDialog('workspace');return;}if(this.workspace?.role!=='owner'){this.notice='Peça ao administrador do espaço para convidar novas pessoas.';return;}this.openDialog('invite');}
  /**
   * Solicita a criação da equipe e atualiza o contexto após a confirmação.
   * @returns void/undefined.
   */
  async createWorkspace(){if(!this.newName.trim()||this.saving)return;this.saving=true;try{const w=await firstValueFrom(this.guideService.createWorkspace(this.newName.trim()));this.workspaces.push(w);this.workspaceId=w.id;this.workspaceName=w.name;this.dialog='';this.setSection('settings');this.notice='Espaço criado. Agora você pode convidar sua equipe.';}catch(e:any){this.dialogError=e.error?.detail||'Não foi possível criar o espaço.';}finally{this.saving=false;}}
  /**
   * Persiste a alteração do nome da equipe pelo endpoint autorizado.
   * @returns void/undefined.
   */
  async renameWorkspace(){if(!this.workspaceId||!this.workspaceName.trim()||this.saving)return;this.saving=true;try{const w=await firstValueFrom(this.guideService.renameWorkspace(this.workspaceId,this.workspaceName.trim()));this.workspaces=this.workspaces.map(item=>item.id===w.id?w:item);this.notice='Nome do espaço atualizado.';}catch{this.errorMessage='Não foi possível alterar o nome.';}finally{this.saving=false;}}
  /**
   * Solicita a emissão de convite à equipe para o endereço informado.
   * @returns void/undefined.
   */
  async createInvitation(){if(!this.workspaceId||!this.email.trim()||this.saving)return;this.saving=true;try{const invite=await firstValueFrom(this.guideService.invite(this.workspaceId,this.email.trim()));this.inviteUrl=location.origin+'/join/'+invite.token;this.notice='Convite criado. Compartilhe o link com a pessoa convidada.';this.invitations=await firstValueFrom(this.guideService.invites(this.workspaceId));}catch(e:any){this.dialogError=e.error?.detail||e.error?.email?.[0]||'Não foi possível criar o convite.';}finally{this.saving=false;}}
  /**
   * Copia o endereço do convite pela API do navegador e informa o resultado.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  async copyInvite(){try{await navigator.clipboard.writeText(this.inviteUrl);this.notice='Link copiado.';}catch{this.dialogError='Selecione e copie o link exibido abaixo.';}}
  /**
   * Solicita a invalidação do convite selecionado na equipe.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns void/undefined.
   */
  async revokeInvitation(id:number){if(!this.workspaceId||this.saving)return;this.saving=true;try{this.invitations=await firstValueFrom(this.guideService.revokeInvite(this.workspaceId,id));this.notice='Convite revogado.';}catch{this.errorMessage='Não foi possível revogar o convite.';}finally{this.saving=false;}}
  /**
   * Solicita a remoção do membro e atualiza a apresentação da equipe.
   * @param member — TeamMember; contrato tipado na assinatura.
   * @returns void/undefined.
   */
  async removeMember(member:TeamMember){if(!this.workspaceId||this.saving||!(await this.dialogs.confirm('Remover '+member.name+' deste espaço? A pessoa perderá o acesso aos guias da equipe.',{title:'Remover membro',confirmText:'Remover membro',danger:true})))return;this.saving=true;try{this.members=await firstValueFrom(this.guideService.removeMember(this.workspaceId,member.id));this.notice='Membro removido.';}catch(e:any){this.errorMessage=e.error?.detail||'Não foi possível remover.';}finally{this.saving=false;}}
  /**
   * Envia a associação de compartilhamento direto do guia à API.
   * @returns void/undefined.
   */
  async shareGuide(){if(!this.selectedGuide||!this.email.trim()||this.saving)return;this.saving=true;try{this.recipients=await firstValueFrom(this.guideService.shareGuide(this.selectedGuide.id,this.email.trim()));this.email='';this.notice='Acesso de leitura concedido.';}catch(e:any){this.dialogError=e.error?.detail||'Não foi possível compartilhar.';}finally{this.saving=false;}}
  /**
   * Solicita a remoção de acesso compartilhado diretamente ao guia.
   * @param id — number; identificador do recurso ou elemento alvo.
   * @returns void/undefined.
   */
  async revokeShare(id:number){if(!this.selectedGuide||this.saving)return;this.saving=true;try{this.recipients=await firstValueFrom(this.guideService.revokeShare(this.selectedGuide.id,id));}catch{this.dialogError='Não foi possível revogar o acesso.';}finally{this.saving=false;}}
  /**
   * Altera o favorito pessoal do guia usando a confirmação da API.
   * @param g — Guide; contrato tipado na assinatura.
   * @returns void/undefined.
   */
  async favorite(g:Guide){if(this.busyId!==null)return;this.busyId=g.id;try{const result=await firstValueFrom(this.guideService.favorite(g.id,!g.is_favorite));g.is_favorite=result.is_favorite;}catch{this.errorMessage='Não foi possível alterar o favorito.';}finally{this.busyId=null;}}
  /**
   * Persiste os campos informados do guia sem interpretar alterações localmente como autorização.
   * @param g — Guide; contrato tipado na assinatura.
   * @param data — Partial<Guide>; dados do contrato enviado ao serviço.
   * @returns void/undefined.
   */
  async updateGuide(g:Guide,data:Partial<Guide>){if(this.busyId!==null)return;this.busyId=g.id;try{await firstValueFrom(this.guideService.updateGuide(g.id,data));Object.assign(g,data);g.workspace_name=this.workspaces.find(w=>w.id===g.workspace)?.name||null;this.notice='Guia atualizado.';}catch(e:any){this.errorMessage=e.error?.workspace?.[0]||e.error?.detail||'Não foi possível atualizar o guia.';}finally{this.busyId=null;}}
  /**
   * Move o guia para a lixeira pela operação de remoção lógica.
   * @param g — Guide; contrato tipado na assinatura.
   * @returns void/undefined.
   */
  async trash(g:Guide){if(this.busyId!==null||!(await this.dialogs.confirm('Mover este guia para a lixeira? Você poderá restaurá-lo depois.',{title:'Mover guia para a lixeira',confirmText:'Mover para lixeira',danger:true})))return;this.busyId=g.id;try{await firstValueFrom(this.guideService.deleteGuide(g.id));g.trashed_at=new Date().toISOString();this.notice='Guia movido para a lixeira.';}catch{this.errorMessage='Não foi possível mover para a lixeira.';}finally{this.busyId=null;}}
  /**
   * Solicita a restauração do guia da lixeira.
   * @param g — Guide; contrato tipado na assinatura.
   * @returns void/undefined.
   */
  async restore(g:Guide){if(this.busyId!==null)return;this.busyId=g.id;try{await firstValueFrom(this.guideService.restoreGuide(g.id));g.trashed_at=null;this.notice='Guia restaurado.';}catch{this.errorMessage='Não foi possível restaurar.';}finally{this.busyId=null;}}
  /**
   * Solicita a exclusão definitiva após a confirmação prevista na interface.
   * @param g — Guide; contrato tipado na assinatura.
   * @returns void/undefined.
   */
  async permanentlyDelete(g:Guide){if(this.busyId!==null||!(await this.dialogs.confirm('Excluir definitivamente este guia e seus passos? Esta ação não pode ser desfeita.',{title:'Excluir guia definitivamente',confirmText:'Excluir definitivamente',danger:true})))return;this.busyId=g.id;try{await firstValueFrom(this.guideService.permanentlyDelete(g.id));this.guides=this.guides.filter(item=>item.id!==g.id);this.notice='Guia excluído definitivamente.';}catch{this.errorMessage='Não foi possível excluir.';}finally{this.busyId=null;}}
  /**
   * Cria o procedimento e navega para sua edição após receber a identificação persistida.
   * @returns void/undefined.
   */
  async createGuide(){if(!this.newTitle.trim()||this.saving)return;this.saving=true;try{const g=await firstValueFrom(this.guideService.createGuide(this.newTitle.trim(),this.workspaceId));this.router.navigate(['/guides',g.id]);}catch{this.dialogError='Não foi possível criar o rascunho.';}finally{this.saving=false;}}
  /**
   * Limpa os dados locais usados pela sessão e atualiza a navegação/estado previstos neste contexto.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  logout(){this.authService.logout();this.router.navigate(['/login']);}
}
