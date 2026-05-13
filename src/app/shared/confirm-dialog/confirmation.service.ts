import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  constructor(private readonly dialog: MatDialog) {}

  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog.open(ConfirmDialogComponent, {
      width: 'min(560px, calc(100vw - 28px))',
      maxWidth: 'calc(100vw - 28px)',
      autoFocus: false,
      restoreFocus: true,
      data: {
        cancelText: 'Cancelar',
        confirmText: 'Confirmar',
        tone: 'warning',
        ...data
      }
    }).afterClosed().pipe(map(Boolean));
  }
}
