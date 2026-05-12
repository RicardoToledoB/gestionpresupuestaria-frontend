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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<LoginResponse | null>(this.loadUser());
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly api: ApiService, private readonly router: Router) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap(response => {
        localStorage.setItem('access_token', response.accessToken);
        localStorage.setItem('auth_user', JSON.stringify(response));
        this.userSubject.next(response);
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/account/change-password', { currentPassword, newPassword, confirmPassword });
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('auth_user');
    this.userSubject.next(null);
    this.router.navigateByUrl('/login');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }

  currentUser(): LoginResponse | null { return this.userSubject.value; }

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
    if (this.isAdmin()) return true;
    const p = this.normalizePath(path);
    if (['/dashboard', '/programs', '/providers', '/budget-items', '/cdp-types', '/purchase-order-states', '/budget-subtitles', '/cdps', '/purchase-orders', '/quadrature'].some(x => p.startsWith(x))) {
      return this.hasAnyRole('DIRECCION', 'PRESUPUESTO', 'ABASTECIMIENTO', 'LECTURA', 'AUDITOR');
    }
    if (p.startsWith('/reports')) return this.hasAnyRole('DIRECCION', 'PRESUPUESTO', 'AUDITOR');
    if (p.startsWith('/audit-logs')) return this.hasAnyRole('AUDITOR');
    if (p.startsWith('/imports')) return this.hasAnyRole('PRESUPUESTO', 'AUDITOR');
    if (p.startsWith('/users') || p.startsWith('/roles')) return false;
    return this.isAuthenticated();
  }

  canWritePath(path: string): boolean {
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

  canDeletePath(path: string): boolean {
    return this.canWritePath(path);
  }

  canRestorePath(path: string): boolean {
    return this.canWritePath(path);
  }

  canImport(): boolean { return this.hasAnyRole('ADMIN', 'PRESUPUESTO'); }
  canClearDatabase(): boolean { return this.isAdmin(); }
  canSeeDeleted(path: string): boolean { return this.canWritePath(path) || this.hasAnyRole('AUDITOR'); }
  canExportFiltered(path: string): boolean {
    if (this.isReadOnly()) return false;
    if (path.startsWith('/audit-logs')) return this.hasAnyRole('ADMIN', 'AUDITOR');
    if (path.startsWith('/reports')) return this.hasAnyRole('ADMIN', 'DIRECCION', 'PRESUPUESTO', 'AUDITOR');
    return this.hasAnyRole('ADMIN', 'DIRECCION', 'PRESUPUESTO', 'ABASTECIMIENTO', 'AUDITOR');
  }

  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : '/' + path;
  }

  private loadUser(): LoginResponse | null {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return null;
    try { return JSON.parse(raw) as LoginResponse; } catch { return null; }
  }
}
