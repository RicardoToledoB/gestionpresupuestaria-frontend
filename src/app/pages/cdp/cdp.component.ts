import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
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
import { Cdp, MasterOption, PageResponse } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { AuthService } from '../../core/auth.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';

@Component({
  selector: 'app-cdp',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatSnackBarModule, MatTableModule, SearchSelectComponent],
  templateUrl: './cdp.component.html'
})
export class CdpComponent implements OnInit {
  data: Cdp[] = [];
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
  cdpTypes: MasterOption[] = [];

  @ViewChild(MatTable) table?: MatTable<Cdp>;

  constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly snack: MatSnackBar,
    private readonly auth: AuthService
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
    this.columns = ['cdpNumber', 'cdpDate', 'programName', 'providerName', 'description', 'realCdpAmount', 'executedAmount', 'pendingBalance', 'executedPercent', 'alertStatus'];
    if (this.canWrite()) this.columns.push('actions');
  }

  canWrite(): boolean { return this.auth.canWritePath('/cdps'); }
  canDelete(): boolean { return this.auth.canDeletePath('/cdps'); }
  canRestore(): boolean { return this.auth.canRestorePath('/cdps'); }
  canSeeDeleted(): boolean { return this.auth.canSeeDeleted('/cdps'); }
  canExport(): boolean { return this.auth.canExportFiltered('/cdps'); }

  buildForm(): void {
    this.form = this.fb.group({
      cdpNumber: ['', Validators.required],
      cdpDate: [''],
      programId: [null, Validators.required],
      providerId: [null],
      budgetItemId: [null],
      cdpType: [''],
      tenderOrContract: [''],
      description: [''],
      coverageStart: [''],
      coverageEnd: [''],
      coverageMonths: [0],
      cdpAmount: [0],
      cdpAdjustment: [0],
      realCdpAmount: [0],
      expectedPercent: [0],
      observation: [''],
      active: [true]
    });
  }

  loadLookups(): void {
    this.api.get<MasterOption[]>('/master-data/programs').subscribe(r => this.programs = r ?? []);
    this.api.get<MasterOption[]>('/master-data/providers').subscribe(r => this.providers = r ?? []);
    this.api.get<MasterOption[]>('/master-data/budget-items').subscribe(r => this.budgetItems = r ?? []);
    this.api.get<MasterOption[]>('/master-data/cdp-types').subscribe(r => this.cdpTypes = r ?? []);
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<Cdp>>('/cdps', {
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
        console.error('Error cargando CDP', error);
        this.loading = false;
        this.snack.open('No fue posible cargar CDP', 'Cerrar', { duration: 3500 });
        this.uiRefresh.refresh(this.cdr, this.table);
      }
    });
  }

  save(): void {
    if (!this.canWrite()) { this.snack.open('No tiene permisos para crear o editar CDP.', 'Cerrar', { duration: 3500 }); return; }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const payload = this.normalize(this.form.value);
    const req = this.editingId ? this.api.put<Cdp>(`/cdps/${this.editingId}`, payload) : this.api.post<Cdp>('/cdps', payload);
    req.subscribe({
      next: () => {
        this.snack.open(this.editingId ? 'CDP actualizado y recalculado' : 'CDP creado y calculado', 'Cerrar', { duration: 2800 });
        this.cancelEdit();
        this.loadLookups();
        this.loadData();
      },
      error: err => {
        console.error(err);
        this.snack.open('No fue posible guardar el CDP. Revise número, programa y datos obligatorios.', 'Cerrar', { duration: 4500 });
      }
    });
  }

  edit(row: Cdp): void {
    if (!this.canWrite()) { this.snack.open('No tiene permisos para editar CDP.', 'Cerrar', { duration: 3500 }); return; }
    this.editingId = row.id;
    this.form.patchValue({
      cdpNumber: row.cdpNumber ?? '',
      cdpDate: row.cdpDate ?? '',
      programId: row.programId ?? null,
      providerId: row.providerId ?? null,
      budgetItemId: row.budgetItemId ?? null,
      cdpType: row.cdpType ?? '',
      tenderOrContract: row.tenderOrContract ?? '',
      description: row.description ?? '',
      coverageStart: row.coverageStart ?? '',
      coverageEnd: row.coverageEnd ?? '',
      coverageMonths: row.coverageMonths ?? 0,
      cdpAmount: row.cdpAmount ?? row.realCdpAmount ?? 0,
      cdpAdjustment: row.cdpAdjustment ?? 0,
      realCdpAmount: row.realCdpAmount ?? 0,
      expectedPercent: row.expectedPercent ?? 0,
      observation: row.observation ?? '',
      active: !row.deletedAt
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  softDelete(row: Cdp): void {
    if (!this.canDelete()) { this.snack.open('No tiene permisos para eliminar CDP.', 'Cerrar', { duration: 3500 }); return; }
    if (!confirm(`¿Confirma eliminar lógicamente el ${row.cdpNumber}?\n\nEl registro podrá ser recuperado y la ejecución será recalculada.`)) return;
    this.api.delete<void>(`/cdps/${row.id}`).subscribe({
      next: () => { this.snack.open('CDP eliminado lógicamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible eliminar el CDP', 'Cerrar', { duration: 3500 }); }
    });
  }

  restore(row: Cdp): void {
    if (!this.canRestore()) { this.snack.open('No tiene permisos para recuperar CDP.', 'Cerrar', { duration: 3500 }); return; }
    this.api.post<Cdp>(`/cdps/${row.id}/restore`, {}).subscribe({
      next: () => { this.snack.open('CDP recuperado', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible recuperar el CDP', 'Cerrar', { duration: 3500 }); }
    });
  }

  recalculateAll(): void {
    if (!this.canWrite()) { this.snack.open('No tiene permisos para recalcular CDP.', 'Cerrar', { duration: 3500 }); return; }
    this.api.post<any>('/cdps/recalculate-all', {}).subscribe({
      next: () => { this.snack.open('CDP recalculados correctamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible recalcular', 'Cerrar', { duration: 3500 }); }
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
    this.form.reset({ coverageMonths: 0, cdpAmount: 0, cdpAdjustment: 0, realCdpAmount: 0, expectedPercent: 0, active: true });
  }

  isDeleted(row: Cdp): boolean { return !!row.deletedAt; }

  statusClass(status: string): string {
    if (status === 'ALERTA' || status === 'REVISAR_REBAJA_CDP') return 'status-alert';
    if (status === 'SEGUIMIENTO') return 'status-follow';
    return 'status-ok';
  }

  exportCurrentWindow(): void {
    if (!this.canExport()) { this.snack.open('No tiene permisos para exportar CDP.', 'Cerrar', { duration: 3500 }); return; }
    const keys = Object.keys(this.data[0] ?? {});
    const csv = [keys.join(';'), ...this.data.map((row: any) => keys.map(key => this.csvCell(row[key])).join(';'))].join('\n');
    this.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), `cdp_pagina_${this.pageIndex + 1}.csv`);
  }

  exportFiltered(): void {
    if (!this.canExport()) { this.snack.open('No tiene permisos para exportar CDP.', 'Cerrar', { duration: 3500 }); return; }
    this.api.download('/cdps/export', { search: this.search.value.trim(), includeDeleted: this.canSeeDeleted() && this.includeDeleted.value }).subscribe({
      next: blob => this.saveBlob(blob, 'cdp_filtrado.csv'),
      error: err => { console.error(err); this.snack.open('No fue posible exportar CDP', 'Cerrar', { duration: 3500 }); }
    });
  }

  private normalize(value: any): any {
    const n = { ...value };
    ['programId','providerId','budgetItemId'].forEach(k => n[k] = n[k] ? Number(n[k]) : null);
    ['coverageMonths','cdpAmount','cdpAdjustment','realCdpAmount','expectedPercent'].forEach(k => n[k] = Number(n[k] || 0));
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
