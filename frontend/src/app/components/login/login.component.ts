import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div style="width: 100%; max-width: 400px; background: #131b2e; border: 1px solid #233152; border-radius: 12px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; justify-content: center; gap: 8px;">
            ⚡ AutoGuide
          </h1>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 6px;">
            {{ isRegistering ? 'Crie sua conta para começar' : 'Faça login para gerenciar seus procedimentos' }}
          </p>
        </div>

        <form (ngSubmit)="onSubmit()">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px;">Usuário</label>
            <input 
              type="text" 
              name="username" 
              [(ngModel)]="username" 
              required
              placeholder="admin"
              style="width: 100%; padding: 10px 14px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 14px; outline: none;"
            />
          </div>

          <div *ngIf="isRegistering" style="margin-bottom: 16px;">
            <label style="display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px;">Email (opcional)</label>
            <input 
              type="email" 
              name="email" 
              [(ngModel)]="email" 
              placeholder="seu@email.com"
              style="width: 100%; padding: 10px 14px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 14px; outline: none;"
            />
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px;">Senha</label>
            <input 
              type="password" 
              name="password" 
              [(ngModel)]="password" 
              required
              placeholder="••••••••"
              style="width: 100%; padding: 10px 14px; background: #1a233a; border: 1px solid #233152; border-radius: 8px; color: #fff; font-size: 14px; outline: none;"
            />
          </div>

          <div *ngIf="errorMessage" style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #f87171; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 16px;">
            {{ errorMessage }}
          </div>

          <button 
            type="submit" 
            [disabled]="loading"
            style="width: 100%; padding: 12px; background: #0284c7; color: #fff; font-weight: 600; font-size: 14px; border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s;"
          >
            {{ loading ? 'Processando...' : (isRegistering ? 'Cadastrar' : 'Entrar') }}
          </button>
        </form>

        <div style="margin-top: 20px; text-align: center; font-size: 13px; color: #94a3b8;">
          <span>{{ isRegistering ? 'Já possui conta?' : 'Não possui uma conta?' }}</span>
          <a (click)="toggleMode()" style="color: #38bdf8; margin-left: 6px; cursor: pointer; font-weight: 500;">
            {{ isRegistering ? 'Entrar' : 'Cadastre-se' }}
          </a>
        </div>

      </div>
    </div>
  `
})
export class LoginComponent {
  username = '';
  password = '';
  email = '';
  isRegistering = false;
  loading = false;
  errorMessage = '';

  constructor(private authService: AuthService, private router: Router) {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/guides']);
    }
  }

  toggleMode() {
    this.isRegistering = !this.isRegistering;
    this.errorMessage = '';
  }

  onSubmit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.errorMessage = '';

    if (this.isRegistering) {
      this.authService.register({ username: this.username, email: this.email, password: this.password }).subscribe({
        next: () => {
          this.isRegistering = false;
          this.errorMessage = 'Conta criada com sucesso! Faça login.';
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = 'Erro ao cadastrar: ' + (err.error?.username || 'Verifique os dados.');
          this.loading = false;
        }
      });
    } else {
      this.authService.login({ username: this.username, password: this.password }).subscribe({
        next: () => {
          this.loading = false;
          this.router.navigate(['/guides']);
        },
        error: () => {
          this.errorMessage = 'Usuário ou senha incorretos.';
          this.loading = false;
        }
      });
    }
  }
}
