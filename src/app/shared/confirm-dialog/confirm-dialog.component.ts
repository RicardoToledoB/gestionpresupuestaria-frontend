import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type ConfirmTone = 'warning' | 'danger' | 'info';

export interface ConfirmDialogData {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirm-dialog" [class.danger]="data.tone === 'danger'" [class.warning]="data.tone === 'warning'" [class.info]="data.tone === 'info'">
      <div class="confirm-icon">
        <mat-icon>{{ icon }}</mat-icon>
      </div>
      <div class="confirm-content">
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>
          <p>{{ data.message }}</p>
          @if (data.detail) {
            <div class="confirm-detail">{{ data.detail }}</div>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-stroked-button type="button" (click)="close(false)">{{ data.cancelText ?? 'Cancelar' }}</button>
          <button mat-flat-button type="button" [color]="data.tone === 'danger' ? 'warn' : 'primary'" (click)="close(true)">
            {{ data.confirmText ?? 'Confirmar' }}
          </button>
        </mat-dialog-actions>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog { display: grid; grid-template-columns: 54px 1fr; gap: 14px; padding: 22px; max-width: 560px; }
    .confirm-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #eff8ff; color: #175cd3; }
    .confirm-dialog.warning .confirm-icon { background: #fffaeb; color: #b54708; }
    .confirm-dialog.danger .confirm-icon { background: #fef3f2; color: #b42318; }
    .confirm-content h2 { margin: 0 0 6px; padding: 0; font-size: 18px; font-weight: 800; color: #101828; }
    mat-dialog-content { padding: 0 !important; color: #344054; }
    mat-dialog-content p { margin: 0 0 10px; line-height: 1.45; }
    .confirm-detail { padding: 10px 12px; border-radius: 12px; background: #f8fafc; color: #475467; font-size: 13px; border: 1px solid #e4e7ec; white-space: pre-line; }
    mat-dialog-actions { padding: 18px 0 0 !important; gap: 10px; }
    @media (max-width: 560px) { .confirm-dialog { grid-template-columns: 1fr; padding: 18px; } .confirm-icon { width: 42px; height: 42px; } mat-dialog-actions { display: grid; grid-template-columns: 1fr; } mat-dialog-actions button { width: 100%; } }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ConfirmDialogData
  ) {}

  get icon(): string {
    if (this.data.tone === 'danger') return 'warning';
    if (this.data.tone === 'warning') return 'report_problem';
    return 'info';
  }

  close(value: boolean): void {
    this.dialogRef.close(value);
  }
}
