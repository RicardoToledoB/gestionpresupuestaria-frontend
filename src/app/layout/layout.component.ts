import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { UiRefreshService } from '../core/ui-refresh.service';
import { AuthService, LoginResponse } from '../core/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule, MatSnackBarModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent implements AfterViewInit, OnDestroy {
  @ViewChild('sidenav') sidenav?: MatSidenav;

  isMobile = false;
  sidenavOpened = true;
  user: LoginResponse | null = null;
  private readonly subscription = new Subscription();

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly breakpointObserver: BreakpointObserver,
    private readonly auth: AuthService,
    private readonly snack: MatSnackBar
  ) {
    this.subscription.add(this.auth.user$.subscribe(u => { this.user = u; this.uiRefresh.refresh(this.cdr); }));
    this.subscription.add(
      this.breakpointObserver.observe(['(max-width: 959px)']).subscribe(result => {
        this.isMobile = result.matches;
        this.sidenavOpened = !this.isMobile;
        if (this.sidenav) this.isMobile ? this.sidenav.close() : this.sidenav.open();
        this.uiRefresh.refresh(this.cdr);
        this.uiRefresh.refreshLayout();
      })
    );
  }

  ngAfterViewInit(): void { this.uiRefresh.refresh(this.cdr); this.uiRefresh.refreshLayout(); }
  ngOnDestroy(): void { this.subscription.unsubscribe(); }
  toggleMenu(): void { this.sidenavOpened = !this.sidenavOpened; this.sidenav?.toggle(); }
  closeMenuOnMobile(): void { if (this.isMobile) { this.sidenavOpened = false; this.sidenav?.close(); } }
  changePassword(): void {
    const currentPassword = window.prompt('Ingrese su contraseña actual:');
    if (!currentPassword) return;
    const newPassword = window.prompt('Ingrese su nueva contraseña. Debe tener al menos 8 caracteres:');
    if (!newPassword) return;
    const confirmPassword = window.prompt('Confirme su nueva contraseña:');
    if (newPassword !== confirmPassword) { this.snack.open('La confirmación de contraseña no coincide.', 'Cerrar', { duration: 3500 }); return; }
    this.auth.changePassword(currentPassword, newPassword, confirmPassword ?? '').subscribe({
      next: response => this.snack.open(response?.message ?? 'Contraseña actualizada correctamente.', 'Cerrar', { duration: 3000 }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible cambiar la contraseña.', 'Cerrar', { duration: 5000 })
    });
  }
  logout(): void { this.auth.logout(); }
  canView(path: string): boolean { return this.auth.canView(path); }
  hasAnyRole(...roles: string[]): boolean { return this.auth.hasAnyRole(...roles); }
}

