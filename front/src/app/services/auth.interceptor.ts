/** Envia a credencial de sessão apenas para a API configurada no OCTOR. */
import { HttpInterceptorFn } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();


  const api = new URL(auth.apiBase);
  let destination: URL;
  try {
    destination = new URL(req.url, document.baseURI);
  } catch {
    return next(req);
  }
  if (destination.origin !== api.origin || !destination.pathname.startsWith(api.pathname)) {
    return next(req);
  }

  if (/^auth\/(login|register|refresh|logout|google\/(config|challenge|login))\/$/.test(destination.pathname.slice(api.pathname.length))) return next(req);
  const authorized = (access: string) => next(req.clone({setHeaders: {Authorization: `Bearer ${access}`}}));
  if (token && auth.isAuthenticated()) return authorized(token);
  if (!token) return next(req);
  return auth.ensureAccess().pipe(switchMap(authorized));
};
