import { ApplicationRef, ChangeDetectorRef, Injectable, NgZone } from '@angular/core';
import { MatTable } from '@angular/material/table';

/**
 * Servicio central para estabilizar el repintado de pantallas Angular Material.
 *
 * Se usa después de cargas HTTP, importaciones o cambios de tablas para evitar
 * el problema visual donde los datos existen, pero la interfaz recién se repinta
 * al redimensionar la ventana del navegador.
 */
@Injectable({ providedIn: 'root' })
export class UiRefreshService {
  constructor(
    private readonly zone: NgZone,
    private readonly appRef: ApplicationRef
  ) {}

  refresh(cdr: ChangeDetectorRef, table?: MatTable<any>): void {
    this.zone.run(() => {
      this.safeRender(cdr, table);

      queueMicrotask(() => {
        this.zone.run(() => this.safeRender(cdr, table));
      });

      setTimeout(() => {
        this.zone.run(() => this.safeRender(cdr, table));
      }, 0);

      requestAnimationFrame(() => {
        this.zone.run(() => {
          this.safeRender(cdr, table);
          window.dispatchEvent(new Event('resize'));
        });
      });
    });
  }

  refreshLayout(): void {
    this.zone.run(() => {
      this.appRef.tick();
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
  }

  private safeRender(cdr: ChangeDetectorRef, table?: MatTable<any>): void {
    try {
      table?.renderRows();
      cdr.markForCheck();
      cdr.detectChanges();
      this.appRef.tick();
    } catch {
      // El componente puede haber sido destruido durante navegación.
      // No se propaga el error porque este servicio solo fuerza repintado visual.
    }
  }
}
