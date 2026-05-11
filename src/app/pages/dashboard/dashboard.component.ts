import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';
import { Cdp, DashboardSummary } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, MatCardModule, MatTableModule, MatIconModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  summary?: DashboardSummary;
  alerts: Cdp[] = [];
  displayedColumns = ['cdpNumber', 'description', 'pendingBalance', 'alertStatus', 'suggestedAction'];

  @ViewChild(MatTable) table?: MatTable<Cdp>;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService
  ) {}

  ngOnInit(): void {
    this.loadSummary();
    this.loadAlerts();
  }

  private loadSummary(): void {
    this.api.get<DashboardSummary>('/dashboard/summary').subscribe({
      next: data => {
        this.summary = { ...data };
        this.uiRefresh.refresh(this.cdr, this.table);
      },
      error: error => console.error('Error cargando resumen del dashboard', error)
    });
  }

  private loadAlerts(): void {
    this.api.get<Cdp[]>('/cdps/alerts').subscribe({
      next: data => {
        this.alerts = [...(data ?? [])];
        this.uiRefresh.refresh(this.cdr, this.table);
      },
      error: error => console.error('Error cargando alertas CDP', error)
    });
  }
}
