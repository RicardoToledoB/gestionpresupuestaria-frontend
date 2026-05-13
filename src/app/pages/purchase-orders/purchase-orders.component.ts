import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTable, MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { MasterOption, PageResponse, PurchaseOrder } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { AuthService } from '../../core/auth.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatSnackBarModule, MatTableModule, MatTooltipModule, SearchSelectComponent],
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
    private readonly confirmation: ConfirmationService
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
      orderDate: [''],
      sigfeFolio: [''],
      purchaseRequestId: [''],
      productServiceReceptionDate: [''],
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
      orderDate: row.orderDate ?? '',
      sigfeFolio: row.sigfeFolio ?? '',
      purchaseRequestId: row.purchaseRequestId ?? '',
      productServiceReceptionDate: row.productServiceReceptionDate ?? '',
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
    this.form.reset({ purchaseRequestId: '', productServiceReceptionDate: '', committedAmount: 0, adjustmentAmount: 0, realAmount: 0, status: 'SIN_ESTADO', active: true });
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
    return n;
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
