import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { PageResponse } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

export interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'boolean' | 'password';
  required?: boolean;
  table?: boolean;
}

export interface MaintainerConfig {
  title: string;
  subtitle: string;
  path: string;
  exportName: string;
  searchPlaceholder: string;
  fields: FieldConfig[];
}

@Component({
  selector: 'app-generic-maintainer',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatSnackBarModule, MatTableModule],
  templateUrl: './generic-maintainer.component.html'
})
export class GenericMaintainerComponent implements OnInit {
  config!: MaintainerConfig;
  form!: FormGroup;
  data: any[] = [];
  columns: string[] = [];
  tableFields: FieldConfig[] = [];
  editingId: number | null = null;
  search = new FormControl('', { nonNullable: true });
  includeDeleted = new FormControl(false, { nonNullable: true });
  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  loading = false;

  @ViewChild(MatTable) table?: MatTable<any>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly fb: FormBuilder,
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly snack: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(data => {
      this.config = data['config'] as MaintainerConfig;
      this.tableFields = this.config.fields.filter(f => f.table !== false);
      this.columns = [...this.tableFields.map(f => f.key), 'active', 'deleted', 'actions'];
      this.buildForm();
      this.pageIndex = 0;
      this.loadData();
    });

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
    const group: Record<string, any> = {};
    for (const field of this.config.fields) {
      const validators = field.required ? [Validators.required] : [];
      group[field.key] = ['', validators];
    }
    group['active'] = [true];
    this.form = this.fb.group(group);
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<any>>(this.config.path, {
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
        console.error('Error cargando mantenedor', error);
        this.loading = false;
        this.snack.open('No fue posible cargar los datos', 'Cerrar', { duration: 3500 });
        this.uiRefresh.refresh(this.cdr, this.table);
      }
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.normalizeFormValue(this.form.value);
    const request = this.editingId
      ? this.api.put<any>(`${this.config.path}/${this.editingId}`, value)
      : this.api.post<any>(this.config.path, value);

    request.subscribe({
      next: () => {
        this.snack.open(this.editingId ? 'Registro actualizado' : 'Registro creado', 'Cerrar', { duration: 2500 });
        this.cancelEdit();
        this.loadData();
      },
      error: error => {
        console.error('Error guardando registro', error);
        this.snack.open('No fue posible guardar el registro', 'Cerrar', { duration: 4000 });
      }
    });
  }

  edit(row: any): void {
    this.editingId = row.id;
    const patch: Record<string, any> = { active: row.active ?? true };
    this.config.fields.forEach(f => patch[f.key] = row[f.key] ?? '');
    this.form.patchValue(patch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  softDelete(row: any): void {
    if (!confirm(`¿Confirma eliminar este registro?\n\nSe aplicará eliminación lógica y podrá ser recuperado posteriormente.`)) return;
    this.api.delete<void>(`${this.config.path}/${row.id}`).subscribe({
      next: () => { this.snack.open('Registro eliminado lógicamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible eliminar el registro', 'Cerrar', { duration: 3500 }); }
    });
  }

  restore(row: any): void {
    this.api.post<any>(`${this.config.path}/${row.id}/restore`, {}).subscribe({
      next: () => { this.snack.open('Registro recuperado', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible recuperar el registro', 'Cerrar', { duration: 3500 }); }
    });
  }

  exportCurrentWindow(): void {
    this.downloadCsv(this.data, `${this.config.exportName}_pagina_${this.pageIndex + 1}.csv`);
  }

  exportFiltered(): void {
    this.api.download(`${this.config.path}/export`, { search: this.search.value.trim(), includeDeleted: this.includeDeleted.value }).subscribe({
      next: blob => this.saveBlob(blob, `${this.config.exportName}.csv`),
      error: err => { console.error(err); this.snack.open('No fue posible exportar', 'Cerrar', { duration: 3500 }); }
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
    this.form.reset({ active: true });
  }

  isDeleted(row: any): boolean { return !!row.deletedAt; }

  private normalizeFormValue(value: any): any {
    const normalized = { ...value };
    this.config.fields.forEach(f => {
      if (f.type === 'number') normalized[f.key] = Number(normalized[f.key] || 0);
    });
    normalized.active = normalized.active ?? true;
    return normalized;
  }

  private downloadCsv(rows: any[], filename: string): void {
    const headers = [...this.tableFields.map(f => f.label), 'Activo', 'Eliminado'];
    const keys = [...this.tableFields.map(f => f.key), 'active', 'deletedAt'];
    const csv = [headers.join(';'), ...rows.map(row => keys.map(key => this.csvCell(key === 'deletedAt' ? !!row.deletedAt : row[key])).join(';'))].join('\n');
    this.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
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
