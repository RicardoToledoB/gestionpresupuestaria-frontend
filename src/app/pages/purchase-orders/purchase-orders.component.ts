import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, timeout } from 'rxjs';
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
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { ApiService } from '../../core/api.service';
import { AssociatedPurchaseOrder, Cdp, MasterOption, MercadoPublicoPurchaseOrder, PageResponse, PurchaseOrder } from '../../core/models';
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
export class PurchaseOrdersComponent implements OnInit, OnDestroy {
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
  mercadoPublicoCache = new Map<string, MercadoPublicoPurchaseOrder>();
  mercadoPublicoCooldownUntil = 0;
  selectedPurchaseRequestPreview: any | null = null;
  private mercadoPublicoCooldownTimer?: ReturnType<typeof setInterval>;

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

  ngOnDestroy(): void {
    if (this.mercadoPublicoCooldownTimer) {
      clearInterval(this.mercadoPublicoCooldownTimer);
    }
  }


  refreshColumns(): void {
    this.columns = ['orderNumber', 'orderDate', 'purchaseRequestId', 'productServiceReceptionDate', 'programName', 'providerName', 'cdpNumber', 'sigfeFolio', 'committedAmount', 'realAmount', 'status'];
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
    this.selectedPurchaseRequestPreview = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }



  isMercadoPublicoLoading(row: PurchaseOrder): boolean {
    const code = this.normalizeOcCode(row.orderNumber);
    return !!code && this.mercadoPublicoLoadingCodes.has(code);
  }

  isMercadoPublicoCooldownActive(): boolean {
    return Date.now() < this.mercadoPublicoCooldownUntil;
  }

  mercadoPublicoCooldownSeconds(): number {
    if (!this.isMercadoPublicoCooldownActive()) return 0;
    return Math.max(Math.ceil((this.mercadoPublicoCooldownUntil - Date.now()) / 1000), 1);
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

    if (this.isMercadoPublicoCooldownActive()) {
      const cached = this.mercadoPublicoCache.get(code);
      if (cached) {
        this.snack.open(`Mercado Público está pausado. Mostrando última información disponible para ${code}.`, 'Cerrar', { duration: 5000 });
        this.openMercadoPublicoDialog({ ...cached, cacheHit: true, cacheStale: true, cooldownSecondsRemaining: this.mercadoPublicoCooldownSeconds() });
      } else {
        this.snack.open(`Mercado Público está limitando nuevas consultas. Espere aproximadamente ${this.mercadoPublicoCooldownSeconds()} segundos e intente nuevamente.`, 'Cerrar', { duration: 7000 });
      }
      return;
    }

    this.mercadoPublicoLoadingCodes.add(code);
    this.snack.open(`Consultando Mercado Público: ${code}. Si la API está limitada, el sistema usará caché o pausará nuevas consultas.`, 'Cerrar', { duration: 3500 });
    this.api.get<MercadoPublicoPurchaseOrder>(`/mercado-publico/purchase-orders/${encodeURIComponent(code)}`)
      .pipe(finalize(() => this.mercadoPublicoLoadingCodes.delete(code)))
      .subscribe({
        next: data => {
          this.mercadoPublicoCache.set(code, data);
          if (data.cooldownSecondsRemaining && data.cooldownSecondsRemaining > 0) {
            this.setMercadoPublicoCooldown(data.cooldownSecondsRemaining);
          }
          if (data.cacheStale) {
            this.snack.open('Mercado Público está limitando consultas. Se muestra información previamente consultada desde caché.', 'Cerrar', { duration: 7000 });
          } else if (data.cacheHit) {
            this.snack.open('Información obtenida desde caché local del sistema.', 'Cerrar', { duration: 3000 });
          }
          this.openMercadoPublicoDialog(data);
        },
        error: err => {
          console.error(err);
          const rawMessage = String(err?.error?.message ?? err?.message ?? '');
          const isRateLimit = err?.status === 429 || rawMessage.includes('429') || rawMessage.toLowerCase().includes('too many requests') || rawMessage.toLowerCase().includes('peticiones simult');
          if (isRateLimit) {
            const seconds = this.extractCooldownSeconds(rawMessage) || 90;
            this.setMercadoPublicoCooldown(seconds);
            const cached = this.mercadoPublicoCache.get(code);
            if (cached) {
              this.snack.open(`Mercado Público pausó nuevas consultas. Se muestra última información disponible para ${code}.`, 'Cerrar', { duration: 7000 });
              this.openMercadoPublicoDialog({ ...cached, cacheHit: true, cacheStale: true, cooldownSecondsRemaining: seconds });
              return;
            }
          }
          const message = isRateLimit
            ? `Mercado Público está limitando temporalmente las consultas por peticiones simultáneas. El sistema pausó nuevas consultas. Espere aproximadamente ${this.mercadoPublicoCooldownSeconds() || 60} segundos e intente nuevamente.`
            : (err?.error?.message ?? 'No fue posible consultar la OC en Mercado Público. Revise ticket/API.');
          this.snack.open(message, 'Cerrar', { duration: 9000 });
        }
      });
  }

  private openMercadoPublicoDialog(data: MercadoPublicoPurchaseOrder): void {
    this.dialog.open(MercadoPublicoOrderDialogComponent, {
      data,
      width: '980px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'mp-oc-dialog'
    });
  }



  selectedPurchaseRequestId(): string {
    return String(this.form?.value?.purchaseRequestId ?? '').trim();
  }

