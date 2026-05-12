import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTable, MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { PageResponse, Provider } from '../../core/models';
import { UiRefreshService } from '../../core/ui-refresh.service';

@Component({
  selector: 'app-providers',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatTableModule],
  templateUrl: './providers.component.html'
})
export class ProvidersComponent implements OnInit {
  data: Provider[] = [];
  columns = ['rut', 'businessName', 'email', 'phone', 'active'];
  search = new FormControl('', { nonNullable: true });
  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  loading = false;

  @ViewChild(MatTable) table?: MatTable<Provider>;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly uiRefresh: UiRefreshService
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.pageIndex = 0;
      this.loadData();
    });
  }

  loadData(): void {
    this.loading = true;
    this.api.get<PageResponse<Provider>>('/providers', {
      page: this.pageIndex,
      size: this.pageSize,
      search: this.search.value.trim()
    }).subscribe({
      next: page => {
        this.data = [...(page.content ?? [])];
        this.totalElements = page.totalElements ?? 0;
        this.loading = false;
        this.uiRefresh.refresh(this.cdr, this.table);
      },
      error: error => {
        console.error('Error cargando proveedores', error);
        this.loading = false;
        this.uiRefresh.refresh(this.cdr, this.table);
      }
    });
  }

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  clearSearch(): void {
    this.search.setValue('');
  }
}
