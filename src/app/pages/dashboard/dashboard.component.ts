import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';
import { Cdp, DashboardCharts, DashboardSummary, ProgramSummary } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, MatCardModule, MatTableModule, MatIconModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  summary?: DashboardSummary;
  charts?: DashboardCharts;
  alerts: Cdp[] = [];
  programSummary: ProgramSummary[] = [];
  resumenColumns = ['programName', 'subtitle', 'currentBudget', 'cdpIssued', 'cdpPendingBalance', 'availableBalance', 'cdpFollowUp', 'cdpAlert', 'possibleRelease'];
  displayedColumns = ['cdpNumber', 'description', 'pendingBalance', 'alertStatus', 'suggestedAction'];

  @ViewChild(MatTable) table?: MatTable<Cdp>;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef, private readonly uiRefresh: UiRefreshService) {}

  ngOnInit(): void { this.loadSummary(); this.loadProgramSummary(); this.loadCharts(); this.loadAlerts(); }

  percent(value?: number, total?: number): number { return !total ? 0 : Math.min(100, Math.round(((value ?? 0) * 100) / total)); }
  maxProgramBudget(): number { return Math.max(1, ...(this.charts?.programs ?? []).map(p => p.budget || 0)); }
  maxTopPending(): number { return Math.max(1, ...(this.charts?.topPendingCdps ?? []).map(p => p.pendingBalance || 0)); }

  private loadSummary(): void {
    this.api.get<DashboardSummary>('/dashboard/summary').subscribe({
      next: data => { this.summary = { ...data }; this.uiRefresh.refresh(this.cdr, this.table); },
      error: error => console.error('Error cargando resumen del dashboard', error)
    });
  }

  private loadProgramSummary(): void {
    this.api.get<ProgramSummary[]>('/dashboard/programs').subscribe({
      next: data => { this.programSummary = [...(data ?? [])]; this.uiRefresh.refresh(this.cdr, this.table); },
      error: error => console.error('Error cargando resumen presupuestario por programa', error)
    });
  }

  private loadCharts(): void {
    this.api.get<DashboardCharts>('/dashboard/charts').subscribe({
      next: data => { this.charts = data; this.uiRefresh.refresh(this.cdr, this.table); },
      error: error => console.error('Error cargando gráficos', error)
    });
  }

  private loadAlerts(): void {
    this.api.get<Cdp[]>('/cdps/alerts').subscribe({
      next: data => { this.alerts = [...(data ?? [])]; this.uiRefresh.refresh(this.cdr, this.table); },
      error: error => console.error('Error cargando alertas CDP', error)
    });
  }
}
