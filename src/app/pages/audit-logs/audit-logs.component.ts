import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTable, MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { AuditLog, AuditStats, PageResponse } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatSnackBarModule, MatTableModule],
  templateUrl: './audit-logs.component.html'
})
export class AuditLogsComponent implements OnInit {
  data: AuditLog[] = [];
  columns = ['createdAt', 'module', 'action', 'businessKey', 'username', 'observation'];
  search = new FormControl('', { nonNullable: true });
  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  loading = false;
  stats?: AuditStats;
  @ViewChild(MatTable) table?: MatTable<AuditLog>;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef, private readonly uiRefresh: UiRefreshService, private readonly snack: MatSnackBar) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadData();
    this.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => { this.pageIndex = 0; this.loadData(); });
  }


  loadStats(): void {
    this.api.get<AuditStats>('/audit-logs/stats').subscribe({
      next: stats => { this.stats = stats; this.uiRefresh.refresh(this.cdr, this.table); },
      error: err => { console.error('No fue posible cargar estadísticas de auditoría', err); }
    });
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<AuditLog>>('/audit-logs', { page: this.pageIndex, size: this.pageSize, search: this.search.value.trim(), sort: 'createdAt,desc' }).subscribe({
      next: page => { this.data = [...(page.content ?? [])]; this.totalElements = page.totalElements ?? 0; this.loading = false; this.loadStats(); this.uiRefresh.refresh(this.cdr, this.table); },
      error: err => { console.error(err); this.loading = false; this.snack.open('No fue posible cargar auditoría', 'Cerrar', { duration: 3500 }); this.uiRefresh.refresh(this.cdr, this.table); }
    });
  }

  onPage(event: PageEvent): void { this.pageIndex = event.pageIndex; this.pageSize = event.pageSize; this.loadData(); }
  clearSearch(): void { this.search.setValue(''); }

  exportFiltered(): void {
    this.api.download('/audit-logs/export', { search: this.search.value.trim() }).subscribe({
      next: blob => this.saveBlob(blob, 'auditoria_filtrada.csv'),
      error: err => { console.error(err); this.snack.open('No fue posible exportar auditoría', 'Cerrar', { duration: 3500 }); }
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
