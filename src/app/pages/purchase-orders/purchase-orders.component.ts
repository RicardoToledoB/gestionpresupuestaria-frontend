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
import { MatTable, MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { MasterOption, PageResponse, PurchaseOrder } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatSnackBarModule, MatTableModule, SearchSelectComponent],
  templateUrl: './purchase-orders.component.html'
})
export class PurchaseOrdersComponent implements OnInit {
  data: PurchaseOrder[] = [];
  columns = ['orderNumber', 'orderDate', 'programName', 'providerName', 'cdpNumber', 'sigfeFolio', 'committedAmount', 'realAmount', 'status', 'actions'];
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
  statuses = ['EMITIDA', 'ENVIADA', 'ACEPTADA', 'RECEPCIONADA', 'CANCELADA', 'CERRADA'];
  statusOptions: MasterOption[] = this.statuses.map((s, index) => ({ id: index + 1, label: s }));
  subtitleOptions: MasterOption[] = [];

  @ViewChild(MatTable) table?: MatTable<PurchaseOrder>;

  constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly snack: MatSnackBar
  ) {}

  ngOnInit(): void {
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

  buildForm(): void {
    this.form = this.fb.group({
      orderNumber: ['', Validators.required],
      orderDate: [''],
      sigfeFolio: [''],
      programId: [null, Validators.required],
      providerId: [null],
      budgetItemId: [null],
      cdpId: [null],
      committedAmount: [0],
      adjustmentAmount: [0],
      realAmount: [0],
      status: ['EMITIDA'],
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
      const loaded = r ?? [];
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
      includeDeleted: this.includeDeleted.value
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
    this.editingId = row.id;
    this.form.patchValue({
      orderNumber: row.orderNumber ?? '',
      orderDate: row.orderDate ?? '',
      sigfeFolio: row.sigfeFolio ?? '',
      programId: row.programId ?? null,
      providerId: row.providerId ?? null,
      budgetItemId: row.budgetItemId ?? null,
      cdpId: row.cdpId ?? null,
      committedAmount: row.committedAmount ?? 0,
      adjustmentAmount: row.adjustmentAmount ?? 0,
      realAmount: row.realAmount ?? 0,
      status: row.status ?? 'EMITIDA',
      observation: row.observation ?? '',
      subtitle: row.subtitle ?? '',
      active: !row.deletedAt
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  softDelete(row: PurchaseOrder): void {
    if (!confirm(`¿Confirma eliminar lógicamente la OC ${row.orderNumber}?\n\nEl CDP asociado será recalculado.`)) return;
    this.api.delete<void>(`/purchase-orders/${row.id}`).subscribe({
      next: () => { this.snack.open('OC eliminada lógicamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible eliminar la OC', 'Cerrar', { duration: 3500 }); }
    });
  }

  restore(row: PurchaseOrder): void {
    this.api.post<PurchaseOrder>(`/purchase-orders/${row.id}/restore`, {}).subscribe({
      next: () => { this.snack.open('OC recuperada y CDP recalculado', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible recuperar la OC', 'Cerrar', { duration: 3500 }); }
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
    this.form.reset({ committedAmount: 0, adjustmentAmount: 0, realAmount: 0, status: 'EMITIDA', active: true });
  }

  isDeleted(row: PurchaseOrder): boolean { return !!row.deletedAt; }

  exportCurrentWindow(): void {
    const keys = Object.keys(this.data[0] ?? {});
    const csv = [keys.join(';'), ...this.data.map((row: any) => keys.map(key => this.csvCell(row[key])).join(';'))].join('\n');
    this.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), `ordenes_compra_pagina_${this.pageIndex + 1}.csv`);
  }

  exportFiltered(): void {
    this.api.download('/purchase-orders/export', { search: this.search.value.trim(), includeDeleted: this.includeDeleted.value }).subscribe({
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
