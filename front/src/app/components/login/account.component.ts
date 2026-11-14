import {OctorLogoComponent} from '../shared/octor-logo.component';
/** Configurações da conta: carrega perfil, separa operações sensíveis e limpa credenciais transitórias após conclusão ou troca de contexto. */
/**
 * Dependência ({Component,OnInit,NgZone}): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import {Component,OnInit,OnDestroy,NgZone} from '@angular/core';
/**
 * Dependência ({CommonModule}): diretivas e apresentação compartilhada dos templates Angular.
 */
import {CommonModule} from '@angular/common';
/**
 * Dependência ({FormsModule}): vínculo e validação dos formulários da interface.
 */
import {FormsModule} from '@angular/forms';
/**
 * Dependência ({RouterModule,ActivatedRoute,Router}): rotas, parâmetros e navegação entre as telas.
 */
import {RouterModule,ActivatedRoute,Router} from '@angular/router';
/**
 * Dependência ({AuthService,User}): contratos e comportamento compartilhados de ../../services/auth.service.
 */
import {AuthService,User} from '../../services/auth.service';
/**
 * Dependência ({GoogleSignInComponent}): contratos e comportamento compartilhados de ./google-sign-in.component.
 */
import {GoogleSignInComponent} from './google-sign-in.component';
/**
 * Dependência ({OctorIconComponent}): contratos e comportamento compartilhados de ../shared/octor-icon.component.
 */
import {OctorIconComponent} from '../shared/octor-icon.component';
@Component({selector:'app-account',standalone:true,imports:[OctorLogoComponent,CommonModule,FormsModule,RouterModule,GoogleSignInComponent,OctorIconComponent],templateUrl:'./account.component.html',styleUrls:['./account.component.css']})
export class AccountComponent implements OnInit, OnDestroy {
 private readonly photoLimit = 5 * 1024 * 1024;
 private cropImage: HTMLImageElement | null = null;
 private avatarUrl = '';
 private hideGooglePhoto = false;
 private destroyed = false;
 photoFailed = false;
 photoBusy = false;
 photoError = '';
 cropZoom = 1;
 cropX = 50;
 cropY = 50;
 toast = '';
 private toastTimer?: ReturnType<typeof setTimeout>;

 get googleAccount() { return !!this.auth.currentUser()?.google_email; }
 get photo() {
  return this.photoFailed ? '' : this.avatarUrl || (this.hideGooglePhoto ? '' : this.auth.currentUser()?.google_picture || '');
 }

 private notify(text: string) {
  clearTimeout(this.toastTimer);
  this.toast = text;
  this.toastTimer = setTimeout(() => this.toast = '', 4500);
 }

 private loadAvatar() {
  this.photoBusy = true;
  this.auth.getAvatar().subscribe({
   next: async blob => {
    if (blob.type.includes('application/json')) {
     try { if (!this.destroyed) this.hideGooglePhoto = JSON.parse(await blob.text()).hidden === true; }
     catch { this.photoError = 'Não foi possível carregar a foto do perfil.'; }
    } else if (blob.size && !this.destroyed) {
     this.setAvatar(blob);
    }
    this.photoBusy = false;
   },
   error: () => {
    this.photoBusy = false;
    this.photoError = 'Não foi possível carregar a foto do perfil.';
   }
  });
 }

 private setAvatar(blob?: Blob) {
  URL.revokeObjectURL(this.avatarUrl);
  this.avatarUrl = blob ? URL.createObjectURL(blob) : '';
  this.photoFailed = false;
 }

