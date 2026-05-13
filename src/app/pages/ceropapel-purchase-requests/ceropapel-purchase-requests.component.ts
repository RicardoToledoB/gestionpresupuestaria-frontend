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
  fechaEstimada?: string;
  montoEstimado?: string;
  proveedorSugerido?: string;
  urgencia?: string;
  usuarioId?: string;
  ubicacionId?: string;
  programaId?: string;
  observacion1?: string;
  observacion2?: string;
  registro?: string;
  movimientosCompra?: any[];
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

type DetailTab = 'resumen' | 'movimientos' | 'detalle' | 'json';

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
  requestId = '';
  startDate = this.defaultStartDate();
  endDate = this.today();
  page = 0;
  size = 20;
  totalElements = 0;
  totalPages = 0;
  rows: PurchaseRequest[] = [];
  selected?: PurchaseRequest;
  activeTab: DetailTab = 'resumen';

  displayedColumns = ['folio', 'titulo', 'estado', 'urgencia', 'unidad', 'fechaCreacion', 'fechaEstimada', 'acciones'];

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
    this.api.get<PurchaseRequestPage>('/ceropapel/purchase-requests', { search: this.search, id: this.requestId, startDate: this.startDate, endDate: this.endDate, page: this.page, size: this.size }).subscribe({
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

  clear(): void { this.search = ''; this.requestId = ''; this.startDate = this.defaultStartDate(); this.endDate = this.today(); this.page = 0; this.load(0); }
  previous(): void { if (this.page > 0) this.load(this.page - 1); }
  next(): void { if (this.totalPages === 0 || this.page + 1 < this.totalPages) this.load(this.page + 1); }
  changePageSize(): void { this.page = 0; this.load(0); }

  open(row: PurchaseRequest): void {
    // CeroPapel ya entrega el objeto completo en el listado. Usamos ese JSON para evitar llamadas extra y no perder detalle.
    this.selected = row;
    this.activeTab = 'resumen';
    this.uiRefresh.refresh(this.cdr);
  }

  closeDetail(): void { this.selected = undefined; this.activeTab = 'resumen'; }
  setTab(tab: DetailTab): void { this.activeTab = tab; }

  display(value: any): string { return value === null || value === undefined || value === '' ? '-' : String(value); }
  rawJson(value: any): string { try { return JSON.stringify(value ?? {}, null, 2); } catch { return String(value ?? ''); } }

  amount(value: any): string {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(n)) return String(value);
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  }

  date(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: String(value).includes(':') ? 'short' : undefined }).format(d);
  }

  shortText(value: any, max = 150): string {
    const text = this.display(value);
    if (text === '-' || text.length <= max) return text;
    return `${text.slice(0, max).trim()}...`;
  }

  urgencyLabel(value: any): string {
    const text = this.display(value);
    if (text === '-') return 'Normal';
    if (text === '0') return 'Normal';
    if (text === '1') return 'Urgente';
    return text;
  }

  rawValue(row: PurchaseRequest | undefined, ...keys: string[]): any {
    if (!row?.raw) return undefined;
    for (const key of keys) {
      const direct = row.raw[key];
      if (direct !== undefined && direct !== null && direct !== '') return direct;
      const foundKey = Object.keys(row.raw).find(k => k.toLowerCase() === key.toLowerCase());
      if (foundKey) {
        const v = row.raw[foundKey];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
    return undefined;
  }

  movements(row: PurchaseRequest | undefined): any[] {
    const direct = row?.movimientosCompra;
    if (Array.isArray(direct) && direct.length) return direct;
    const raw = this.rawValue(row, 'movements_purchases', 'movementsPurchases', 'movimientos', 'historial');
    return Array.isArray(raw) ? raw : [];
  }

  movementTitle(item: any): string {
    return this.display(item?.state ?? item?.status ?? item?.estado ?? item?.action ?? item?.accion ?? item?.id);
  }

  movementDate(item: any): string {
    return this.date(item?.created_at ?? item?.updated_at ?? item?.fecha ?? item?.date);
  }

  movementUser(item: any): string {
    return this.display(item?.user_id ?? item?.usuario_id ?? item?.user?.name ?? item?.usuario ?? item?.created_by);
  }

  movementObservation(item: any): string {
    return this.display(item?.observation ?? item?.observacion ?? item?.comment ?? item?.comentario ?? item?.description ?? item?.descripcion);
  }

  private today(): string {
    return this.toIsoDate(new Date());
  }

  private defaultStartDate(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return this.toIsoDate(d);
  }

  private toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
