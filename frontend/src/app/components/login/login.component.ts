import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GoogleSignInComponent } from './google-sign-in.component';
@Component({selector:'app-login',standalone:true,imports:[CommonModule,FormsModule,RouterModule,GoogleSignInComponent],templateUrl:'./login.component.html',styleUrls:['./login.component.css']})
export class LoginComponent implements OnDestroy {
 username='';password='';confirmation='';firstName='';email='';isRegistering=false;loading=false;errorMessage='';showPassword=false;
 private routeSubscription:Subscription;
 constructor(private auth:AuthService,private router:Router,public route:ActivatedRoute){
  this.routeSubscription=route.data.subscribe(data=>{this.isRegistering=data['register']===true;this.errorMessage='';this.password='';this.confirmation='';});
  if(auth.isAuthenticated())this.finish();
 }
 ngOnDestroy():void{this.routeSubscription.unsubscribe();}
 onSubmit():void{
  if(this.loading)return;
  this.errorMessage='';
  if(this.isRegistering && this.password!==this.confirmation){this.errorMessage='As senhas não coincidem.';return;}
  this.loading=true;
  const operation=this.isRegistering?this.auth.register({username:this.username.trim(),first_name:this.firstName.trim(),email:this.email.trim(),password:this.password}):this.auth.login({username:this.username.trim(),password:this.password});
  operation.subscribe({next:()=>{this.loading=false;this.finish();},error:error=>{
   this.loading=false;
   const body=error.error;
   this.errorMessage=typeof body==='object' ? Object.values(body).flat().join(' ') : 'Não foi possível conectar. Tente novamente.';
   if(error.status===401)this.errorMessage='Usuário ou senha incorretos.';
  }});
 }
 finish():void{
  const extension=this.route.snapshot.queryParamMap.get('extension');
  if(extension && /^[a-p]{32}$/.test(extension)){this.router.navigate(['/account'],{queryParams:{extension}});return;}
  const next=this.route.snapshot.queryParamMap.get('returnUrl');
  this.router.navigateByUrl(next?.startsWith('/')&&!next.startsWith('//')?next:'/guides');
 }
}
