import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../core/api.service';
import { AssociatedPurchaseOrder as AssociatedPurchaseOrderModel, Cdp, MercadoPublicoPurchaseOrder, PageResponse, PurchaseOrder } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { CdpDetailDialogComponent, MercadoPublicoOrderDialogComponent } from '../purchase-orders/purchase-orders.component';

interface CeroPapelStatus {
  configured: boolean;
  authenticated: boolean;
  baseUrl: string;
  purchaseRequestsPath: string;
  message: string;
}

interface AssociatedPurchaseOrder {
  id: number;
  orderNumber: string;
  orderDate?: string;
  sigfeFolio?: string;
  purchaseRequestId?: string;
  programName?: string;
  providerName?: string;
  cdpId?: number;
  cdpNumber?: string;
  realAmount?: number;
  status?: string;
  active?: boolean;
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
  ordenesCompraAsociadas?: AssociatedPurchaseOrder[];
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

type DetailTab = 'resumen' | 'items' | 'trazabilidad' | 'compradores' | 'json';

@Component({
  selector: 'app-ceropapel-purchase-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, MatTableModule, MatDialogModule],
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
  linkingRequest?: PurchaseRequest;
  ocSearch = '';
  ocCandidates: PurchaseOrder[] = [];
  ocSearchLoading = false;
  unlinkingOcId: number | null = null;

  displayedColumns = ['folio', 'titulo', 'estado', 'urgencia', 'unidad', 'solicitante', 'fechaCreacion', 'monto', 'ocAsociada', 'acciones'];

  constructor(
    private readonly api: ApiService,
    private readonly snack: MatSnackBar,
    private readonly dialog: MatDialog,
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
    this.selected = row;
    this.activeTab = 'resumen';
    this.uiRefresh.refresh(this.cdr);
  }

  closeDetail(): void { this.selected = undefined; this.activeTab = 'resumen'; }
  setTab(tab: DetailTab): void { this.activeTab = tab; }


  associatedOrders(row: PurchaseRequest | undefined): AssociatedPurchaseOrder[] {
    const fromDto = row?.ordenesCompraAsociadas;
    if (Array.isArray(fromDto)) return fromDto;
    const raw = row?.raw;
    const fromRaw = raw?.ordenesCompraAsociadas ?? raw?.ordenes_compra_asociadas ?? raw?.associatedPurchaseOrders ?? raw?.purchase_orders;
    return Array.isArray(fromRaw) ? fromRaw : [];
  }

  hasAssociatedOc(row: PurchaseRequest | undefined): boolean {
    return this.associatedOrders(row).length > 0;
  }

  openLinkDialog(row: PurchaseRequest): void {
    this.linkingRequest = row;
    this.ocSearch = '';
    this.ocCandidates = [];
    this.uiRefresh.refresh(this.cdr);
  }

  closeLinkDialog(): void {
    this.linkingRequest = undefined;
    this.ocSearch = '';
    this.ocCandidates = [];
    this.ocSearchLoading = false;
  }

  searchOcCandidates(): void {
    const term = this.ocSearch.trim();
    if (!term) {
      this.snack.open('Ingrese un número de OC, proveedor, programa, CDP o SIGFE para buscar.', 'Cerrar', { duration: 3500 });
      return;
    }
    this.ocSearchLoading = true;
    this.api.get<PageResponse<PurchaseOrder>>('/purchase-orders', { search: term, includeDeleted: false, page: 0, size: 10 }).subscribe({
      next: page => {
        this.ocCandidates = page.content ?? [];
        this.ocSearchLoading = false;
        if (this.ocCandidates.length === 0) this.snack.open('No se encontraron órdenes de compra activas para el criterio ingresado.', 'Cerrar', { duration: 3500 });
        this.uiRefresh.refresh(this.cdr);
      },
      error: err => {
        this.ocSearchLoading = false;
        this.snack.open(err?.error?.message ?? 'No fue posible buscar órdenes de compra.', 'Cerrar', { duration: 5000 });
      }
    });
  }

  linkOcToRequest(oc: PurchaseOrder): void {
    if (!this.linkingRequest) return;
    const requestId = String(this.id(this.linkingRequest));
    if (!requestId || requestId === '-') {
      this.snack.open('La solicitud no tiene ID válido para vincular.', 'Cerrar', { duration: 4000 });
      return;
    }
    this.api.post<PurchaseOrder>(`/purchase-orders/${oc.id}/purchase-request-association`, { purchaseRequestId: requestId }).subscribe({
      next: updated => {
        this.snack.open(`OC ${updated.orderNumber} vinculada a la solicitud ${requestId}. Esta solicitud puede tener múltiples OC asociadas.`, 'Cerrar', { duration: 5000 });
        this.closeLinkDialog();
        this.reloadRequestAssociation(requestId);
      },
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible asociar la OC a la solicitud.', 'Cerrar', { duration: 6000 })
    });
  }

  unlinkOcFromRequest(oc: AssociatedPurchaseOrder): void {
    if (!oc?.id) return;
    this.unlinkingOcId = oc.id;
    const requestId = oc.purchaseRequestId ?? (this.selected ? String(this.id(this.selected)) : '');
    this.api.delete<PurchaseOrder>(`/purchase-orders/${oc.id}/purchase-request-association`).subscribe({
      next: updated => {
        this.unlinkingOcId = null;
        this.snack.open(`OC ${updated.orderNumber} desasociada correctamente.`, 'Cerrar', { duration: 4000 });
        if (requestId) this.reloadRequestAssociation(requestId);
      },
      error: err => {
        this.unlinkingOcId = null;
        this.snack.open(err?.error?.message ?? 'No fue posible desasociar la OC.', 'Cerrar', { duration: 6000 });
      }
    });
  }

  private reloadRequestAssociation(requestId: string): void {
    this.api.get<AssociatedPurchaseOrder[]>(`/purchase-orders/by-purchase-request/${encodeURIComponent(requestId)}`).subscribe({
      next: orders => {
        const apply = (row?: PurchaseRequest) => { if (row && String(this.id(row)) === String(requestId)) row.ordenesCompraAsociadas = orders; };
        this.rows.forEach(apply);
        apply(this.selected);
        this.uiRefresh.refresh(this.cdr);
      },
      error: () => this.load(this.page)
    });
  }

  openAssociatedPurchaseOrder(oc: AssociatedPurchaseOrder): void {
    this.snack.open(`OC vinculada a esta solicitud: ${oc.orderNumber}. Puede abrirla desde el módulo Órdenes de compra o consultar Mercado Público.`, 'Cerrar', { duration: 5000 });
  }

  openAssociatedCdp(oc: AssociatedPurchaseOrder): void {
    if (!oc.cdpId) {
      this.snack.open('Esta OC no tiene CDP asociado.', 'Cerrar', { duration: 3500 });
      return;
    }
    this.api.get<Cdp>(`/cdps/${oc.cdpId}`).subscribe({
      next: cdp => {
        this.api.get<AssociatedPurchaseOrderModel[]>(`/cdps/${oc.cdpId}/purchase-orders`).subscribe({
          next: orders => this.dialog.open(CdpDetailDialogComponent, { data: { cdp, orders: orders ?? [] }, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'cdp-detail-dialog' }),
          error: () => this.dialog.open(CdpDetailDialogComponent, { data: { cdp, orders: [] }, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'cdp-detail-dialog' })
        });
      },
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible abrir el CDP asociado.', 'Cerrar', { duration: 5000 })
    });
  }

  openAssociatedMercadoPublico(oc: AssociatedPurchaseOrder): void {
    const code = String(oc.orderNumber ?? '').replace(/\s+/g, '').trim();
    if (!code) return;
    this.api.get<MercadoPublicoPurchaseOrder>(`/mercado-publico/purchase-orders/${encodeURIComponent(code)}`).subscribe({
      next: data => this.dialog.open(MercadoPublicoOrderDialogComponent, { data, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'mp-oc-dialog' }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar Mercado Público.', 'Cerrar', { duration: 6000 })
    });
  }

  display(value: any): string {
    const v = this.unwrap(value);
    if (v === null || v === undefined || v === '' || String(v).toLowerCase() === 'null') return '-';
    return String(v);
  }

  rawJson(value: any): string {
    try { return JSON.stringify(this.sanitize(value ?? {}), null, 2); } catch { return String(value ?? ''); }
  }

  amount(value: any): string {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(n)) return String(value);
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  }

  date(value: any): string {
    const v = this.unwrap(value);
    if (!v) return '-';
    const d = new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 19);
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: String(v).includes(':') ? 'short' : undefined }).format(d);
  }

  shortText(value: any, max = 150): string {
    const text = this.display(value);
    if (text === '-' || text.length <= max) return text;
    return `${text.slice(0, max).trim()}...`;
  }

  matterText(row: PurchaseRequest | undefined): string {
    return this.display(this.title(row));
  }

  secondaryMatter(row: PurchaseRequest | undefined): string {
    const main = this.display(this.title(row));
    const secondary = this.display(this.justification(row));
    if (main === '-' || secondary === '-' || this.sameText(main, secondary)) return '';
    return secondary;
  }

  private sameText(a: string, b: string): boolean {
    const norm = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return norm(a) === norm(b);
  }

  urgencyLabel(value: any): string {
    const text = this.display(value).toLowerCase();
    if (text === '-' || text === '0' || text === 'no' || text === 'normal') return 'Normal';
    if (text === '1' || text === 'si' || text === 'sí' || text === 'urgente' || text === 'yes') return 'Urgente';
    return this.display(value);
  }

  urgencyClass(row: PurchaseRequest): string {
    return this.urgencyLabel(this.urgency(row)).toLowerCase() !== 'normal' ? 'urgent' : '';
  }

  rawValue(row: PurchaseRequest | undefined, ...keys: string[]): any {
    if (!row?.raw) return undefined;
    for (const key of keys) {
      const direct = row.raw[key];
      const unwrapped = this.unwrap(direct);
      if (unwrapped !== undefined && unwrapped !== null && unwrapped !== '') return unwrapped;
      const foundKey = Object.keys(row.raw).find(k => this.normalizeKey(k) === this.normalizeKey(key));
      if (foundKey) {
        const v = this.unwrap(row.raw[foundKey]);
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
    return undefined;
  }

  id(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'id_solicitud', 'idSolicitud', 'id') ?? row?.folio ?? row?.id; }
  title(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'descripción_solicitud', 'descripcion_solicitud', 'justificacion', 'justification') ?? row?.titulo ?? row?.descripcion; }
  justification(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'justificacion', 'justification', 'descripción_solicitud', 'descripcion_solicitud') ?? row?.descripcion; }
  requester(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'nombre_solicitante', 'solicitante') ?? row?.solicitante; }
  unit(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'ubicación', 'ubicacion', 'unidad') ?? row?.unidad; }
  statusValue(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'estado', 'state') ?? row?.estado; }
  urgency(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'urgencia', 'urgency') ?? row?.urgencia; }
  createdAt(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'fecha_creacion_solicitud', 'created_at') ?? row?.fechaCreacion; }
  updatedAt(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'fecha_actualización_autorizador', 'fecha_actualizacion_abastecimiento', 'fecha_actualizacion_adquisiciones', 'updated_at') ?? row?.fechaActualizacion; }
  estimatedAt(row: PurchaseRequest | undefined): any { return this.rawValue(row, 'fecha_estimada_uso', 'estimated_date') ?? row?.fechaEstimada; }

  items(row: PurchaseRequest | undefined): any[] {
    const raw = row?.raw;
    const items = raw?.items ?? raw?.purchase_request_details ?? raw?.detalles ?? [];
    return Array.isArray(items) ? items : [];
  }

  itemName(item: any): string { return this.display(item?.nombre ?? item?.article_name ?? item?.name); }
  itemQty(item: any): string { return this.display(item?.cant ?? item?.cantidad ?? item?.quantity); }
  itemUnit(item: any): string { return this.display(item?.unidad ?? item?.unit); }
  itemPrice(item: any): string { return this.amount(item?.precio ?? item?.price ?? item?.valor); }
  itemTotal(item: any): string {
    const price = Number(String(item?.precio ?? item?.price ?? 0).replace(/[^0-9.-]/g, ''));
    const qty = Number(String(item?.cant ?? item?.cantidad ?? 1).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(price)) return '-';
    return this.amount(price * (Number.isNaN(qty) || qty <= 0 ? 1 : qty));
  }

  totalEstimated(row: PurchaseRequest | undefined): string {
    const direct = this.rawValue(row, 'montoEstimado', 'monto_estimado', 'total_estimated', 'monto');
    if (direct) return this.amount(direct);
    const total = this.items(row).reduce((acc, item) => {
      const price = Number(String(item?.precio ?? item?.price ?? 0).replace(/[^0-9.-]/g, ''));
      const qty = Number(String(item?.cant ?? item?.cantidad ?? 1).replace(/[^0-9.-]/g, ''));
      return acc + (Number.isNaN(price) ? 0 : price * (Number.isNaN(qty) || qty <= 0 ? 1 : qty));
    }, 0);
    return total > 0 ? this.amount(total) : this.amount(row?.montoEstimado);
  }

  buyers(row: PurchaseRequest | undefined): any[] {
    const raw = row?.raw;
    const list = raw?.compradores ?? raw?.buyers ?? raw?.purchase_buyers ?? [];
    return Array.isArray(list) ? list : [];
  }

  buyerName(item: any): string { return this.display(item?.name ?? item?.comprador?.name ?? item?.nombre); }
  buyerDate(item: any): string { return this.date(item?.fecha_asignación ?? item?.fecha_asignacion ?? item?.created_at); }

  trace(row: PurchaseRequest | undefined): any[] {
    const r = row?.raw ?? {};
    const steps: any[] = [];
    const push = (label: string, person: any, state: any, date: any) => {
      if (person || state || date) steps.push({ label, person, state, date });
    };
    push('Autorizador Subdirección Administrativa', r.autorizador_sub_administrativa, r.estado_autorizador, r['fecha_actualización_autorizador'] ?? r.fecha_actualizacion_autorizador);
    push('Derivador Abastecimiento', r.derivador_abastecimiento, r.estado_derivador, r.fecha_actualizacion_abastecimiento);
    push('Unidad de Adquisiciones', r.unidad_adquisiciones, r.estado_unidad_adquisiciones, r.fecha_actualizacion_adquisiciones);
    for (const buyer of this.buyers(row)) push('Comprador asignado', this.buyerName(buyer), buyer?.state ?? 'Asignado', buyer?.fecha_asignación ?? buyer?.fecha_asignacion ?? buyer?.created_at);
    const movements = row?.movimientosCompra ?? r.movements_purchases ?? [];
    if (steps.length === 0 && Array.isArray(movements)) {
      for (const m of movements) push(this.movementTitle(m), this.movementUser(m), m?.state ?? m?.estado, m?.created_at ?? m?.updated_at);
    }
    return steps;
  }

  movementTitle(item: any): string { return this.display(item?.state ?? item?.status ?? item?.estado ?? item?.action ?? item?.accion ?? item?.id); }
  movementUser(item: any): string {
    const u = item?.user;
    if (u) return this.fullName(u);
    return this.display(item?.user_id ?? item?.usuario_id ?? item?.usuario ?? item?.created_by);
  }

  fullName(user: any): string {
    return [user?.name, user?.apepat, user?.apemat].filter(Boolean).join(' ') || this.display(user?.nombre ?? user?.name);
  }

  private unwrap(value: any): any {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.date) return value.date;
      if (value.name) return value.name;
      if (value.nombre) return value.nombre;
    }
    return value;
  }

  private normalizeKey(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private sanitize(value: any): any {
    if (Array.isArray(value)) return value.map(v => this.sanitize(v));
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const key of Object.keys(value)) {
        if (['password', 'access_token', 'token', 'jwt'].includes(key.toLowerCase())) out[key] = '*** oculto ***';
        else out[key] = this.sanitize(value[key]);
      }
      return out;
    }
    return value;
  }

  private today(): string { return this.toIsoDate(new Date()); }
  private defaultStartDate(): string { const d = new Date(); d.setDate(d.getDate() - 14); return this.toIsoDate(d); }
  private toIsoDate(date: Date): string { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
}
