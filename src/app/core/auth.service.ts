import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInMs: number;
  username: string;
  fullName: string;
  roles: string[];
}

const TOKEN_KEY = 'access_token';
const USER_KEY = 'auth_user';
const EXPIRES_AT_KEY = 'auth_expires_at';
const SESSION_MESSAGE_KEY = 'session_message';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<LoginResponse | null>(this.loadUser());
  readonly user$ = this.userSubject.asObservable();
  private expirationTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly api: ApiService, private readonly router: Router) {
    this.scheduleAutoLogout();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap(response => {
        const expiresAt = this.resolveExpiresAt(response.accessToken, response.expiresInMs);
        localStorage.setItem(TOKEN_KEY, response.accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(response));
        localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
        localStorage.removeItem(SESSION_MESSAGE_KEY);
        this.userSubject.next(response);
        this.scheduleAutoLogout();
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/account/change-password', { currentPassword, newPassword, confirmPassword });
  }

  logout(): void {
    this.clearSession();
    this.router.navigateByUrl('/login');
  }

  expireSession(message = 'Su sesión expiró. Ingrese nuevamente.'): void {
    this.clearSession();
    localStorage.setItem(SESSION_MESSAGE_KEY, message);
    this.router.navigate(['/login'], { queryParams: { expired: '1' } });
  }

  consumeSessionMessage(): string {
    const message = localStorage.getItem(SESSION_MESSAGE_KEY) ?? '';
    localStorage.removeItem(SESSION_MESSAGE_KEY);
    return message;
  }

  getToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (this.isTokenExpired(token)) {
      this.expireSession();
      return null;
    }
    return token;
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    if (this.isTokenExpired(token)) {
      this.clearSession();
      return false;
    }
    return true;
  }

  currentUser(): LoginResponse | null {
    if (!this.isAuthenticated()) return null;
    return this.userSubject.value;
  }

  roles(): string[] {
    return (this.currentUser()?.roles ?? []).map(r => r.replace('ROLE_', '').trim().toUpperCase()).filter(Boolean);
  }

  hasRole(role: string): boolean {
    const normalized = role.replace('ROLE_', '').trim().toUpperCase();
    return this.roles().includes(normalized);
  }

  hasAnyRole(...roles: string[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  isAdmin(): boolean { return this.hasRole('ADMIN'); }
  isReadOnly(): boolean { return this.hasRole('LECTURA') && !this.hasAnyRole('ADMIN', 'PRESUPUESTO', 'ABASTECIMIENTO', 'DIRECCION', 'AUDITOR'); }

  canView(path: string): boolean {
    if (!this.isAuthenticated()) return false;
    if (this.isAdmin()) return true;
    const p = this.normalizePath(path);
    if (['/dashboard', '/programs', '/providers', '/budget-items', '/cdp-types', '/purchase-order-states', '/budget-subtitles', '/cdps', '/purchase-orders', '/quadrature'].some(x => p.startsWith(x))) {
      return this.hasAnyRole('DIRECCION', 'PRESUPUESTO', 'ABASTECIMIENTO', 'LECTURA', 'AUDITOR');
    }
    if (p.startsWith('/ceropapel')) return this.hasAnyRole('ADMIN', 'DIRECCION', 'PRESUPUESTO', 'ABASTECIMIENTO');
    if (p.startsWith('/reports')) return this.hasAnyRole('DIRECCION', 'PRESUPUESTO', 'AUDITOR');
    if (p.startsWith('/audit-logs')) return this.hasAnyRole('AUDITOR');
    if (p.startsWith('/imports')) return this.hasAnyRole('PRESUPUESTO', 'AUDITOR');
    if (p.startsWith('/users') || p.startsWith('/roles')) return false;
    return this.isAuthenticated();
  }

  canWritePath(path: string): boolean {
    if (!this.isAuthenticated()) return false;
    if (this.isAdmin()) return true;
    const p = this.normalizePath(path);
    if (['/programs', '/budget-items', '/cdp-types', '/budget-subtitles', '/cdps'].some(x => p.startsWith(x))) {
      return this.hasRole('PRESUPUESTO');
    }
    if (['/providers', '/purchase-order-states', '/purchase-orders'].some(x => p.startsWith(x))) {
      return this.hasRole('ABASTECIMIENTO');
    }
    return false;
  }

  canDeletePath(path: string): boolean { return this.canWritePath(path); }
  canRestorePath(path: string): boolean { return this.canWritePath(path); }
  canImport(): boolean { return this.hasAnyRole('ADMIN', 'PRESUPUESTO'); }
  canClearDatabase(): boolean { return this.isAdmin(); }
  canSeeDeleted(path: string): boolean { return this.canWritePath(path) || this.hasAnyRole('AUDITOR'); }
  canExportFiltered(path: string): boolean {
    if (!this.isAuthenticated()) return false;
    if (this.isReadOnly()) return false;
    if (path.startsWith('/audit-logs')) return this.hasAnyRole('ADMIN', 'AUDITOR');
    if (path.startsWith('/reports')) return this.hasAnyRole('ADMIN', 'DIRECCION', 'PRESUPUESTO', 'AUDITOR');
    return this.hasAnyRole('ADMIN', 'DIRECCION', 'PRESUPUESTO', 'ABASTECIMIENTO', 'AUDITOR');
  }

  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : '/' + path;
  }

  private loadUser(): LoginResponse | null {
    const raw = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!raw || !token) return null;
    if (this.isTokenExpired(token)) {
      this.clearSession(false);
      return null;
    }
    try { return JSON.parse(raw) as LoginResponse; } catch { this.clearSession(false); return null; }
  }

  private scheduleAutoLogout(): void {
    if (this.expirationTimer) clearTimeout(this.expirationTimer);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const expiresAt = this.getStoredExpiresAt(token);
    const msRemaining = expiresAt - Date.now();
    if (msRemaining <= 0) {
      this.expireSession();
      return;
    }
    this.expirationTimer = setTimeout(() => this.expireSession(), msRemaining + 250);
  }

  private clearSession(updateSubject = true): void {
    if (this.expirationTimer) clearTimeout(this.expirationTimer);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    if (updateSubject) this.userSubject.next(null);
  }

  private resolveExpiresAt(token: string, expiresInMs?: number): number {
    const expFromToken = this.getJwtExpiration(token);
    if (expFromToken) return expFromToken;
    return Date.now() + (expiresInMs ?? 3600000);
  }

  private getStoredExpiresAt(token: string): number {
    const stored = Number(localStorage.getItem(EXPIRES_AT_KEY));
    if (Number.isFinite(stored) && stored > 0) return stored;
    const expFromToken = this.getJwtExpiration(token);
    if (expFromToken) {
      localStorage.setItem(EXPIRES_AT_KEY, String(expFromToken));
      return expFromToken;
    }
    return 0;
  }

  private isTokenExpired(token: string): boolean {
    const expiresAt = this.getStoredExpiresAt(token);
    if (!expiresAt) return true;
    return Date.now() >= expiresAt - 5000;
  }

  private getJwtExpiration(token: string): number | null {
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
}
