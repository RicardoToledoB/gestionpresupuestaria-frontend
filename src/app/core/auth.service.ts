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

  private loadUser(): LoginResponse | null {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return null;
    try { return JSON.parse(raw) as LoginResponse; } catch { return null; }
  }
}
