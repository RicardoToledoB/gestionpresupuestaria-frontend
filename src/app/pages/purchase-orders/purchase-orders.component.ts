import { ChangeDetectorRef, Component, Inject, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { ApiService } from '../../core/api.service';
import { MasterOption, MercadoPublicoPurchaseOrder, PageResponse, PurchaseOrder } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { AuthService } from '../../core/auth.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, MatPaginatorModule, MatSnackBarModule, MatTableModule, MatTooltipModule, MatDialogModule, SearchSelectComponent],
  templateUrl: './purchase-orders.component.html'
})
export class PurchaseOrdersComponent implements OnInit {
  data: PurchaseOrder[] = [];
  columns: string[] = [];
  search = new FormControl('', { nonNullable: true });
  includeDeleted = new FormControl(false, { nonNullable: true });
  form!: FormGroup;
  editingId: number | null = null;
  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  loading = false;
  mercadoPublicoLoadingCodes = new Set<string>();

  programs: MasterOption[] = [];
  providers: MasterOption[] = [];
  budgetItems: MasterOption[] = [];
  cdps: MasterOption[] = [];
  statuses = ['SIN_ESTADO', 'ANULADA', 'EJECUTADA', 'PENDIENTE', 'EMITIDA'];
  statusOptions: MasterOption[] = this.statuses.map((s, index) => ({ id: index + 1, label: this.humanizeStatus(s), secondaryLabel: s, value: s }));
  subtitleOptions: MasterOption[] = [];

  @ViewChild(MatTable) table?: MatTable<PurchaseOrder>;

  constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly snack: MatSnackBar,
    private readonly auth: AuthService,
    private readonly confirmation: ConfirmationService,
    private readonly dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.refreshColumns();
    this.buildForm();
    this.loadLookups();
    this.loadData();
    this.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.pageIndex = 0;
      this.loadData();
    });
    this.includeDeleted.valueChanges.subscribe(() => {
      this.pageIndex = 0;
      this.loadData();
    });
  }


  refreshColumns(): void {
    this.columns = ['orderNumber', 'mercadoPublico', 'orderDate', 'purchaseRequestId', 'productServiceReceptionDate', 'programName', 'providerName', 'cdpNumber', 'sigfeFolio', 'committedAmount', 'realAmount', 'status'];
    if (this.canWrite()) this.columns.push('actions');
  }

  canWrite(): boolean { return this.auth.canWritePath('/purchase-orders'); }
  canDelete(): boolean { return this.auth.canDeletePath('/purchase-orders'); }
  canRestore(): boolean { return this.auth.canRestorePath('/purchase-orders'); }
  canSeeDeleted(): boolean { return this.auth.canSeeDeleted('/purchase-orders'); }
  canExport(): boolean { return this.auth.canExportFiltered('/purchase-orders'); }

  buildForm(): void {
    this.form = this.fb.group({
      orderNumber: ['', Validators.required],
      orderDate: [null],
      sigfeFolio: [''],
      purchaseRequestId: [''],
      productServiceReceptionDate: [null],
      programId: [null, Validators.required],
      providerId: [null],
      budgetItemId: [null],
      cdpId: [null],
      committedAmount: [0],
      adjustmentAmount: [0],
      realAmount: [0],
      status: ['SIN_ESTADO'],
      observation: [''],
      subtitle: [''],
      active: [true]
    });
  }

  loadLookups(): void {
    this.api.get<MasterOption[]>('/master-data/programs').subscribe(r => this.programs = r ?? []);
    this.api.get<MasterOption[]>('/master-data/providers').subscribe(r => this.providers = r ?? []);
    this.api.get<MasterOption[]>('/master-data/budget-items').subscribe(r => this.budgetItems = r ?? []);
    this.api.get<MasterOption[]>('/master-data/cdps').subscribe(r => this.cdps = r ?? []);
    this.api.get<MasterOption[]>('/master-data/purchase-order-states').subscribe(r => {
      const loaded = (r ?? []).map(option => ({
        ...option,
        label: option.label || this.humanizeStatus(option.secondaryLabel || ''),
        value: option.secondaryLabel || this.normalizeStatusCode(option.label)
      }));
      this.statusOptions = loaded.length ? loaded : this.statusOptions;
    });
    this.api.get<MasterOption[]>('/master-data/budget-subtitles').subscribe(r => this.subtitleOptions = r ?? []);
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<PurchaseOrder>>('/purchase-orders', {
      page: this.pageIndex,
      size: this.pageSize,
      search: this.search.value.trim(),
      includeDeleted: this.canSeeDeleted() && this.includeDeleted.value
    }).subscribe({
      next: page => {
        this.data = [...(page.content ?? [])];
        this.totalElements = page.totalElements ?? 0;
        this.loading = false;
        this.uiRefresh.refresh(this.cdr, this.table);
      },
      error: error => {
        console.error('Error cargando órdenes de compra', error);
        this.loading = false;
        this.snack.open('No fue posible cargar órdenes de compra', 'Cerrar', { duration: 3500 });
        this.uiRefresh.refresh(this.cdr, this.table);
      }
    });
  }

  save(): void {
    if (!this.canWrite()) { this.snack.open('No tiene permisos para crear o editar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.validateReceptionDate()) return;
    const payload = this.normalize(this.form.value);
    const req = this.editingId ? this.api.put<PurchaseOrder>(`/purchase-orders/${this.editingId}`, payload) : this.api.post<PurchaseOrder>('/purchase-orders', payload);
    req.subscribe({
      next: () => {
        this.snack.open(this.editingId ? 'OC actualizada y CDP recalculado' : 'OC creada y CDP recalculado', 'Cerrar', { duration: 2800 });
        this.cancelEdit();
        this.loadLookups();
        this.loadData();
      },
      error: err => {
        console.error(err);
        this.snack.open('No fue posible guardar la OC. Revise número, programa y datos obligatorios.', 'Cerrar', { duration: 4500 });
      }
    });
  }

  edit(row: PurchaseOrder): void {
    if (!this.canWrite()) { this.snack.open('No tiene permisos para editar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    this.editingId = row.id;
    this.form.patchValue({
      orderNumber: row.orderNumber ?? '',
      orderDate: this.parseLocalDate(row.orderDate),
      sigfeFolio: row.sigfeFolio ?? '',
      purchaseRequestId: row.purchaseRequestId ?? '',
      productServiceReceptionDate: this.parseLocalDate(row.productServiceReceptionDate),
      programId: row.programId ?? null,
      providerId: row.providerId ?? null,
      budgetItemId: row.budgetItemId ?? null,
      cdpId: row.cdpId ?? null,
      committedAmount: row.committedAmount ?? 0,
      adjustmentAmount: row.adjustmentAmount ?? 0,
      realAmount: row.realAmount ?? 0,
      status: row.status ?? 'SIN_ESTADO',
      observation: row.observation ?? '',
      subtitle: row.subtitle ?? '',
      active: !row.deletedAt
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }



  isMercadoPublicoLoading(row: PurchaseOrder): boolean {
    const code = this.normalizeOcCode(row.orderNumber);
    return !!code && this.mercadoPublicoLoadingCodes.has(code);
  }

  openMercadoPublico(row: PurchaseOrder): void {
    const code = this.normalizeOcCode(row.orderNumber);
    if (!code) {
      this.snack.open('La OC no tiene número válido para consultar Mercado Público.', 'Cerrar', { duration: 3500 });
      return;
    }
    if (this.mercadoPublicoLoadingCodes.has(code)) {
      this.snack.open(`Ya existe una consulta en curso para la OC ${code}.`, 'Cerrar', { duration: 2500 });
      return;
    }

    this.mercadoPublicoLoadingCodes.add(code);
    this.snack.open(`Consultando Mercado Público: ${code}. Si la API está limitada, el sistema reintentará automáticamente.`, 'Cerrar', { duration: 3500 });
    this.api.get<MercadoPublicoPurchaseOrder>(`/mercado-publico/purchase-orders/${encodeURIComponent(code)}`)
      .pipe(finalize(() => this.mercadoPublicoLoadingCodes.delete(code)))
      .subscribe({
        next: data => this.dialog.open(MercadoPublicoOrderDialogComponent, {
          data,
          width: '980px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'mp-oc-dialog'
        }),
        error: err => {
          console.error(err);
          const rawMessage = String(err?.error?.message ?? err?.message ?? '');
          const isRateLimit = err?.status === 429 || rawMessage.includes('429') || rawMessage.toLowerCase().includes('too many requests') || rawMessage.toLowerCase().includes('peticiones simult');
          const message = isRateLimit
            ? 'Mercado Público está limitando temporalmente las consultas por peticiones simultáneas. El sistema pausó nuevas consultas. Espere aproximadamente 1 minuto e intente nuevamente.'
            : (err?.error?.message ?? 'No fue posible consultar la OC en Mercado Público. Revise ticket/API.');
          this.snack.open(message, 'Cerrar', { duration: 9000 });
        }
      });
  }

  private normalizeOcCode(value: any): string {
    return String(value ?? '').replace(/\s+/g, '').trim().toUpperCase();
  }

  softDelete(row: PurchaseOrder): void {
    if (!this.canDelete()) { this.snack.open('No tiene permisos para eliminar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    this.confirmation.confirm({
      title: 'Confirmar eliminación lógica de OC',
      message: `¿Desea eliminar lógicamente la OC ${row.orderNumber}?`,
      detail: 'El registro podrá recuperarse posteriormente. Si está asociada a un CDP, se recalculará la ejecución correspondiente.',
      confirmText: 'Eliminar OC',
      tone: 'danger'
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.api.delete<void>(`/purchase-orders/${row.id}`).subscribe({
        next: () => { this.snack.open('OC eliminada lógicamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
        error: err => { console.error(err); this.snack.open(err?.error?.message ?? 'No fue posible eliminar la OC', 'Cerrar', { duration: 5000 }); }
      });
    });
  }

  restore(row: PurchaseOrder): void {
    if (!this.canRestore()) { this.snack.open('No tiene permisos para recuperar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    this.confirmation.confirm({
      title: 'Confirmar recuperación de OC',
      message: `¿Desea recuperar la OC ${row.orderNumber}?`,
      detail: 'La OC volverá a estar disponible y, si corresponde, se recalculará su CDP asociado.',
      confirmText: 'Recuperar OC',
      tone: 'info'
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.api.post<PurchaseOrder>(`/purchase-orders/${row.id}/restore`, {}).subscribe({
        next: () => { this.snack.open('OC recuperada y CDP recalculado', 'Cerrar', { duration: 2500 }); this.loadData(); },
        error: err => { console.error(err); this.snack.open(err?.error?.message ?? 'No fue posible recuperar la OC', 'Cerrar', { duration: 5000 }); }
      });
    });
  }

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  clearSearch(): void { this.search.setValue(''); }

  cancelEdit(): void {
    this.editingId = null;
    this.form.reset({ orderDate: null, purchaseRequestId: '', productServiceReceptionDate: null, committedAmount: 0, adjustmentAmount: 0, realAmount: 0, status: 'SIN_ESTADO', active: true });
  }

  isDeleted(row: PurchaseOrder): boolean { return !!row.deletedAt; }

  exportCurrentWindow(): void {
    if (!this.canExport()) { this.snack.open('No tiene permisos para exportar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    const keys = Object.keys(this.data[0] ?? {});
    const csv = [keys.join(';'), ...this.data.map((row: any) => keys.map(key => this.csvCell(row[key])).join(';'))].join('\n');
    this.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), `ordenes_compra_pagina_${this.pageIndex + 1}.csv`);
  }

  exportFiltered(): void {
    if (!this.canExport()) { this.snack.open('No tiene permisos para exportar órdenes de compra.', 'Cerrar', { duration: 3500 }); return; }
    this.api.download('/purchase-orders/export', { search: this.search.value.trim(), includeDeleted: this.canSeeDeleted() && this.includeDeleted.value }).subscribe({
      next: blob => this.saveBlob(blob, 'ordenes_compra_filtradas.csv'),
      error: err => { console.error(err); this.snack.open('No fue posible exportar OC', 'Cerrar', { duration: 3500 }); }
    });
  }

  private normalize(value: any): any {
    const n = { ...value };
    ['programId','providerId','budgetItemId','cdpId'].forEach(k => n[k] = n[k] ? Number(n[k]) : null);
    ['committedAmount','adjustmentAmount','realAmount'].forEach(k => n[k] = Number(n[k] || 0));
    ['orderDate','productServiceReceptionDate'].forEach(k => n[k] = this.toIsoDate(n[k]));
    return n;
  }

  private validateReceptionDate(): boolean {
    const orderDate = this.form.value.orderDate as Date | null;
    const receptionDate = this.form.value.productServiceReceptionDate as Date | null;
    if (orderDate && receptionDate && this.stripTime(receptionDate).getTime() < this.stripTime(orderDate).getTime()) {
      this.snack.open('La fecha de recepción del producto/servicio no puede ser menor que la fecha de la OC.', 'Cerrar', { duration: 4500 });
      return false;
    }
    return true;
  }

  private parseLocalDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parts = String(value).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  private toIsoDate(value: string | Date | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : this.parseLocalDate(value);
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private stripTime(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }


  humanizeStatus(value: string): string {
    const normalized = this.normalizeStatusCode(value);
    if (!normalized || normalized === 'SIN_ESTADO') return 'Sin Estado';
    return normalized
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  normalizeStatusCode(value: string | undefined | null): string {
    return String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private csvCell(value: any): string {
    if (value === null || value === undefined) return '""';
    return '"' + String(value).replace(/"/g, '""').replace(/\r|\n/g, ' ') + '"';
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


@Component({
  selector: 'app-mercado-publico-order-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, JsonPipe, MatButtonModule, MatIconModule, MatDialogModule, MatTabsModule],
  template: `
    <div class="mp-dialog">
      <div class="mp-dialog-header">
        <div>
          <div class="mp-kicker">Mercado Público</div>
          <h2 mat-dialog-title>Orden de compra {{ data.code }}</h2>
          <p>{{ data.name || data.description || 'Detalle obtenido desde la API de Mercado Público' }}</p>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content>
        <div class="mp-status-row">
          <span class="mp-status">{{ data.stateName || data.stateCode || 'Estado no informado' }}</span>
          @if (data.typeName || data.typeCode) { <span class="mp-tag">{{ data.typeName || data.typeCode }}</span> }
          @if (data.currency) { <span class="mp-tag">{{ data.currency }}</span> }
        </div>

        <div class="mp-kpi-grid">
          <div class="mp-kpi"><span>Total OC</span><strong>{{ data.totalAmount != null ? (data.totalAmount | currency:'CLP':'symbol-narrow':'1.0-0') : 'No informado' }}</strong></div>
          <div class="mp-kpi"><span>Fecha creación</span><strong>{{ data.creationDate || 'No informada' }}</strong></div>
          <div class="mp-kpi"><span>Fecha envío</span><strong>{{ data.sentDate || 'No informada' }}</strong></div>
          <div class="mp-kpi"><span>Fecha aceptación</span><strong>{{ data.acceptedDate || 'No informada' }}</strong></div>
        </div>

        <mat-tab-group class="mp-tabs" animationDuration="160ms" mat-stretch-tabs="false" mat-align-tabs="start">
          <mat-tab label="Resumen">
            <div class="mp-tab-content">
              <div class="mp-section-grid">
                <section class="mp-panel">
                  <h3>Organismo comprador</h3>
                  <dl>
                    <dt>Organismo</dt><dd>{{ data.buyerName || 'No informado' }}</dd>
                    <dt>Unidad</dt><dd>{{ data.buyerUnit || 'No informada' }}</dd>
                    <dt>RUT</dt><dd>{{ data.buyerRut || 'No informado' }}</dd>
                  </dl>
                </section>
                <section class="mp-panel">
                  <h3>Proveedor</h3>
                  <dl>
                    <dt>Razón social</dt><dd>{{ data.supplierName || 'No informada' }}</dd>
                    <dt>RUT</dt><dd>{{ data.supplierRut || 'No informado' }}</dd>
                    <dt>Código</dt><dd>{{ data.supplierCode || 'No informado' }}</dd>
                  </dl>
                </section>
              </div>

              <section class="mp-panel">
                <h3>Datos generales de la orden</h3>
                <div class="mp-detail-grid">
                  <div><span>Código OC</span><strong>{{ data.code }}</strong></div>
                  <div><span>Nombre</span><strong>{{ data.name || 'No informado' }}</strong></div>
                  <div><span>Descripción</span><strong>{{ data.description || 'No informada' }}</strong></div>
                  <div><span>Tipo</span><strong>{{ data.typeName || data.typeCode || 'No informado' }}</strong></div>
                  <div><span>Estado</span><strong>{{ data.stateName || data.stateCode || 'No informado' }}</strong></div>
                  <div><span>Moneda</span><strong>{{ data.currency || 'No informada' }}</strong></div>
                </div>
              </section>
            </div>
          </mat-tab>

          <mat-tab label="Ítems">
            <div class="mp-tab-content">
              @if (data.items && data.items.length) {
                <section class="mp-panel mp-items">
                  <h3>Ítems / productos detectados</h3>
                  <div class="mp-items-list">
                    @for (item of data.items; track $index) {
                      <article class="mp-item-card">
                        <div class="mp-item-header">
                          <div>
                            <span class="mp-item-index">Ítem {{ $index + 1 }}</span>
                            <strong>{{ getItemTitle(item, $index) }}</strong>
                          </div>
                        </div>

                        <div class="mp-item-fields">
                          @for (row of itemRows(item); track row.key) {
                            <div class="mp-item-field">
                              <span>{{ row.label }}</span>
                              <strong>{{ row.value }}</strong>
                            </div>
                          }
                        </div>
                      </article>
                    }
                  </div>
                </section>
              } @else {
                <section class="mp-panel"><p class="mp-muted">Mercado Público no entregó ítems para esta orden de compra.</p></section>
              }
            </div>
          </mat-tab>

          <mat-tab label="JSON técnico">
            <div class="mp-tab-content">
              <section class="mp-panel">
                <h3>Respuesta técnica completa</h3>
                <p class="mp-muted">Se deja disponible para revisión técnica. El JSON no reemplaza la vista resumida, solo permite auditoría y diagnóstico.</p>
                <pre class="mp-raw">{{ data.raw | json }}</pre>
              </section>
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        @if (data.sourceUrl) { <a mat-stroked-button [href]="data.sourceUrl" target="_blank" rel="noopener"><mat-icon>open_in_new</mat-icon>Ver en Mercado Público</a> }
        <button mat-flat-button color="primary" mat-dialog-close>Cerrar</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .mp-dialog { color: #111827; }
    .mp-dialog-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding: 8px 4px 0; }
    .mp-dialog-header h2 { margin: 0; font-size: 1.45rem; font-weight: 800; letter-spacing:-.02em; }
    .mp-dialog-header p { margin: 6px 0 0; color:#64748b; line-height:1.45; }
    .mp-kicker { color:#2563eb; font-weight:800; text-transform:uppercase; font-size:.75rem; letter-spacing:.08em; }
    .mp-status-row { display:flex; flex-wrap:wrap; gap:10px; margin: 8px 0 18px; }
    .mp-status, .mp-tag { border-radius:999px; padding:6px 12px; font-weight:700; font-size:.82rem; }
    .mp-status { background:#dcfce7; color:#166534; }
    .mp-tag { background:#eef2ff; color:#3730a3; }
    .mp-kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:16px; }
    .mp-kpi, .mp-panel { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px; }
    .mp-kpi span { display:block; color:#64748b; font-size:.8rem; margin-bottom:5px; }
    .mp-kpi strong { font-size:1.05rem; }
    .mp-tabs { margin-top: 4px; }
    .mp-tab-content { padding: 16px 0 2px; }
    .mp-section-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:14px; margin-bottom:16px; }
    .mp-panel h3 { margin:0 0 12px; font-size:1rem; }
    dl { display:grid; grid-template-columns: 130px 1fr; gap:8px 12px; margin:0; }
    dt { color:#64748b; font-weight:700; }
    dd { margin:0; }
    .mp-detail-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:12px; }
    .mp-detail-grid div, .mp-item-field { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px 12px; min-width:0; }
    .mp-detail-grid span, .mp-item-field span, .mp-item-index { display:block; color:#64748b; font-size:.75rem; font-weight:700; margin-bottom:4px; }
    .mp-detail-grid strong, .mp-item-field strong { display:block; overflow-wrap:anywhere; line-height:1.35; }
    .mp-items-list { display:grid; gap:12px; }
    .mp-item-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:14px; box-shadow:0 8px 20px rgba(15,23,42,.04); }
    .mp-item-header { display:flex; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .mp-item-header strong { font-size:1rem; overflow-wrap:anywhere; }
    .mp-item-fields { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px; }
    .mp-raw { white-space:pre-wrap; word-break:break-word; background:#0f172a; color:#dbeafe; padding:14px; border-radius:12px; max-height:420px; overflow:auto; font-size:.78rem; line-height:1.45; }
    .mp-muted { color:#64748b; margin-top:-4px; }
    @media (max-width: 900px) { .mp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mp-item-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .mp-kpi-grid, .mp-section-grid, .mp-detail-grid, .mp-item-fields { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }
  `]
})
export class MercadoPublicoOrderDialogComponent {
  private readonly importantItemKeys = [
    'Producto', 'Nombre', 'Descripcion', 'Descripción', 'EspecificacionComprador', 'EspecificaciónComprador',
    'Cantidad', 'UnidadMedida', 'PrecioUnitario', 'Precio Neto', 'Total', 'MontoTotal', 'CodigoProducto',
    'CodigoCategoria', 'Categoria', 'Moneda'
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public readonly data: MercadoPublicoPurchaseOrder) {}

  getItemTitle(item: Record<string, unknown>, index: number): string {
    return this.firstText(item, ['Nombre', 'Producto', 'Descripcion', 'Descripción', 'EspecificacionComprador', 'EspecificaciónComprador']) || `Ítem ${index + 1}`;
  }

  itemRows(item: Record<string, unknown>): { key: string; label: string; value: string }[] {
    const keys = new Set<string>();
    this.importantItemKeys.forEach(key => { if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') keys.add(key); });
    Object.keys(item).slice(0, 16).forEach(key => { if (!keys.has(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') keys.add(key); });
    return Array.from(keys).map(key => ({ key, label: this.humanizeKey(key), value: this.formatValue(item[key]) }));
  }

  private firstText(item: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = item[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
    return '';
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'No informado';
    if (typeof value === 'number') return new Intl.NumberFormat('es-CL').format(value);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