 /** Carrega a imagem escolhida e abre o recorte somente após a decodificação. */
 async selectPhoto(event: Event, dialog: HTMLDialogElement, canvas: HTMLCanvasElement) {
  const control = event.target as HTMLInputElement;
  const file = control.files?.[0];
  control.value = '';
  if (!file || this.photoBusy) return;
  this.photoError = '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > this.photoLimit) {
   this.photoError = 'Selecione uma imagem JPG, PNG ou WebP de até 5 MB.';
   return;
  }
  this.photoBusy = true;
  const url = URL.createObjectURL(file);
  try {
   const image = new Image();
   image.src = url;
   await image.decode();
   if (this.destroyed || !dialog.isConnected) return;
   this.cropImage = image;
   this.cropZoom = 1;
   this.cropX = this.cropY = 50;
   this.drawCrop(canvas);
   dialog.showModal();
  } catch {
   this.photoError = 'Não foi possível abrir essa imagem.';
  } finally {
   URL.revokeObjectURL(url);
   this.photoBusy = false;
  }
 }

 /** Desenha a área selecionada diretamente na resolução enviada à API. */
 drawCrop(canvas: HTMLCanvasElement) {
  const image = this.cropImage;
  const context = canvas.getContext('2d');
  if (!image || !context) return;
  const size = Math.min(image.naturalWidth, image.naturalHeight) / this.cropZoom;
  const x = (image.naturalWidth - size) * this.cropX / 100;
  const y = (image.naturalHeight - size) * this.cropY / 100;
  context.clearRect(0, 0, 512, 512);
  context.drawImage(image, x, y, size, size, 0, 0, 512, 512);
 }

 savePhoto(dialog: HTMLDialogElement, canvas: HTMLCanvasElement) {
  if (this.photoBusy) return;
  this.photoBusy = true;
  this.photoError = '';
  canvas.toBlob(blob => {
   if (!blob || this.destroyed) {
    this.photoBusy = false;
    this.photoError = 'Não foi possível preparar o recorte.';
    return;
   }
   this.auth.updateAvatar(blob).subscribe({
    next: () => {
     if (!this.destroyed) {
      this.setAvatar(blob);
      dialog.close();
      this.notify('Foto atualizada');
     }
     this.photoBusy = false;
    },
    error: () => {
     this.photoBusy = false;
     this.photoError = 'Não foi possível enviar a foto. Tente novamente.';
    }
   });
  }, 'image/png');
 }

 removePhoto() {
  if (this.photoBusy || !this.photo) return;
  this.photoBusy = true;
  this.photoError = '';
  this.auth.removeAvatar().subscribe({
   next: () => {
    if (this.destroyed) return;
    this.hideGooglePhoto = true;
    this.setAvatar();
    this.photoBusy = false;
    this.notify('Foto removida');
   },
   error: () => {
    this.photoBusy = false;
    this.photoError = 'Não foi possível remover a foto. Tente novamente.';
   }
  });
 }

 clearCrop() { this.cropImage = null; }

 ngOnDestroy() {
  this.destroyed = true;
  clearTimeout(this.toastTimer);
  URL.revokeObjectURL(this.avatarUrl);
 }

 section:'profile'|'security'|'connections'='profile';/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=true;saving=false;loadError='';private statusMessage='';error='';errors:Record<string,string>={};
 firstName='';lastName='';username='';email='';profilePassword='';emailPassword='';currentPassword='';newPassword='';confirmation='';revokePassword='';showPassword=false;
 profileProof:{credential:string;challenge:string}|null=null;emailProof:{credential:string;challenge:string}|null=null;passwordProof:{credential:string;challenge:string}|null=null;revokeProof:{credential:string;challenge:string}|null=null;
 /**
  * Converte a falha recebida em mensagem de apresentação, sem mudar o resultado da operação.
  * @returns this.statusMessage.
  */
 get message(){return this.statusMessage;}
 /**
  * Converte a falha recebida em mensagem de apresentação, sem mudar o resultado da operação.
  * @param value — string; valor recebido pelo controle ou transformação.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 set message(value:string){this.statusMessage=value;if(value)setTimeout(()=>document.getElementById('account-success')?.focus(),0);}
 extensionId='';connecting=false;
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param auth — AuthService; contrato tipado na assinatura.
  * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
  * @param router — Router; roteador injetado para navegação.
  * @param zone — NgZone; zona Angular usada para refletir callbacks externos na interface.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(public auth:AuthService,private route:ActivatedRoute,private router:Router,private zone:NgZone){}
 /**
  * Expõe se a conta autenticada possui senha local configurada.
  * @returns expressão calculada/comparada no corpo.
  */
 get hasPassword(){return this.auth.currentUser()?.has_password!==false;}
 /**
  * Compara os campos de nome editados com os dados carregados da conta.
  * @returns expressão calculada/comparada no corpo.
  */
 get nameChanged(){return !this.googleAccount && this.username.trim()!==this.auth.currentUser()?.username;}
 /**
  * Verifica se o formulário de perfil contém alterações ainda não persistidas.
  * @returns expressão calculada/comparada no corpo.
  */
 get profileDirty(){const u=this.auth.currentUser();return !!u&&(this.firstName.trim()!==(u.first_name||'')||this.lastName.trim()!==(u.last_name||'')||this.nameChanged);}
 /**
  * Verifica se o e-mail editado difere do valor recebido da API.
  * @returns expressão calculada/comparada no corpo.
  */
 get emailDirty(){return this.email!==this.auth.currentUser()?.email;}
 /**
  * Calcula as iniciais usadas na identificação visual da conta/equipe.
  * @returns resultado de ((this.auth.currentUser()?.first_name||this.auth.currentUser()?.username||'O').slice(0,1)+(this.auth.currentUs(...).
  */
 get initials(){return ((this.auth.currentUser()?.first_name||this.auth.currentUser()?.username||'O').slice(0,1)+(this.auth.currentUser()?.last_name||'').slice(0,1)).toUpperCase();}
 /**
  * Inicializa o componente usando a rota e os serviços; dispara a carga inicial e os acompanhamentos declarados no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 ngOnInit(){const id=this.route.snapshot.queryParamMap.get('extension')||'';this.extensionId=/^[a-p]{32}$/.test(id)?id:'';if(this.extensionId)this.section='connections';this.load();}
 /**
  * Executa a etapa `load` do fluxo de account.component.ts; os retornos abaixo identificam o contrato entregue ao chamador.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 load(){this.loading=true;this.loadError='';this.auth.me().subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param u — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ u=>{this.fill(u);this.loading=false;this.loadAvatar();},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ e=>{this.loading=false;if(e.status===401){this.auth.logout();this.router.navigate(['/login'],{queryParams:{returnUrl:'/account'}});}else this.loadError='Não foi possível carregar sua conta. Tente novamente.';}});}
 /**
  * Preenche o formulário local com os dados de perfil retornados pela API.
  * @param u — User; contrato tipado na assinatura.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 fill(u:User){this.firstName=u.first_name||'';this.lastName=u.last_name||'';this.username=u.username;this.email=u.email;}
 /**
  * Troca a seção das configurações e limpa os dados transitórios definidos neste fluxo.
  * @param value — typeof this.section; valor recebido pelo controle ou transformação.
  * @returns void/undefined.
  */
 tab(value:typeof this.section){if(this.saving||this.connecting)return;this.section=value;this.message='';this.error='';this.errors={};this.clearSecrets();}
 /**
  * Limpa credenciais digitadas do formulário após concluir ou trocar uma operação sensível.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 clearSecrets(){this.showPassword=false;this.profilePassword='';this.emailPassword='';this.currentPassword='';this.newPassword='';this.confirmation='';this.revokePassword='';this.profileProof=null;this.emailProof=null;this.passwordProof=null;this.revokeProof=null;}
 /**
  * Prepara o estado de uma operação do formulário evitando submissões concorrentes.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 begin(){this.saving=true;this.message='';this.error='';this.errors={};}
 /**
  * Restaura o estado da interface e apresenta os erros de validação recebidos.
  * @param e — any; evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 failure(e:any){this.saving=false;this.error=e.error?.detail||'Revise os campos e tente novamente.';this.errors={};for(const [key,value] of Object.entries(e.error||{})){if(key!=='detail')this.errors[key]=Array.isArray(value)?value.join(' '):String(value);}this.profileProof=null;this.emailProof=null;this.passwordProof=null;this.revokeProof=null;setTimeout(()=>document.getElementById('account-error')?.focus(),0);}
 /**
  * Envia os campos do perfil para validação/persistência no servidor.
  * @returns void/undefined.
  */
 saveProfile(){if(this.saving||!this.profileDirty)return;this.begin();this.auth.updateProfile({first_name:this.firstName.trim(),last_name:this.lastName.trim(),...(!this.googleAccount ? {username:this.username.trim()} : {}),current_password:this.profilePassword,...(this.profileProof||{})}).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param u — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ u=>{this.fill(u);this.saving=false;this.clearSecrets();this.notify('Perfil salvo');},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns resultado de this.failure(...). */ e=>this.failure(e)});}
 /**
  * Envia o novo e-mail com a comprovação de identidade exigida pelo servidor.
  * @returns void/undefined.
  */
 saveEmail(){if(this.saving||!this.emailDirty)return;this.begin();this.auth.updateProfile({email:this.email.trim(),current_password:this.emailPassword,...(this.emailProof||{})}).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @param u — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ u=>{this.email=u.email;this.saving=false;this.clearSecrets();this.message='E-mail atualizado. Sua conta Google vinculada permanece a mesma.';},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns resultado de this.failure(...). */ e=>this.failure(e)});}
 /**
  * Envia senha nova e confirmação; a sessão retornada substitui a versão anterior após sucesso.
  * @returns void/undefined.
  */
 savePassword(){if(this.saving)return;this.begin();this.auth.changePassword({current_password:this.currentPassword,new_password:this.newPassword,confirmation:this.confirmation,...(this.passwordProof||{})}).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.saving=false;this.clearSecrets();this.message='Senha atualizada. Os acessos anteriores foram encerrados. Reconecte a extensão, se estiver usando.';},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns resultado de this.failure(...). */ e=>this.failure(e)});}
 /**
  * Solicita a revogação das outras sessões com a comprovação de identidade exigida.
  * @returns void/undefined.
  */
 revokeSessions(){if(this.saving)return;this.begin();this.auth.revokeOtherSessions({current_password:this.revokePassword,...(this.revokeProof||{})}).subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.saving=false;this.clearSecrets();this.message='Outros acessos foram encerrados. Este navegador continua conectado. Reconecte a extensão para continuar gravando.';},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns resultado de this.failure(...). */ e=>this.failure(e)});}
 /**
  * Aplica o perfil recebido após vincular a identidade Google à conta atual.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 linked(){this.message='Conta Google vinculada.';}
 /**
  * Limpa os dados locais usados pela sessão e atualiza a navegação/estado previstos neste contexto.
  * @returns void/undefined.
  */
 logout(){if(this.saving||this.connecting)return;this.auth.logout();this.router.navigate(['/login']);}
 /**
  * Verifica a extensão informada pela interface e solicita o pareamento da sessão.
  * @returns void.
  */
 connectExtension():void{
  const runtime=(window as any).chrome?.runtime;
  if(!runtime?.sendMessage){this.message='Recarregue a extensão e abra esta página pelo botão Entrar pelo navegador.';return;}
  this.connecting=true;
  this.auth.extensionSession().subscribe({next: session => {
  const timeout=setTimeout(()=>{this.connecting=false;this.message='A extensão não respondeu. Recarregue-a e tente novamente.';},15000);
  runtime.sendMessage(this.extensionId,{action:'CONNECT_ACCOUNT',access:session.access,refresh:session.refresh},(response:any)=>this.zone.run(()=>{
   clearTimeout(timeout);this.connecting=false;
   if(response?.success)localStorage.setItem('autoguide_extension_id',this.extensionId);
   this.message=runtime.lastError?'Não foi possível conectar à extensão. Recarregue-a e tente novamente.':response?.success?'Conta conectada. Você já pode gravar pela barra lateral.':response?.error || 'Falha ao conectar a conta.';
  }));
  }, error: () => {this.connecting=false;this.message='Não foi possível emitir a sessão da extensão. Tente novamente.';}});
 }
}
