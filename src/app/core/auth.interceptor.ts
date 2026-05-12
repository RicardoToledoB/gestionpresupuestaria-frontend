import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('access_token');
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const router = inject(Router);
  return next(authReq).pipe(
    catchError(error => {
      if (error.status === 401) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('auth_user');
        router.navigateByUrl('/login');
      }
      return throwError(() => error);
    })
  );
};
