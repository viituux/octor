import {Component,OnInit,NgZone} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule,ActivatedRoute,Router} from '@angular/router';
import {AuthService,User} from '../../services/auth.service';
import {GoogleSignInComponent} from './google-sign-in.component';
import {OctorIconComponent} from '../shared/octor-icon.component';
@Component({selector:'app-account',standalone:true,imports:[CommonModule,FormsModule,RouterModule,GoogleSignInComponent,OctorIconComponent],templateUrl:'./account.component.html',styleUrls:['./account.component.css']})
export class AccountComponent implements OnInit{
 section:'profile'|'security'|'connections'='profile';loading=true;saving=false;loadError='';private statusMessage='';error='';errors:Record<string,string>={};
 firstName='';lastName='';username='';email='';profilePassword='';emailPassword='';currentPassword='';newPassword='';confirmation='';revokePassword='';showPassword=false;
 profileProof:{credential:string;challenge:string}|null=null;emailProof:{credential:string;challenge:string}|null=null;passwordProof:{credential:string;challenge:string}|null=null;revokeProof:{credential:string;challenge:string}|null=null;
 get message(){return this.statusMessage;}
 set message(value:string){this.statusMessage=value;if(value)setTimeout(()=>document.getElementById('account-success')?.focus(),0);}
 extensionId='';connecting=false;
 constructor(public auth:AuthService,private route:ActivatedRoute,private router:Router,private zone:NgZone){}
 get hasPassword(){return this.auth.currentUser()?.has_password!==false;}
 get nameChanged(){return this.username!==this.auth.currentUser()?.username;}
 get profileDirty(){const u=this.auth.currentUser();return !!u&&(this.firstName!==u.first_name||this.lastName!==(u.last_name||'')||this.username!==u.username);}
 get emailDirty(){return this.email!==this.auth.currentUser()?.email;}
 get initials(){return ((this.auth.currentUser()?.first_name||this.auth.currentUser()?.username||'O').slice(0,1)+(this.auth.currentUser()?.last_name||'').slice(0,1)).toUpperCase();}
 ngOnInit(){const id=this.route.snapshot.queryParamMap.get('extension')||'';this.extensionId=/^[a-p]{32}$/.test(id)?id:'';if(this.extensionId)this.section='connections';this.load();}
 load(){this.loading=true;this.loadError='';this.auth.me().subscribe({next:u=>{this.fill(u);this.loading=false;},error:e=>{this.loading=false;if(e.status===401){this.auth.logout();this.router.navigate(['/login'],{queryParams:{returnUrl:'/account'}});}else this.loadError='Não foi possível carregar sua conta. Tente novamente.';}});}
 fill(u:User){this.firstName=u.first_name||'';this.lastName=u.last_name||'';this.username=u.username;this.email=u.email;}
 tab(value:typeof this.section){if(this.saving||this.connecting)return;this.section=value;this.message='';this.error='';this.errors={};this.clearSecrets();}
 clearSecrets(){this.showPassword=false;this.profilePassword='';this.emailPassword='';this.currentPassword='';this.newPassword='';this.confirmation='';this.revokePassword='';this.profileProof=null;this.emailProof=null;this.passwordProof=null;this.revokeProof=null;}
 begin(){this.saving=true;this.message='';this.error='';this.errors={};}
 failure(e:any){this.saving=false;this.error=e.error?.detail||'Revise os campos e tente novamente.';this.errors={};for(const [key,value] of Object.entries(e.error||{})){if(key!=='detail')this.errors[key]=Array.isArray(value)?value.join(' '):String(value);}this.profileProof=null;this.emailProof=null;this.passwordProof=null;this.revokeProof=null;setTimeout(()=>document.getElementById('account-error')?.focus(),0);}
 saveProfile(){if(this.saving||!this.profileDirty)return;this.begin();this.auth.updateProfile({first_name:this.firstName.trim(),last_name:this.lastName.trim(),username:this.username.trim(),current_password:this.profilePassword,...(this.profileProof||{})}).subscribe({next:u=>{this.fill(u);this.saving=false;this.clearSecrets();this.message='Perfil atualizado.';},error:e=>this.failure(e)});}
 saveEmail(){if(this.saving||!this.emailDirty)return;this.begin();this.auth.updateProfile({email:this.email.trim(),current_password:this.emailPassword,...(this.emailProof||{})}).subscribe({next:u=>{this.email=u.email;this.saving=false;this.clearSecrets();this.message='E-mail atualizado. Sua conta Google vinculada permanece a mesma.';},error:e=>this.failure(e)});}
 savePassword(){if(this.saving)return;this.begin();this.auth.changePassword({current_password:this.currentPassword,new_password:this.newPassword,confirmation:this.confirmation,...(this.passwordProof||{})}).subscribe({next:()=>{this.saving=false;this.clearSecrets();this.message='Senha atualizada. Os acessos anteriores foram encerrados. Reconecte a extensão, se estiver usando.';},error:e=>this.failure(e)});}
 revokeSessions(){if(this.saving)return;this.begin();this.auth.revokeOtherSessions({current_password:this.revokePassword,...(this.revokeProof||{})}).subscribe({next:()=>{this.saving=false;this.clearSecrets();this.message='Outros acessos foram encerrados. Este navegador continua conectado. Reconecte a extensão para continuar gravando.';},error:e=>this.failure(e)});}
 linked(){this.message='Conta Google vinculada.';}
 logout(){if(this.saving||this.connecting)return;this.auth.logout();this.router.navigate(['/login']);}
 connectExtension():void{
  const runtime=(window as any).chrome?.runtime;
  if(!runtime?.sendMessage){this.message='Recarregue a extensão e abra esta página pelo botão Entrar pelo navegador.';return;}
  this.connecting=true;
  const timeout=setTimeout(()=>{this.connecting=false;this.message='A extensão não respondeu. Recarregue-a e tente novamente.';},15000);
  runtime.sendMessage(this.extensionId,{action:'CONNECT_ACCOUNT',access:this.auth.token(),refresh:localStorage.getItem('refresh_token')},(response:any)=>this.zone.run(()=>{
   clearTimeout(timeout);this.connecting=false;
   if(response?.success)localStorage.setItem('autoguide_extension_id',this.extensionId);
   this.message=runtime.lastError?'Não foi possível conectar à extensão. Recarregue-a e tente novamente.':response?.success?'Conta conectada. Você já pode gravar pela barra lateral.':response?.error || 'Falha ao conectar a conta.';
  }));
 }
}
