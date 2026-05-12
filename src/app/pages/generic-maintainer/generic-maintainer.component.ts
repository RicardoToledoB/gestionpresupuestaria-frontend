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
import { AuthService } from '../../core/auth.service';

export interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'boolean' | 'password' | 'multiselect';
  required?: boolean;
  table?: boolean;
  tableValueKey?: string;
  optionsPath?: string;
  optionLabelKey?: string;
  optionSecondaryKey?: string;
  optionValueKey?: string;
  placeholder?: string;
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
  templateUrl: './generic-maintainer.component.html',
  styleUrls: ['./generic-maintainer.component.scss']
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

  optionsByField: Record<string, any[]> = {};
  optionSearchCtrls: Record<string, FormControl<string>> = {};

  @ViewChild(MatTable) table?: MatTable<any>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly fb: FormBuilder,
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly snack: MatSnackBar,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(data => {
      this.config = data['config'] as MaintainerConfig;
      this.tableFields = this.config.fields.filter(f => f.table !== false);
      this.refreshColumns();
      this.buildForm();
      this.loadFieldOptions();
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


  refreshColumns(): void {
    const baseColumns = [...this.tableFields.map(f => f.key), 'active'];
    if (this.canSeeDeleted()) baseColumns.push('deleted');
    if (this.canEdit() || this.canDelete() || this.canRestore()) baseColumns.push('actions');
    this.columns = baseColumns;
  }

  canCreate(): boolean { return this.auth.canWritePath(this.config?.path ?? ''); }
  canEdit(): boolean { return this.auth.canWritePath(this.config?.path ?? ''); }
  canDelete(): boolean { return this.auth.canDeletePath(this.config?.path ?? ''); }
  canRestore(): boolean { return this.auth.canRestorePath(this.config?.path ?? ''); }
  canSeeDeleted(): boolean { return this.auth.canSeeDeleted(this.config?.path ?? ''); }
  canExportFiltered(): boolean { return this.auth.canExportFiltered(this.config?.path ?? ''); }
  canExportWindow(): boolean { return this.auth.canExportFiltered(this.config?.path ?? ''); }

  buildForm(): void {
    const group: Record<string, any> = {};
    this.optionSearchCtrls = {};

    for (const field of this.config.fields) {
      const validators = field.required ? [Validators.required] : [];
      group[field.key] = field.type === 'multiselect' ? [[], validators] : ['', validators];
      if (field.type === 'multiselect') {
        this.optionSearchCtrls[field.key] = new FormControl('', { nonNullable: true });
      }
    }
    group['active'] = [true];
    this.form = this.fb.group(group);
  }

  loadFieldOptions(): void {
    this.optionsByField = {};
    const multiFields = this.config.fields.filter(f => f.type === 'multiselect' && !!f.optionsPath);
    for (const field of multiFields) {
      this.api.get<PageResponse<any>>(field.optionsPath!, { page: 0, size: 500, search: '', includeDeleted: false }).subscribe({
        next: page => {
          this.optionsByField[field.key] = page.content ?? [];
          this.uiRefresh.refresh(this.cdr, this.table);
        },
        error: err => {
          console.error('Error cargando opciones para ' + field.key, err);
          this.optionsByField[field.key] = [];
          this.snack.open(`No fue posible cargar opciones para ${field.label}`, 'Cerrar', { duration: 3500 });
        }
      });
    }
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<any>>(this.config.path, {
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
        console.error('Error cargando mantenedor', error);
        this.loading = false;
        this.snack.open('No fue posible cargar los datos', 'Cerrar', { duration: 3500 });
        this.uiRefresh.refresh(this.cdr, this.table);
      }
    });
  }

  save(): void {
    if (!this.canCreate() && !this.editingId) { this.snack.open('No tiene permisos para crear registros.', 'Cerrar', { duration: 3500 }); return; }
    if (this.editingId && !this.canEdit()) { this.snack.open('No tiene permisos para editar registros.', 'Cerrar', { duration: 3500 }); return; }
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
        this.snack.open(error?.error?.message ?? 'No fue posible guardar el registro', 'Cerrar', { duration: 5000 });
      }
    });
  }

  edit(row: any): void {
    if (!this.canEdit()) { this.snack.open('No tiene permisos para editar registros.', 'Cerrar', { duration: 3500 }); return; }
    this.editingId = row.id;
    const patch: Record<string, any> = { active: row.active ?? true };
    this.config.fields.forEach(f => {
      if (f.type === 'password') {
        patch[f.key] = '';
      } else if (f.type === 'multiselect') {
        patch[f.key] = this.resolveMultiValueForEdit(row, f);
      } else {
        patch[f.key] = row[f.key] ?? '';
      }
    });
    this.form.patchValue(patch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  softDelete(row: any): void {
    if (!this.canDelete()) { this.snack.open('No tiene permisos para eliminar registros.', 'Cerrar', { duration: 3500 }); return; }
    if (!confirm(`¿Confirma eliminar este registro?\n\nSe aplicará eliminación lógica y podrá ser recuperado posteriormente.`)) return;
    this.api.delete<void>(`${this.config.path}/${row.id}`).subscribe({
      next: () => { this.snack.open('Registro eliminado lógicamente', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible eliminar el registro', 'Cerrar', { duration: 3500 }); }
    });
  }

  restore(row: any): void {
    if (!this.canRestore()) { this.snack.open('No tiene permisos para recuperar registros.', 'Cerrar', { duration: 3500 }); return; }
    this.api.post<any>(`${this.config.path}/${row.id}/restore`, {}).subscribe({
      next: () => { this.snack.open('Registro recuperado', 'Cerrar', { duration: 2500 }); this.loadData(); },
      error: err => { console.error(err); this.snack.open('No fue posible recuperar el registro', 'Cerrar', { duration: 3500 }); }
    });
  }

  exportCurrentWindow(): void {
    if (!this.canExportWindow()) { this.snack.open('No tiene permisos para exportar.', 'Cerrar', { duration: 3500 }); return; }
    this.downloadCsv(this.data, `${this.config.exportName}_pagina_${this.pageIndex + 1}.csv`);
  }

  exportFiltered(): void {
    if (!this.canExportFiltered()) { this.snack.open('No tiene permisos para exportar.', 'Cerrar', { duration: 3500 }); return; }
    this.api.download(`${this.config.path}/export`, { search: this.search.value.trim(), includeDeleted: this.canSeeDeleted() && this.includeDeleted.value }).subscribe({
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
    this.config.fields.filter(f => f.type === 'multiselect').forEach(f => this.form.get(f.key)?.setValue([]));
  }

  isDeleted(row: any): boolean { return !!row.deletedAt; }

  getOptions(field: FieldConfig): any[] { return this.optionsByField[field.key] ?? []; }

  filteredOptions(field: FieldConfig): any[] {
    const term = (this.optionSearchCtrls[field.key]?.value ?? '').trim().toLowerCase();
    const options = this.getOptions(field);
    if (!term) return options;
    return options.filter(option => {
      const label = this.optionLabel(option, field).toLowerCase();
      const secondary = this.optionSecondary(option, field).toLowerCase();
      return label.includes(term) || secondary.includes(term);
    });
  }

  optionValue(option: any, field: FieldConfig): any { return option?.[field.optionValueKey ?? 'id']; }
  trackOption(option: any): any { return option?.id ?? option?.code ?? option?.name ?? option?.label ?? JSON.stringify(option); }
  optionLabel(option: any, field: FieldConfig): string { return String(option?.[field.optionLabelKey ?? 'name'] ?? option?.label ?? option?.name ?? ''); }
  optionSecondary(option: any, field: FieldConfig): string { return String(option?.[field.optionSecondaryKey ?? 'description'] ?? option?.secondaryLabel ?? option?.description ?? ''); }

  selectedValues(field: FieldConfig): any[] {
    const value = this.form.get(field.key)?.value;
    return Array.isArray(value) ? value : [];
  }

  isSelected(field: FieldConfig, option: any): boolean {
    return this.selectedValues(field).includes(this.optionValue(option, field));
  }

  toggleOption(field: FieldConfig, option: any, checked: boolean): void {
    const value = this.optionValue(option, field);
    const selected = [...this.selectedValues(field)];
    const index = selected.indexOf(value);
    if (checked && index < 0) selected.push(value);
    if (!checked && index >= 0) selected.splice(index, 1);
    this.form.get(field.key)?.setValue(selected);
    this.form.get(field.key)?.markAsTouched();
  }

  selectedOptions(field: FieldConfig): any[] {
    const selected = this.selectedValues(field);
    return this.getOptions(field).filter(option => selected.includes(this.optionValue(option, field)));
  }

  removeSelected(field: FieldConfig, option: any): void {
    this.toggleOption(field, option, false);
  }

  displayCell(row: any, field: FieldConfig): any {
    return row[field.tableValueKey ?? field.key];
  }

  displayChips(row: any, field: FieldConfig): string[] {
    const value = this.displayCell(row, field);
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (!value) return [];
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
  }

  private resolveMultiValueForEdit(row: any, field: FieldConfig): any[] {
    const direct = row[field.key];
    if (Array.isArray(direct)) return direct;
    const idsKey = field.key.endsWith('Ids') ? field.key : `${field.key}Ids`;
    if (Array.isArray(row[idsKey])) return row[idsKey];
    const names = this.displayChips(row, field);
    return this.getOptions(field)
      .filter(option => names.some(name => name.toLowerCase() === this.optionLabel(option, field).toLowerCase()))
      .map(option => this.optionValue(option, field));
  }

  private normalizeFormValue(value: any): any {
    const normalized = { ...value };
    this.config.fields.forEach(f => {
      if (f.type === 'number') normalized[f.key] = Number(normalized[f.key] || 0);
      if (f.type === 'multiselect') normalized[f.key] = Array.isArray(normalized[f.key]) ? normalized[f.key] : [];
    });
    normalized.active = normalized.active ?? true;
    return normalized;
  }

  private downloadCsv(rows: any[], filename: string): void {
    const headers = [...this.tableFields.map(f => f.label), 'Activo', 'Eliminado'];
    const csv = [headers.join(';'), ...rows.map(row => [...this.tableFields.map(f => this.displayCell(row, f)), row.active, !!row.deletedAt].map(value => this.csvCell(value)).join(';'))].join('\n');
    this.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
  }

  private csvCell(value: any): string {
    if (value === null || value === undefined) return '""';
    if (Array.isArray(value)) return '"' + value.join(', ').replace(/"/g, '""') + '"';
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