  selectedPurchaseRequestSummary(): string {
    const raw = this.selectedPurchaseRequestPreview?.raw ?? this.selectedPurchaseRequestPreview;
    const text = raw?.['descripción_solicitud'] || raw?.descripcion_solicitud || raw?.justificacion || this.selectedPurchaseRequestPreview?.descripcion || '';
    return String(text || '').trim();
  }

  openPurchaseRequestPicker(): void {
    const currentId = this.selectedPurchaseRequestId();
    this.dialog.open(PurchaseRequestPickerDialogComponent, {
      data: { currentId },
      width: '920px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'purchase-request-picker-dialog'
    }).afterClosed().subscribe(result => {
      if (!result?.id) return;
      this.form.patchValue({ purchaseRequestId: String(result.id).trim() });
      this.selectedPurchaseRequestPreview = result.request ?? null;
      this.snack.open(`Solicitud ${result.id} vinculada al formulario de la OC. Guarde la OC para confirmar.`, 'Cerrar', { duration: 4500 });
    });
  }

  clearPurchaseRequestAssociation(): void {
    this.form.patchValue({ purchaseRequestId: '' });
    this.selectedPurchaseRequestPreview = null;
    this.snack.open('Solicitud de compra quitada del formulario. Guarde la OC para confirmar el cambio.', 'Cerrar', { duration: 4200 });
  }

  openCeroPapelRequest(purchaseRequestId: string | null | undefined): void {
    const id = String(purchaseRequestId ?? '').trim();
    if (!id) {
      this.snack.open('La OC no tiene ID de solicitud de compra asociado.', 'Cerrar', { duration: 3500 });
      return;
    }
    this.snack.open(`Consultando solicitud CeroPapel ${id}...`, 'Cerrar', { duration: 2000 });
    this.api.post<any>('/ceropapel/purchase-requests/show', { id }).pipe(timeout(10000)).subscribe({
      next: data => {
        this.dialog.open(CeroPapelLinkedRequestDialogComponent, {
          data,
          width: '980px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'ceropapel-linked-dialog'
        });
      },
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar la solicitud en CeroPapel.', 'Cerrar', { duration: 6000 })
    });
  }


  openCdpDetail(row: PurchaseOrder): void {
    if (!row.cdpId) {
      this.snack.open('Esta OC no tiene CDP asociado.', 'Cerrar', { duration: 3500 });
      return;
    }
    this.snack.open(`Consultando CDP ${row.cdpNumber ?? ''}...`, 'Cerrar', { duration: 1800 });
    this.api.get<Cdp>(`/cdps/${row.cdpId}`).subscribe({
      next: cdp => {
        this.api.get<AssociatedPurchaseOrder[]>(`/cdps/${row.cdpId}/purchase-orders`).subscribe({
          next: orders => this.dialog.open(CdpDetailDialogComponent, {
            data: { cdp, orders: orders ?? [] },
            width: '980px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            panelClass: 'cdp-detail-dialog'
          }),
          error: () => this.dialog.open(CdpDetailDialogComponent, {
            data: { cdp, orders: [] },
            width: '980px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            panelClass: 'cdp-detail-dialog'
          })
        });
      },
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar el CDP asociado.', 'Cerrar', { duration: 5000 })
    });
  }

  private setMercadoPublicoCooldown(seconds: number): void {
    this.mercadoPublicoCooldownUntil = Math.max(this.mercadoPublicoCooldownUntil, Date.now() + Math.max(seconds, 1) * 1000);
    if (!this.mercadoPublicoCooldownTimer) {
      this.mercadoPublicoCooldownTimer = setInterval(() => {
        if (!this.isMercadoPublicoCooldownActive()) {
          if (this.mercadoPublicoCooldownTimer) clearInterval(this.mercadoPublicoCooldownTimer);
          this.mercadoPublicoCooldownTimer = undefined;
        }
        this.cdr.detectChanges();
      }, 1000);
    }
  }

