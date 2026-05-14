import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'auth_user';
const EXPIRES_AT_KEY = 'auth_expires_at';
const SESSION_MESSAGE_KEY = 'session_message';

function clearSession(message?: string): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  if (message) localStorage.setItem(SESSION_MESSAGE_KEY, message);
}

function jwtExpirationMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(normalized).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const decoded = JSON.parse(json);
    return decoded?.exp ? Number(decoded.exp) * 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const stored = Number(localStorage.getItem(EXPIRES_AT_KEY));
  const expiresAt = Number.isFinite(stored) && stored > 0 ? stored : (jwtExpirationMs(token) ?? 0);
  return !expiresAt || Date.now() >= expiresAt - 5000;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem(TOKEN_KEY);
  const isLoginRequest = req.url.includes('/auth/login');

  if (token && !isLoginRequest && isExpired(token)) {
    clearSession('Su sesión expiró. Ingrese nuevamente.');
    router.navigate(['/login'], { queryParams: { expired: '1' } });
    return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Session expired', url: req.url }));
  }

  const authReq = token && !isLoginRequest ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError(error => {
      if (error.status === 401) {
        clearSession('Su sesión expiró o no es válida. Ingrese nuevamente.');
        router.navigate(['/login'], { queryParams: { expired: '1' } });
      }
      return throwError(() => error);
    })
  );
};
