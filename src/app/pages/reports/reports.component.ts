import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './reports.component.html'
})
export class ReportsComponent {
  constructor(private readonly api: ApiService) {}

  downloadExcel(): void { this.download('/reports/executive.xlsx', 'reporte_ejecutivo_presupuestario.xlsx'); }
  downloadPdf(): void { this.download('/reports/executive.pdf', 'reporte_ejecutivo_presupuestario.pdf'); }

  private download(path: string, filename: string): void {
    this.api.download(path).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });
  }
}