  private extractCooldownSeconds(message: string): number | null {
    const match = message.match(/(\d+)\s*seg/i);
    return match ? Number(match[1]) : null;
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
    this.selectedPurchaseRequestPreview = null;
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
  selector: 'app-purchase-request-picker-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, MatButtonModule, MatIconModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatTooltipModule],
  template: `
    <div class="pr-picker-dialog">
      <div class="pr-picker-header">
        <div>
          <div class="pr-kicker">CeroPapel</div>
          <h2 mat-dialog-title>Buscar solicitud de compra</h2>
          <p>Busque por ID de solicitud, revise el resumen y seleccione la solicitud que originó esta orden de compra.</p>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content>
        <div class="pr-search-row">
          <mat-form-field appearance="outline" class="pr-search-input">
            <mat-label>ID solicitud CeroPapel</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="idControl" placeholder="Ej: 10671" (keyup.enter)="search()">
          </mat-form-field>
          <button mat-flat-button color="primary" type="button" (click)="search()" [disabled]="loading">
            <mat-icon>manage_search</mat-icon>{{ loading ? 'Buscando...' : 'Buscar' }}
          </button>
        </div>

        @if (message) {
          <div class="pr-message"><mat-icon>info</mat-icon><span>{{ message }}</span></div>
        }

        @if (request) {
          <section class="pr-result-card">
            <div class="pr-result-top">
              <div>
                <span class="pr-result-id">Solicitud {{ requestId(request) }}</span>
                <h3>{{ title(request) }}</h3>
              </div>
              <span class="pr-state-chip">{{ display(raw(request, 'estado') || request.estado) }}</span>
            </div>

            <div class="pr-result-grid">
              <div><span>Solicitante</span><strong>{{ display(raw(request, 'nombre_solicitante') || request.solicitante) }}</strong></div>
              <div><span>Unidad</span><strong>{{ display(raw(request, 'ubicación') || raw(request, 'ubicacion') || request.unidad) }}</strong></div>
              <div><span>Urgencia</span><strong>{{ urgency(raw(request, 'urgencia') || request.urgencia) }}</strong></div>
              <div><span>Total estimado</span><strong>{{ totalEstimated(request) }}</strong></div>
              <div><span>Fecha creación</span><strong>{{ date(raw(request, 'fecha_creacion_solicitud') || request.fechaCreacion) }}</strong></div>
              <div><span>Fecha estimada uso</span><strong>{{ date(raw(request, 'fecha_estimada_uso') || request.fechaEstimada) }}</strong></div>
            </div>

            <div class="pr-description">
              <span>Justificación / materia</span>
              <p>{{ display(raw(request, 'justificacion') || raw(request, 'descripción_solicitud') || request.descripcion || request.titulo) }}</p>
            </div>

            <div class="pr-result-actions">
              <button mat-stroked-button type="button" (click)="openPreview()"><mat-icon>visibility</mat-icon>Ver detalle completo</button>
              <button mat-flat-button color="primary" type="button" (click)="select()"><mat-icon>link</mat-icon>Vincular esta solicitud</button>
            </div>
          </section>
        }
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .pr-picker-dialog { color:#111827; min-width:min(760px, 92vw); }
    .pr-picker-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:8px 4px 0; }
    .pr-picker-header h2 { margin:0; font-size:1.45rem; font-weight:800; }
    .pr-picker-header p { margin:6px 0 0; color:#64748b; line-height:1.45; max-width:720px; }
    .pr-kicker { color:#2563eb; font-weight:800; text-transform:uppercase; font-size:.75rem; letter-spacing:.08em; }
    .pr-search-row { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:start; margin:10px 0 14px; }
    .pr-search-input { width:100%; }
    .pr-message { display:flex; gap:8px; align-items:center; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px; margin:8px 0 12px; }
    .pr-result-card { border:1px solid #dbe3ef; border-radius:18px; padding:16px; background:#fff; box-shadow:0 12px 30px rgba(15,23,42,.06); }
    .pr-result-top { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:14px; }
    .pr-result-id { color:#2563eb; font-weight:800; font-size:.82rem; }
    .pr-result-top h3 { margin:4px 0 0; font-size:1.05rem; line-height:1.35; }
    .pr-state-chip { border-radius:999px; padding:6px 12px; background:#eef2ff; color:#1d4ed8; font-weight:800; white-space:nowrap; }
    .pr-result-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
    .pr-result-grid div, .pr-description { background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px; padding:12px; min-width:0; }
    .pr-result-grid span, .pr-description span { display:block; color:#64748b; font-size:.76rem; font-weight:800; margin-bottom:5px; }
    .pr-result-grid strong { overflow-wrap:anywhere; }
    .pr-description { margin-top:10px; }
    .pr-description p { margin:0; line-height:1.5; }
    .pr-result-actions { display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:14px; }
    @media (max-width:760px) { .pr-search-row, .pr-result-grid { grid-template-columns:1fr; } .pr-result-top { flex-direction:column; } }
  `]
})
export class PurchaseRequestPickerDialogComponent {
  idControl = new FormControl('', { nonNullable: true });
  request: any | null = null;
  loading = false;
  message = 'Ingrese el ID de solicitud de compra para validar contra CeroPapel antes de asociarla a la OC.';

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: { currentId?: string },
    private readonly api: ApiService,
    private readonly snack: MatSnackBar,
    private readonly dialog: MatDialog,
    private readonly ref: MatDialogRef<PurchaseRequestPickerDialogComponent>
  ) {
    if (data?.currentId) {
      this.idControl.setValue(String(data.currentId));
      setTimeout(() => this.search());
    }
  }

  search(): void {
    const id = String(this.idControl.value ?? '').trim();
    if (!id) {
      this.message = 'Debe ingresar un ID de solicitud de compra para buscar en CeroPapel.';
      this.request = null;
      return;
    }
    this.loading = true;
    this.message = `Consultando solicitud ${id} en CeroPapel...`;
    this.api.post<any>('/ceropapel/purchase-requests/show', { id })
      .pipe(timeout(10000), finalize(() => this.loading = false))
      .subscribe({
        next: data => {
          const foundId = this.requestId(data);
          if (!foundId || foundId === '-') {
            this.request = null;
            this.message = `No se encontró una solicitud válida con ID ${id}.`;
            return;
          }
          this.request = data;
          this.message = 'Solicitud encontrada. Revise el resumen antes de vincularla al formulario de la OC.';
        },
        error: err => {
          console.error(err);
          this.request = null;
          this.message = err?.error?.message ?? 'No fue posible consultar la solicitud en CeroPapel.';
        }
      });
  }

  select(): void {
    const id = this.requestId(this.request);
    if (!id || id === '-') return;
    this.ref.close({ id, request: this.request });
  }

  openPreview(): void {
    if (!this.request) return;
    this.dialog.open(CeroPapelLinkedRequestDialogComponent, {
      data: this.request,
      width: '980px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'ceropapel-linked-dialog'
    });
  }

  requestId(req: any): string { return this.display(this.raw(req, 'id_solicitud') || req?.id || req?.folio); }
  title(req: any): string { return this.display(this.raw(req, 'descripción_solicitud') || this.raw(req, 'descripcion_solicitud') || this.raw(req, 'justificacion') || req?.descripcion || req?.titulo); }
  raw(req: any, key: string): any { const raw = req?.raw ?? req ?? {}; return raw[key] ?? raw[this.findKey(raw, key)] ?? req?.[key]; }
  private findKey(raw: any, key: string): string { const norm = this.normalizeKey(key); return Object.keys(raw ?? {}).find(k => this.normalizeKey(k) === norm) ?? key; }
  display(value: any): string { const v = this.unwrap(value); return v === null || v === undefined || v === '' || String(v).toLowerCase() === 'null' ? '-' : String(v); }
  date(value: any): string { const v = this.unwrap(value); if (!v) return '-'; const d = new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? String(v).slice(0, 19) : new Intl.DateTimeFormat('es-CL', { dateStyle:'short', timeStyle:String(v).includes(':') ? 'short' : undefined }).format(d); }
  urgency(value: any): string { const text = this.display(value).toLowerCase(); return ['-', '0', 'no', 'normal'].includes(text) ? 'Normal' : (['1', 'si', 'sí', 'urgente', 'yes'].includes(text) ? 'Urgente' : this.display(value)); }
  totalEstimated(req: any): string { const raw = req?.raw ?? req ?? {}; const items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw.purchase_request_details) ? raw.purchase_request_details : []); const total = items.reduce((acc: number, item: any) => { const price = Number(String(item?.precio ?? item?.price ?? 0).replace(/[^0-9.-]/g, '')); const qty = Number(String(item?.cant ?? item?.cantidad ?? 1).replace(/[^0-9.-]/g, '')); return acc + (Number.isNaN(price) ? 0 : price * (Number.isNaN(qty) || qty <= 0 ? 1 : qty)); }, 0); return total > 0 ? new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(total) : '-'; }
  private unwrap(value: any): any { if (value && typeof value === 'object' && !Array.isArray(value)) return value.date ?? value.name ?? value.nombre ?? value; return value; }
  private normalizeKey(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
}


