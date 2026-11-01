/** Módulo front/src/app/components/login/login.component.ts: reúne os contratos e o comportamento local da tela/serviço; chamadas externas seguem as interfaces importadas abaixo. */
/**
 * Dependência ({ Component, OnDestroy }): decoradores, injeção, signals e ciclo de vida dos componentes Angular.
 */
import { Component, OnDestroy } from '@angular/core';
/**
 * Dependência ({ CommonModule }): diretivas e apresentação compartilhada dos templates Angular.
 */
import { CommonModule } from '@angular/common';
/**
 * Dependência ({ FormsModule }): vínculo e validação dos formulários da interface.
 */
import { FormsModule } from '@angular/forms';
/**
 * Dependência ({ Router, ActivatedRoute, RouterModule }): rotas, parâmetros e navegação entre as telas.
 */
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
/**
 * Dependência ({ Subscription }): composição dos fluxos assíncronos e conversão/observação das respostas HTTP.
 */
import { Subscription } from 'rxjs';
/**
 * Dependência ({ AuthService }): contratos e comportamento compartilhados de ../../services/auth.service.
 */
import { AuthService } from '../../services/auth.service';
/**
 * Dependência ({ GoogleSignInComponent }): contratos e comportamento compartilhados de ./google-sign-in.component.
 */
import { GoogleSignInComponent } from './google-sign-in.component';
@Component({selector:'app-login',standalone:true,imports:[CommonModule,FormsModule,RouterModule,GoogleSignInComponent],templateUrl:'./login.component.html',styleUrls:['./login.component.css']})
export class LoginComponent implements OnDestroy {
 username='';password='';confirmation='';firstName='';email='';isRegistering=false;/* boolean: diferencia carga inicial, estado vazio e conteúdo já recebido. */ loading=false;errorMessage='';showPassword=false;
 private routeSubscription:Subscription;
 /**
  * Recebe as dependências e prepara o estado inicial da instância conforme o ciclo de injeção Angular.
  * @param auth — AuthService; contrato tipado na assinatura.
  * @param router — Router; roteador injetado para navegação.
  * @param route — ActivatedRoute; rota ativa com os parâmetros da tela.
  * @returns void/undefined; efeitos nas operações do corpo.
  */
 constructor(private auth:AuthService,private router:Router,public route:ActivatedRoute){
  this.routeSubscription=route.data.subscribe(data=>{this.isRegistering=data['register']===true;this.errorMessage='';this.password='';this.confirmation='';});
  if(auth.isAuthenticated())this.finish();
 }
 /**
  * Libera os recursos mantidos pelo componente ao sair da tela, conforme os timers, listeners e objetos registrados neste fluxo.
  * @returns void.
  */
 ngOnDestroy():void{this.routeSubscription.unsubscribe();}
 /**
  * Valida o formulário local e encaminha a operação de login/cadastro ao serviço.
  * @returns void.
  */
 onSubmit():void{
  if(this.loading)return;
  this.errorMessage='';
  if(this.isRegistering && this.password!==this.confirmation){this.errorMessage='As senhas não coincidem.';return;}
  this.loading=true;
  const operation=this.isRegistering?this.auth.register({username:this.username.trim(),first_name:this.firstName.trim(),email:this.email.trim(),password:this.password}):this.auth.login({username:this.username.trim(),password:this.password});
  operation.subscribe({next:/* Aplica a resposta assíncrona ao estado desta operação no contexto do componente. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{this.loading=false;this.finish();},error:/* Trata a falha assíncrona e mantém a mensagem/estado funcional desta operação. | @param error — falha recebida da operação. | @returns void/undefined; efeitos nas operações do corpo. */ error=>{
   this.loading=false;
   const body=error.error;
   this.errorMessage=typeof body==='object' ? Object.values(body).flat().join(' ') : 'Não foi possível conectar. Tente novamente.';
   if(error.status===401)this.errorMessage='Usuário ou senha incorretos.';
  }});
 }
 /**
  * Finaliza o estado ocupado da operação e apresenta o resultado conforme o chamador.
  * @returns void.
  */
 finish():void{
  const extension=this.route.snapshot.queryParamMap.get('extension');
  if(extension && /^[a-p]{32}$/.test(extension)){this.router.navigate(['/account'],{queryParams:{extension}});return;}
  const next=this.route.snapshot.queryParamMap.get('returnUrl');
  this.router.navigateByUrl(next?.startsWith('/')&&!next.startsWith('//')?next:'/guides');
 }
}
