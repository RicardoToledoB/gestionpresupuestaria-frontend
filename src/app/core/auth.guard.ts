import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

function apiPathForUrl(url: string): string {
  if (url.startsWith('/programas')) return '/programs';
  if (url.startsWith('/proveedores')) return '/providers';
  if (url.startsWith('/items-presupuestarios')) return '/budget-items';
  if (url.startsWith('/tipos-cdp')) return '/cdp-types';
  if (url.startsWith('/estados-oc')) return '/purchase-order-states';
  if (url.startsWith('/subtitulos-presupuestarios')) return '/budget-subtitles';
  if (url.startsWith('/cdp')) return '/cdps';
  if (url.startsWith('/ordenes-compra')) return '/purchase-orders';
  if (url.startsWith('/importaciones')) return '/imports';
  if (url.startsWith('/cuadratura')) return '/quadrature';
  if (url.startsWith('/reportes')) return '/reports';
  if (url.startsWith('/auditoria')) return '/audit-logs';
  if (url.startsWith('/usuarios')) return '/users';
  if (url.startsWith('/roles')) return '/roles';
  return '/dashboard';
}

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.canView(apiPathForUrl(state.url))) return router.createUrlTree(['/dashboard']);
  return true;
};
