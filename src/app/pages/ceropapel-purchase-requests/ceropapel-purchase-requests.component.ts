import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { UiRefreshService } from '../../core/ui-refresh.service';

interface CeroPapelStatus {
  configured: boolean;
  authenticated: boolean;
  baseUrl: string;
  purchaseRequestsPath: string;
  message: string;
}

interface PurchaseRequest {
  id?: string;
  folio?: string;
  codigo?: string;
  titulo?: string;
  descripcion?: string;
  estado?: string;
  solicitante?: string;
  unidad?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  montoEstimado?: string;
  proveedorSugerido?: string;
  origen?: string;
  raw?: any;
}

interface PurchaseRequestPage {
  content: PurchaseRequest[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  authenticated: boolean;
  message: string;
  raw: any;
}

@Component({
  selector: 'app-ceropapel-purchase-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, MatTableModule],
  templateUrl: './ceropapel-purchase-requests.component.html',
  styleUrl: './ceropapel-purchase-requests.component.scss'
})
export class CeroPapelPurchaseRequestsComponent implements OnInit {
  status?: CeroPapelStatus;
  loading = false;
  search = '';
  page = 0;
  size = 20;
  totalElements = 0;
  totalPages = 0;
  rows: PurchaseRequest[] = [];
  selected?: PurchaseRequest;
  rawVisible = false;

  displayedColumns = ['folio', 'titulo', 'estado', 'solicitante', 'unidad', 'fechaCreacion', 'montoEstimado', 'acciones'];

  constructor(
    private readonly api: ApiService,
    private readonly snack: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService
  ) {}

  ngOnInit(): void {
    this.checkStatus();
    this.load();
  }

  checkStatus(): void {
    this.api.get<CeroPapelStatus>('/ceropapel/status').subscribe({
      next: status => { this.status = status; this.uiRefresh.refresh(this.cdr); },
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible validar conexión con CeroPapel.', 'Cerrar', { duration: 5000 })
    });
  }

  load(page = this.page): void {
    this.page = page;
    this.loading = true;
    this.api.get<PurchaseRequestPage>('/ceropapel/purchase-requests', { search: this.search, page: this.page, size: this.size }).subscribe({
      next: data => {
        this.rows = data.content ?? [];
        this.totalElements = data.totalElements ?? this.rows.length;
        this.totalPages = data.totalPages ?? 0;
        if (data.message) this.snack.open(data.message, 'Cerrar', { duration: 3500 });
        this.loading = false;
        this.uiRefresh.refresh(this.cdr);
      },
      error: err => {
        this.loading = false;
        this.snack.open(err?.error?.message ?? 'No fue posible consultar solicitudes de compra en CeroPapel.', 'Cerrar', { duration: 6000 });
      }
    });
  }

  clear(): void { this.search = ''; this.load(0); }
  previous(): void { if (this.page > 0) this.load(this.page - 1); }
  next(): void { if (this.totalPages === 0 || this.page + 1 < this.totalPages) this.load(this.page + 1); }

  open(row: PurchaseRequest): void {
    const id = row.id || row.folio || row.codigo;
    if (!id) { this.selected = row; return; }
    this.api.get<PurchaseRequest>(`/ceropapel/purchase-requests/${encodeURIComponent(id)}`).subscribe({
      next: detail => { this.selected = detail; this.rawVisible = false; this.uiRefresh.refresh(this.cdr); },
      error: () => { this.selected = row; this.rawVisible = false; this.uiRefresh.refresh(this.cdr); }
    });
  }

  closeDetail(): void { this.selected = undefined; this.rawVisible = false; }
  display(value: any): string { return value === null || value === undefined || value === '' ? '-' : String(value); }
  rawJson(value: any): string { try { return JSON.stringify(value ?? {}, null, 2); } catch { return String(value ?? ''); } }
}
