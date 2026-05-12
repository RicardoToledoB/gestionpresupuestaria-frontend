import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ApiService } from '../../core/api.service';
import { ImportResult, ImportValidation } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-imports',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, JsonPipe, MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './imports.component.html',
  styleUrl: './imports.component.scss'
})
export class ImportsComponent implements OnInit {
  selectedFile?: File;
  loading = false;
  result?: ImportResult;
  validation?: ImportValidation;
  message = '';

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadValidation();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0];
    this.message = '';
    this.uiRefresh.refresh(this.cdr);
  }

  canImport(): boolean { return this.auth.canImport(); }
  canClearDatabase(): boolean { return this.auth.canClearDatabase(); }

  upload(): void {
    if (!this.canImport()) { this.message = 'No tiene permisos para importar archivos Excel.'; return; }
    if (!this.selectedFile) return;
    this.loading = true;
    this.result = undefined;
    this.message = '';
    this.uiRefresh.refresh(this.cdr);

    this.api.upload<ImportResult>('/imports/excel', this.selectedFile).subscribe({
      next: result => {
        this.result = { ...result };
        this.loading = false;
        this.message = 'Importación finalizada. Revise validación, Dashboard, CDP y Órdenes de compra.';
        this.loadValidation();
        this.uiRefresh.refresh(this.cdr);
      },
      error: error => {
        console.error('Error importando archivo Excel', error);
        this.loading = false;
        this.message = this.buildErrorMessage(error);
        this.uiRefresh.refresh(this.cdr);
      }
    });
  }

  loadValidation(): void {
    this.api.get<ImportValidation>('/imports/validation').subscribe({
      next: v => { this.validation = v; this.uiRefresh.refresh(this.cdr); },
      error: err => { console.error('Error cargando validación', err); }
    });
  }

  clearDatabase(): void {
    if (!this.canClearDatabase()) { this.message = 'Solo el perfil ADMIN puede limpiar la base H2.'; return; }
    const confirmed = confirm('Esta acción limpiará todos los datos cargados en H2. ¿Desea continuar?');
    if (!confirmed) return;

    this.loading = true;
    this.message = '';
    this.api.delete<{ status: string; message: string }>('/imports/database').subscribe({
      next: response => {
        this.result = undefined;
        this.selectedFile = undefined;
        this.validation = undefined;
        this.loading = false;
        this.message = response.message ?? 'Base H2 limpiada correctamente.';
        this.loadValidation();
        this.uiRefresh.refresh(this.cdr);
      },
      error: error => {
        console.error('Error limpiando base H2', error);
        this.loading = false;
        this.message = 'No fue posible limpiar la base H2.';
        this.uiRefresh.refresh(this.cdr);
      }
    });
  }
  private buildErrorMessage(error: any): string {
    const backendMessage = error?.error?.message || error?.message;
    const status = error?.status;

    if (status === 0) {
      return 'No fue posible completar la importación: el navegador no pudo conectar con el backend. Revise CORS, URL del backend o disponibilidad del servicio Railway.';
    }
    if (status === 413) {
      return 'No fue posible completar la importación: el archivo supera el tamaño máximo permitido.';
    }
    if (status === 403) {
      return 'No fue posible completar la importación: solicitud bloqueada por seguridad/CORS.';
    }
    if (status === 404) {
      return 'No fue posible completar la importación: endpoint no encontrado. Revise la URL base del frontend.';
    }

    return `No fue posible completar la importación${status ? ' [' + status + ']' : ''}: ${backendMessage ?? 'revise los logs del backend en Railway.'}`;
  }

}