@Component({
  selector: 'app-ceropapel-linked-request-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, JsonPipe, MatButtonModule, MatIconModule, MatDialogModule, MatTabsModule],
  template: `
    <div class="cp-linked-dialog">
      <div class="cp-dialog-header">
        <div>
          <div class="cp-kicker">CeroPapel</div>
          <h2 mat-dialog-title>Solicitud de compra {{ id() }}</h2>
          <p>{{ title() }}</p>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>

      <mat-dialog-content>
        <mat-tab-group class="cp-tabs">
          <mat-tab label="Resumen">
            <section class="cp-tab-content">
              <div class="cp-kpi-grid">
                <article><span>Estado</span><strong>{{ display(raw('estado') || data.estado) }}</strong></article>
                <article><span>Urgencia</span><strong>{{ urgencyLabel(raw('urgencia') || data.urgencia) }}</strong></article>
                <article><span>Total estimado</span><strong>{{ totalEstimated() }}</strong></article>
                <article><span>Fecha creación</span><strong>{{ date(raw('fecha_creacion_solicitud') || data.fechaCreacion) }}</strong></article>
              </div>
              <div class="cp-detail-grid">
                <div><span>Solicitante</span><strong>{{ display(raw('nombre_solicitante') || data.solicitante) }}</strong></div>
                <div><span>Unidad solicitante</span><strong>{{ display(raw('ubicación') || raw('ubicacion') || data.unidad) }}</strong></div>
                <div><span>Fecha estimada de uso</span><strong>{{ date(raw('fecha_estimada_uso') || data.fechaEstimada) }}</strong></div>
                <div><span>Autorizador Subdirección Adm.</span><strong>{{ display(raw('autorizador_sub_administrativa')) }}</strong></div>
                <div><span>Derivador Abastecimiento</span><strong>{{ display(raw('derivador_abastecimiento')) }}</strong></div>
                <div><span>Unidad Adquisiciones</span><strong>{{ display(raw('unidad_adquisiciones')) }}</strong></div>
              </div>
              <div class="cp-description-card">
                <h3>Justificación / materia</h3>
                <p>{{ display(raw('justificacion') || raw('descripción_solicitud') || data.descripcion || data.titulo) }}</p>
              </div>
            </section>
          </mat-tab>
          <mat-tab label="Ítems">
            <section class="cp-tab-content">
              @if (items().length === 0) {
                <p class="cp-empty">No se informaron ítems en CeroPapel.</p>
              } @else {
                <div class="cp-item-list">
                  @for (item of items(); track item?.id || $index) {
                    <article class="cp-item-card">
                      <header><strong>{{ display(item?.nombre || item?.article_name || item?.name) }}</strong><span>{{ itemTotal(item) }}</span></header>
                      <div class="cp-item-meta">
                        <span>Cantidad: <b>{{ display(item?.cant || item?.cantidad || 1) }}</b></span>
                        <span>Unidad: <b>{{ display(item?.unidad || item?.unit) }}</b></span>
                        <span>Precio: <b>{{ amount(item?.precio || item?.price) }}</b></span>
                      </div>
                      <p>{{ display(item?.observacion || item?.observation) }}</p>
                    </article>
                  }
                </div>
              }
            </section>
          </mat-tab>
          <mat-tab label="Trazabilidad">
            <section class="cp-tab-content">
              <div class="cp-timeline">
                @for (step of trace(); track step.label + '-' + $index) {
                  <article class="cp-timeline-item">
                    <div class="cp-timeline-dot"></div>
                    <div class="cp-timeline-body">
                      <header><strong>{{ step.label }}</strong><span>{{ date(step.date) }}</span></header>
                      <p><b>{{ display(step.state) }}</b></p>
                      <small>Responsable: {{ display(step.person) }}</small>
                    </div>
                  </article>
                }
              </div>
            </section>
          </mat-tab>
          <mat-tab label="OC asociadas">
            <section class="cp-tab-content">
              @if (associatedOrders().length === 0) {
                <p class="cp-empty">Esta solicitud aún no tiene órdenes de compra asociadas en el sistema.</p>
              } @else {
                <div class="cp-associated-grid">
                  @for (oc of associatedOrders(); track oc.id || oc.orderNumber) {
                    <article class="cp-associated-card">
                      <header>
                        <strong>{{ oc.orderNumber }}</strong>
                        <span>{{ amount(oc.realAmount) }}</span>
                      </header>
                      <p>{{ oc.programName || 'Sin programa' }} · {{ oc.providerName || 'Sin proveedor' }}</p>
                      <small>CDP: {{ oc.cdpNumber || 'Sin CDP' }} · SIGFE: {{ oc.sigfeFolio || '-' }}</small>
                      <div class="cp-cross-actions">
                        @if (oc.cdpId) { <button mat-button type="button" (click)="openCdp(oc)"><mat-icon>fact_check</mat-icon> Ver CDP</button> }
                        <button mat-button type="button" (click)="openMercadoPublico(oc)"><mat-icon>public</mat-icon> Mercado Público</button>
                      </div>
                    </article>
                  }
                </div>
              }
            </section>
          </mat-tab>
          <mat-tab label="JSON técnico">
            <section class="cp-tab-content">
              <pre class="cp-raw">{{ rawJson(data.raw || data) }}</pre>
            </section>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .cp-linked-dialog { color:#111827; min-width:min(820px, 92vw); }
    .cp-dialog-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:8px 4px 0; }
    .cp-kicker { color:#2563eb; font-weight:800; text-transform:uppercase; font-size:.75rem; letter-spacing:.08em; }
    .cp-dialog-header h2 { margin:0; font-size:1.45rem; font-weight:800; }
    .cp-dialog-header p { margin:6px 0 0; color:#64748b; line-height:1.45; max-width:860px; }
    .cp-tab-content { padding:16px 0 4px; }
    .cp-kpi-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:14px; }
    .cp-kpi-grid article, .cp-detail-grid div, .cp-description-card, .cp-item-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px; }
    .cp-kpi-grid span, .cp-detail-grid span { display:block; color:#64748b; font-size:.78rem; font-weight:700; margin-bottom:5px; }
    .cp-kpi-grid strong, .cp-detail-grid strong { overflow-wrap:anywhere; }
    .cp-detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
    .cp-description-card { margin-top:14px; }
    .cp-description-card h3 { margin:0 0 8px; }
    .cp-description-card p { margin:0; line-height:1.55; }
    .cp-item-list { display:grid; gap:12px; }
    .cp-item-card header { display:flex; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .cp-item-meta { display:flex; flex-wrap:wrap; gap:10px; color:#475569; }
    .cp-timeline { display:grid; gap:10px; }
    .cp-timeline-item { display:grid; grid-template-columns:18px 1fr; gap:12px; }
    .cp-timeline-dot { width:12px; height:12px; margin-top:18px; border-radius:999px; background:#2563eb; }
    .cp-timeline-body { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:12px; }
    .cp-timeline-body header { display:flex; justify-content:space-between; gap:12px; }
    .cp-raw { white-space:pre-wrap; word-break:break-word; background:#0f172a; color:#dbeafe; padding:14px; border-radius:12px; max-height:430px; overflow:auto; font-size:.78rem; line-height:1.45; }
    .cp-empty { color:#64748b; }
    .cp-associated-grid { display:grid; gap:12px; }
    .cp-associated-card { border:1px solid #e2e8f0; border-radius:16px; padding:14px; background:#f8fafc; }
    .cp-associated-card header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:8px; }
    .cp-associated-card p { margin:0 0 6px; color:#334155; }
    .cp-associated-card small { color:#64748b; }
    .cp-cross-actions { margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
    @media (max-width: 760px) { .cp-kpi-grid, .cp-detail-grid { grid-template-columns:1fr; } }
  `]
})
export class CeroPapelLinkedRequestDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: any,
    private readonly api: ApiService,
    private readonly dialog: MatDialog,
    private readonly snack: MatSnackBar
  ) {}

  id(): string { return this.display(this.raw('id_solicitud') || this.data.id || this.data.folio); }
  title(): string { return this.display(this.raw('descripción_solicitud') || this.raw('descripcion_solicitud') || this.raw('justificacion') || this.data.titulo || this.data.descripcion); }
  raw(key: string): any { return this.data?.raw?.[key] ?? this.data?.raw?.[this.findKey(key)] ?? this.data?.[key]; }
  private findKey(key: string): string { const norm = this.normalizeKey(key); return Object.keys(this.data?.raw ?? {}).find(k => this.normalizeKey(k) === norm) ?? key; }
  display(value: any): string { const v = this.unwrap(value); return v === null || v === undefined || v === '' || String(v).toLowerCase() === 'null' ? '-' : String(v); }
  date(value: any): string { const v = this.unwrap(value); if (!v) return '-'; const d = new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? String(v).slice(0, 19) : new Intl.DateTimeFormat('es-CL', { dateStyle:'short', timeStyle:String(v).includes(':') ? 'short' : undefined }).format(d); }
  amount(value: any): string { if (value === null || value === undefined || value === '') return '-'; const n = Number(String(value).replace(/[^0-9.-]/g, '')); return Number.isNaN(n) ? String(value) : new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(n); }
  items(): any[] { const raw = this.data?.raw ?? this.data ?? {}; const list = raw.items ?? raw.purchase_request_details ?? []; return Array.isArray(list) ? list : []; }
  itemTotal(item: any): string { const price = Number(String(item?.precio ?? item?.price ?? 0).replace(/[^0-9.-]/g, '')); const qty = Number(String(item?.cant ?? item?.cantidad ?? 1).replace(/[^0-9.-]/g, '')); return Number.isNaN(price) ? '-' : this.amount(price * (Number.isNaN(qty) || qty <= 0 ? 1 : qty)); }
  totalEstimated(): string { const total = this.items().reduce((acc, item) => { const price = Number(String(item?.precio ?? item?.price ?? 0).replace(/[^0-9.-]/g, '')); const qty = Number(String(item?.cant ?? item?.cantidad ?? 1).replace(/[^0-9.-]/g, '')); return acc + (Number.isNaN(price) ? 0 : price * (Number.isNaN(qty) || qty <= 0 ? 1 : qty)); }, 0); return total > 0 ? this.amount(total) : this.amount(this.data?.montoEstimado); }
  urgencyLabel(value: any): string { const text = this.display(value).toLowerCase(); return ['-', '0', 'no', 'normal'].includes(text) ? 'Normal' : (['1', 'si', 'sí', 'urgente', 'yes'].includes(text) ? 'Urgente' : this.display(value)); }
  trace(): any[] { const r = this.data?.raw ?? {}; const steps: any[] = []; const push = (label: string, person: any, state: any, date: any) => { if (person || state || date) steps.push({ label, person, state, date }); }; push('Autorizador Subdirección Administrativa', r.autorizador_sub_administrativa, r.estado_autorizador, r['fecha_actualización_autorizador'] ?? r.fecha_actualizacion_autorizador); push('Derivador Abastecimiento', r.derivador_abastecimiento, r.estado_derivador, r.fecha_actualizacion_abastecimiento); push('Unidad de Adquisiciones', r.unidad_adquisiciones, r.estado_unidad_adquisiciones, r.fecha_actualizacion_adquisiciones); for (const b of (Array.isArray(r.compradores) ? r.compradores : [])) push('Comprador asignado', b.name ?? b.comprador?.name, b.state ?? 'Asignado', b.fecha_asignación ?? b.fecha_asignacion ?? b.created_at); return steps; }
  associatedOrders(): AssociatedPurchaseOrder[] { const list = this.data?.ordenesCompraAsociadas ?? this.data?.raw?.ordenesCompraAsociadas ?? this.data?.raw?.ordenes_compra_asociadas ?? []; return Array.isArray(list) ? list : []; }
  openCdp(oc: AssociatedPurchaseOrder): void {
    if (!oc.cdpId) { this.snack.open('La OC no tiene CDP asociado.', 'Cerrar', { duration: 3000 }); return; }
    this.api.get<Cdp>(`/cdps/${oc.cdpId}`).subscribe({
      next: cdp => this.api.get<AssociatedPurchaseOrder[]>(`/cdps/${oc.cdpId}/purchase-orders`).subscribe({
        next: orders => this.dialog.open(CdpDetailDialogComponent, { data: { cdp, orders: orders ?? [] }, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'cdp-detail-dialog' }),
        error: () => this.dialog.open(CdpDetailDialogComponent, { data: { cdp, orders: [] }, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'cdp-detail-dialog' })
      }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible abrir el CDP asociado.', 'Cerrar', { duration: 5000 })
    });
  }
  openMercadoPublico(oc: AssociatedPurchaseOrder): void {
    const code = String(oc.orderNumber ?? '').replace(/\s+/g, '').trim();
    if (!code) return;
    this.api.get<MercadoPublicoPurchaseOrder>(`/mercado-publico/purchase-orders/${encodeURIComponent(code)}`).subscribe({
      next: data => this.dialog.open(MercadoPublicoOrderDialogComponent, { data, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'mp-oc-dialog' }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar Mercado Público.', 'Cerrar', { duration: 6000 })
    });
  }
  rawJson(value: any): string { try { return JSON.stringify(this.sanitize(value ?? {}), null, 2); } catch { return String(value ?? ''); } }
  private unwrap(value: any): any { if (value && typeof value === 'object' && !Array.isArray(value)) return value.date ?? value.name ?? value.nombre ?? value; return value; }
  private normalizeKey(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  private sanitize(value: any): any { if (Array.isArray(value)) return value.map(v => this.sanitize(v)); if (value && typeof value === 'object') { const out: any = {}; for (const key of Object.keys(value)) out[key] = ['password','access_token','token','jwt'].includes(key.toLowerCase()) ? '*** oculto ***' : this.sanitize(value[key]); return out; } return value; }
}


@Component({
  selector: 'app-cdp-detail-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatButtonModule, MatIconModule, MatDialogModule, MatTabsModule],
  template: `
    <div class="cdp-dialog">
      <div class="cdp-dialog-header">
        <div>
          <div class="cdp-kicker">CDP</div>
          <h2 mat-dialog-title>Certificado de Disponibilidad Presupuestaria {{ data.cdp.cdpNumber }}</h2>
          <p>{{ data.cdp.description || 'Detalle del CDP asociado a la orden de compra.' }}</p>
        </div>
        <button mat-icon-button mat-dialog-close aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>
      <mat-dialog-content>
        <mat-tab-group class="cdp-tabs">
          <mat-tab label="Resumen">
            <section class="cdp-tab-content">
              <div class="cdp-kpi-grid">
                <article><span>Monto real CDP</span><strong>{{ amount(data.cdp.realCdpAmount) }}</strong></article>
                <article><span>Ejecutado por OC</span><strong>{{ amount(data.cdp.executedAmount) }}</strong></article>
                <article><span>Saldo pendiente</span><strong>{{ amount(data.cdp.pendingBalance) }}</strong></article>
                <article><span>Estado</span><strong>{{ statusLabel(data.cdp.alertStatus) }}</strong></article>
              </div>
              <div class="cdp-detail-grid">
                <div><span>Programa</span><strong>{{ data.cdp.programName || '-' }}</strong></div>
                <div><span>Proveedor</span><strong>{{ data.cdp.providerName || '-' }}</strong></div>
                <div><span>Ítem presupuestario</span><strong>{{ itemLabel() }}</strong></div>
                <div><span>Tipo CDP</span><strong>{{ data.cdp.cdpType || '-' }}</strong></div>
                <div><span>Fecha CDP</span><strong>{{ data.cdp.cdpDate | date:'dd-MM-yyyy' }}</strong></div>
                <div><span>Cobertura</span><strong>{{ coverageLabel() }}</strong></div>
                <div><span>% ejecutado</span><strong>{{ number(data.cdp.executedPercent) }}%</strong></div>
                <div><span>Posible liberación</span><strong>{{ amount(data.cdp.possibleReleaseAmount) }}</strong></div>
              </div>
              @if (data.cdp.observation) { <div class="cdp-description"><h3>Observación</h3><p>{{ data.cdp.observation }}</p></div> }
            </section>
          </mat-tab>
          <mat-tab label="Órdenes de compra">
            <section class="cdp-tab-content">
              @if ((data.orders || []).length === 0) {
                <p class="cdp-empty">No se encontraron órdenes de compra asociadas a este CDP.</p>
              } @else {
                <div class="cdp-oc-list">
                  @for (oc of data.orders; track oc.id || oc.orderNumber) {
                    <article class="cdp-oc-card">
                      <header><strong>{{ oc.orderNumber }}</strong><span>{{ amount(oc.realAmount) }}</span></header>
                      <p>{{ oc.programName || 'Sin programa' }} · {{ oc.providerName || 'Sin proveedor' }}</p>
                      <small>Solicitud CeroPapel: {{ oc.purchaseRequestId || 'Sin solicitud' }} · SIGFE: {{ oc.sigfeFolio || '-' }}</small>
                      <div class="cdp-cross-actions">
                        @if (oc.purchaseRequestId) { <button mat-button type="button" (click)="openSolicitud(oc)"><mat-icon>assignment</mat-icon> Ver solicitud</button> }
                        <button mat-button type="button" (click)="openMercadoPublico(oc)"><mat-icon>public</mat-icon> Mercado Público</button>
                      </div>
                    </article>
                  }
                </div>
              }
            </section>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>
    </div>
  `,
  styles: [`
    .cdp-dialog { color:#111827; min-width:min(860px, 92vw); }
    .cdp-dialog-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:8px 4px 0; }
    .cdp-kicker { color:#2563eb; font-weight:900; text-transform:uppercase; font-size:.75rem; letter-spacing:.08em; }
    .cdp-dialog-header h2 { margin:0; font-size:1.4rem; font-weight:850; }
    .cdp-dialog-header p { margin:6px 0 0; color:#64748b; line-height:1.45; }
    .cdp-tab-content { padding:16px 0 4px; }
    .cdp-kpi-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:14px; }
    .cdp-kpi-grid article, .cdp-detail-grid div, .cdp-description, .cdp-oc-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px; }
    .cdp-kpi-grid span, .cdp-detail-grid span { display:block; color:#64748b; font-size:.78rem; font-weight:800; margin-bottom:5px; }
    .cdp-detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
    .cdp-description { margin-top:14px; }
    .cdp-oc-list { display:grid; gap:12px; }
    .cdp-oc-card header { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; }
    .cdp-oc-card p { margin:0 0 6px; color:#334155; }
    .cdp-oc-card small { color:#64748b; }
    .cdp-cross-actions { margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
    .cdp-empty { color:#64748b; }
    @media (max-width:760px) { .cdp-kpi-grid, .cdp-detail-grid { grid-template-columns:1fr; } }
  `]
})
export class CdpDetailDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: { cdp: Cdp; orders: AssociatedPurchaseOrder[] },
    private readonly api: ApiService,
    private readonly dialog: MatDialog,
    private readonly snack: MatSnackBar
  ) {}

  amount(value: any): string { if (value === null || value === undefined || value === '') return '-'; const n = Number(String(value).replace(/[^0-9.-]/g, '')); return Number.isNaN(n) ? String(value) : new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(n); }
  number(value: any): string { const n = Number(value ?? 0); return Number.isNaN(n) ? '-' : new Intl.NumberFormat('es-CL', { maximumFractionDigits:2 }).format(n); }
  statusLabel(value: any): string { return String(value ?? '-').replaceAll('_', ' '); }
  itemLabel(): string { const c = this.data.cdp; return [c.budgetItemCode, c.budgetItemName].filter(Boolean).join(' · ') || '-'; }
  coverageLabel(): string { const c = this.data.cdp; const start = c.coverageStart ? new Date(c.coverageStart).toLocaleDateString('es-CL') : '-'; const end = c.coverageEnd ? new Date(c.coverageEnd).toLocaleDateString('es-CL') : '-'; return `${start} a ${end} · ${this.number(c.coverageMonths)} meses`; }
  openSolicitud(oc: AssociatedPurchaseOrder): void {
    if (!oc.purchaseRequestId) return;
    this.api.post<any>('/ceropapel/purchase-requests/show', { id: String(oc.purchaseRequestId) }).pipe(timeout(10000)).subscribe({
      next: data => this.dialog.open(CeroPapelLinkedRequestDialogComponent, { data, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'ceropapel-linked-dialog' }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar la solicitud CeroPapel.', 'Cerrar', { duration: 6000 })
    });
  }
  openMercadoPublico(oc: AssociatedPurchaseOrder): void {
    const code = String(oc.orderNumber ?? '').replace(/\s+/g, '').trim();
    if (!code) return;
    this.api.get<MercadoPublicoPurchaseOrder>(`/mercado-publico/purchase-orders/${encodeURIComponent(code)}`).subscribe({
      next: data => this.dialog.open(MercadoPublicoOrderDialogComponent, { data, width: '980px', maxWidth: '96vw', maxHeight: '92vh', panelClass: 'mp-oc-dialog' }),
      error: err => this.snack.open(err?.error?.message ?? 'No fue posible consultar Mercado Público.', 'Cerrar', { duration: 6000 })
    });
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
          @if (data.cacheHit) { <span class="mp-tag mp-cache-tag">{{ data.cacheStale ? 'Caché histórica' : 'Caché vigente' }}</span> }
        </div>

        @if (data.cacheHit) {
          <div class="mp-cache-notice" [class.warning]="data.cacheStale">
            <mat-icon>{{ data.cacheStale ? 'warning' : 'database' }}</mat-icon>
            <div>
              <strong>{{ data.cacheStale ? 'Mostrando última información disponible' : 'Información obtenida desde caché' }}</strong>
              <span>Última consulta: {{ data.cacheGeneratedAt ? (data.cacheGeneratedAt | date:'dd-MM-yyyy HH:mm') : 'No informada' }}. @if (data.cooldownSecondsRemaining && data.cooldownSecondsRemaining > 0) { Mercado Público podrá consultarse nuevamente en aproximadamente {{ data.cooldownSecondsRemaining }} segundos. }</span>
            </div>
          </div>
        }

        <div class="mp-kpi-grid">
          <div class="mp-kpi"><span>Total OC</span><strong>{{ data.totalAmount != null ? (data.totalAmount | currency:'CLP':'symbol-narrow':'1.0-0') : 'No informado' }}</strong></div>
          <div class="mp-kpi mp-kpi-highlight"><span>Nombre del comprador</span><strong>{{ buyerContactName() || 'No informado' }}</strong></div>
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
                    <dt>Comprador</dt><dd><strong>{{ buyerContactName() || 'No informado' }}</strong></dd>
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
    .mp-kpi-grid { display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:12px; margin-bottom:16px; }
    .mp-kpi, .mp-panel { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px; }
    .mp-kpi span { display:block; color:#64748b; font-size:.8rem; margin-bottom:5px; }
    .mp-kpi strong { font-size:1.05rem; overflow-wrap:anywhere; }
    .mp-kpi-highlight { background:#eff6ff; border-color:#bfdbfe; }
    .mp-kpi-highlight strong { color:#1d4ed8; }
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
    @media (max-width: 1100px) { .mp-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
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

  buyerContactName(): string {
    const direct = this.data.buyerContactName;
    if (direct && String(direct).trim()) return String(direct).trim();
    return this.findTextInRaw(['NombreContacto', 'NombreComprador', 'ContactoComprador', 'BuyerContactName']);
  }

  getItemTitle(item: Record<string, unknown>, index: number): string {
    return this.firstText(item, ['Nombre', 'Producto', 'Descripcion', 'Descripción', 'EspecificacionComprador', 'EspecificaciónComprador']) || `Ítem ${index + 1}`;
  }

  itemRows(item: Record<string, unknown>): { key: string; label: string; value: string }[] {
    const keys = new Set<string>();
    this.importantItemKeys.forEach(key => { if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') keys.add(key); });
    Object.keys(item).slice(0, 16).forEach(key => { if (!keys.has(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') keys.add(key); });
    return Array.from(keys).map(key => ({ key, label: this.humanizeKey(key), value: this.formatValue(item[key]) }));
  }

  private findTextInRaw(keys: string[]): string {
    const found = this.findTextRecursive(this.data.raw, keys, 0);
    return found ? String(found).trim() : '';
  }

  private findTextRecursive(value: unknown, keys: string[], depth: number): string {
    if (!value || depth > 6) return '';
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findTextRecursive(item, keys, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of keys) {
        const candidate = record[key];
        if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') return String(candidate);
      }
      for (const nested of Object.values(record)) {
        const found = this.findTextRecursive(nested, keys, depth + 1);
        if (found) return found;
      }
    }
    return '';
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
