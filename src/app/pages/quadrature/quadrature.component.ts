import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTable, MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { FormalQuadrature } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

@Component({
  selector: 'app-quadrature',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatCardModule, MatIconModule, MatTableModule],
  templateUrl: './quadrature.component.html'
})
export class QuadratureComponent implements OnInit {
  data?: FormalQuadrature;
  columns = ['indicator', 'excelValue', 'systemValue', 'difference', 'status'];
  @ViewChild(MatTable) table?: MatTable<any>;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef, private readonly ui: UiRefreshService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.get<FormalQuadrature>('/quadrature/formal').subscribe({
      next: data => { this.data = data; this.ui.refresh(this.cdr, this.table); },
      error: err => console.error('Error cargando cuadratura formal', err)
    });
  }
}
