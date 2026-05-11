import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { UiRefreshService } from '../core/ui-refresh.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent implements AfterViewInit, OnDestroy {
  @ViewChild('sidenav') sidenav?: MatSidenav;

  isMobile = false;
  sidenavOpened = true;
  private readonly subscription = new Subscription();

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly breakpointObserver: BreakpointObserver
  ) {
    this.subscription.add(
      this.breakpointObserver.observe(['(max-width: 959px)']).subscribe(result => {
        this.isMobile = result.matches;

        this.sidenavOpened = !this.isMobile;
        if (this.sidenav) {
          this.isMobile ? this.sidenav.close() : this.sidenav.open();
        }

        this.uiRefresh.refresh(this.cdr);
        this.uiRefresh.refreshLayout();
      })
    );
  }

  ngAfterViewInit(): void {
    this.uiRefresh.refresh(this.cdr);
    this.uiRefresh.refreshLayout();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  toggleMenu(): void {
    this.sidenavOpened = !this.sidenavOpened;
    this.sidenav?.toggle();
  }

  closeMenuOnMobile(): void {
    if (this.isMobile) {
      this.sidenavOpened = false;
      this.sidenav?.close();
    }
  }
}
