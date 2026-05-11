import { CommonModule } from '@angular/common';
import { Component, ElementRef, forwardRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule],
  template: `
    <div class="ss-root" [class.ss-disabled]="disabled" [class.ss-open]="panelOpen">
      <label class="ss-label" [class.ss-required]="required">{{ label }}</label>

      <div class="ss-control" [class.ss-control-open]="panelOpen" [class.ss-control-invalid]="required && touched && !value" (click)="openPanel($event)">
        <mat-icon class="ss-prefix">search</mat-icon>
        <input
          #inputEl
          type="text"
          class="ss-input"
          [formControl]="searchCtrl"
          [placeholder]="placeholder"
          [required]="required"
          [disabled]="disabled"
          autocomplete="off"
          spellcheck="false"
          (focus)="openPanel($event)"
          (keydown.escape)="closePanel()"
          (keydown.enter)="selectFirst($event)"
          (blur)="handleBlur()"
        />

        @if (!disabled && value !== null && value !== undefined && value !== '') {
          <button mat-icon-button class="ss-clear" type="button" aria-label="Limpiar selección" (click)="clear($event)">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      @if (hint) {
        <div class="ss-hint">{{ hint }}</div>
      }

      @if (panelOpen) {
        <div class="ss-panel" (mousedown)="$event.preventDefault()" (click)="$event.stopPropagation()">
          @if (allowNull) {
            <button type="button" class="ss-option ss-option-null" (mousedown)="selectNull($event)">
              <span class="ss-option-main">{{ nullLabel }}</span>
            </button>
          }

          @for (option of filteredOptions; track trackByValue($index, option)) {
            <button type="button" class="ss-option" [class.ss-selected]="isSelected(option)" (mousedown)="selectOption(option, $event)">
              <span class="ss-option-main">{{ getLabel(option) }}</span>
              @if (getSecondary(option)) {
                <span class="ss-option-secondary">{{ getSecondary(option) }}</span>
              }
            </button>
          }

          @if (filteredOptions.length === 0) {
            <div class="ss-empty">No se encontraron coincidencias</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; position: relative; }
    :host(.ng-touched.ng-invalid) .ss-control { border-color: #d92d20; box-shadow: 0 0 0 3px rgba(217, 45, 32, .10); }
    :host(.ng-disabled) { opacity: .72; }

    .ss-root { position: relative; width: 100%; }
    .ss-root.ss-open { z-index: 2500; }

    .ss-label {
      display: block;
      margin: 0 0 6px;
      color: #344054;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .01em;
    }
    .ss-required::after { content: ' *'; color: #d92d20; }

    .ss-control {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 0 10px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #fff;
      transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .ss-control:hover { border-color: #98a2b3; }
    .ss-control-open { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, .10); }
    .ss-disabled .ss-control { background: #f2f4f7; cursor: not-allowed; }

    .ss-prefix { color: #667085; font-size: 21px; width: 21px; height: 21px; flex: 0 0 auto; }
    .ss-input {
      width: 100%;
      min-width: 0;
      height: 42px;
      border: 0;
      outline: 0;
      background: transparent;
      color: #101828;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }
    .ss-input::placeholder { color: #98a2b3; font-weight: 400; }
    .ss-clear { width: 32px !important; height: 32px !important; padding: 0 !important; flex: 0 0 auto; color: #667085; }
    .ss-clear mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .ss-hint { margin-top: 5px; color: #667085; font-size: 12px; line-height: 1.2; }

    .ss-panel {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 8px);
      max-height: 292px;
      overflow-y: auto;
      padding: 6px;
      background: #fff;
      border: 1px solid #d0d5dd;
      border-radius: 14px;
      box-shadow: 0 22px 46px rgba(16, 24, 40, .20), 0 4px 12px rgba(16, 24, 40, .08);
      z-index: 3000;
    }

    .ss-option {
      display: block;
      width: 100%;
      min-height: 46px;
      padding: 8px 10px;
      border: 0;
      border-radius: 10px;
      background: #fff;
      color: #101828;
      cursor: pointer;
      text-align: left;
    }
    .ss-option:hover,
    .ss-option:focus,
    .ss-selected { background: #eff4ff; outline: none; }
    .ss-option + .ss-option { margin-top: 2px; }
    .ss-option-main { display: block; font-size: 13px; font-weight: 750; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ss-option-secondary { display: block; margin-top: 3px; color: #667085; font-size: 11px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ss-option-null .ss-option-main { color: #667085; font-weight: 650; }
    .ss-empty { padding: 14px 12px; color: #667085; font-size: 13px; text-align: center; }

    @media (max-width: 700px) {
      .ss-control { min-height: 50px; }
      .ss-input { height: 46px; font-size: 16px; } /* evita zoom automático en iOS */
      .ss-root.ss-open { z-index: 10000; }
      .ss-panel {
        position: fixed;
        left: 12px;
        right: 12px;
        top: auto;
        bottom: 12px;
        width: auto;
        max-height: min(62vh, 440px);
        border-radius: 18px;
        box-shadow: 0 -18px 50px rgba(16, 24, 40, .28), 0 0 0 9999px rgba(16, 24, 40, .22);
        z-index: 10000;
      }
      .ss-option { min-height: 52px; padding: 10px 12px; }
      .ss-option-main { white-space: normal; font-size: 14px; }
      .ss-option-secondary { white-space: normal; font-size: 12px; }
    }
  `],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => SearchSelectComponent),
    multi: true
  }]
})
export class SearchSelectComponent implements ControlValueAccessor, OnChanges {
  @Input() label = 'Seleccione';
  @Input() placeholder = 'Escriba para buscar';
  @Input() hint = '';
  @Input() nullLabel = 'Sin selección';
  @Input() allowNull = true;
  @Input() required = false;
  @Input() options: any[] = [];
  @Input() valueKey = 'id';
  @Input() labelKey = 'label';
  @Input() secondaryKey = 'secondaryLabel';

  readonly searchCtrl = new FormControl('', { nonNullable: true });

  value: any = null;
  disabled = false;
  touched = false;
  panelOpen = false;
  filteredOptions: any[] = [];

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  private lastSelectedText = '';

  constructor(private readonly host: ElementRef<HTMLElement>) {
    this.searchCtrl.valueChanges.subscribe(text => {
      this.filter(text ?? '');
      const normalizedText = this.normalize(text ?? '');
      const normalizedSelected = this.normalize(this.lastSelectedText);

      if (!normalizedText && this.value !== null) {
        this.value = null;
        this.lastSelectedText = '';
        this.onChange(null);
      } else if (this.value !== null && normalizedText !== normalizedSelected) {
        this.value = null;
        this.onChange(null);
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.closePanel();
    }
  }

  ngOnChanges(_: SimpleChanges): void {
    this.filter(this.searchCtrl.value ?? '');
    this.syncDisplayedValue();
  }

  writeValue(value: any): void {
    this.value = value;
    this.syncDisplayedValue();
  }

  registerOnChange(fn: (value: any) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    isDisabled ? this.searchCtrl.disable({ emitEvent: false }) : this.searchCtrl.enable({ emitEvent: false });
  }

  openPanel(event?: Event): void {
    event?.stopPropagation();
    if (this.disabled) return;
    this.filter(this.searchCtrl.value ?? '');
    this.panelOpen = true;
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  selectFirst(event: Event): void {
    event.preventDefault();
    if (this.filteredOptions.length > 0) {
      this.selectOption(this.filteredOptions[0]);
    }
  }

  selectOption(option: any, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.value = this.getValue(option);
    this.lastSelectedText = this.composeDisplay(option);
    this.searchCtrl.setValue(this.lastSelectedText, { emitEvent: false });
    this.onChange(this.value);
    this.markTouched();
    this.closePanel();
  }

  selectNull(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.value = null;
    this.lastSelectedText = '';
    this.searchCtrl.setValue('', { emitEvent: false });
    this.onChange(null);
    this.markTouched();
    this.closePanel();
  }

  clear(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.value = null;
    this.lastSelectedText = '';
    this.searchCtrl.setValue('', { emitEvent: true });
    this.onChange(null);
    this.markTouched();
    this.panelOpen = true;
    setTimeout(() => this.inputEl?.nativeElement.focus());
  }

  handleBlur(): void {
    setTimeout(() => {
      this.markTouched();
      if (this.value === null || this.value === undefined || this.value === '') {
        this.searchCtrl.setValue('', { emitEvent: false });
        this.lastSelectedText = '';
        return;
      }
      this.syncDisplayedValue();
    }, 120);
  }

  trackByValue(_: number, option: any): string {
    return String(this.getValue(option));
  }

  isSelected(option: any): boolean {
    return String(this.getValue(option)) === String(this.value);
  }

  getValue(option: any): any {
    if (option === null || option === undefined) return null;
    if (typeof option !== 'object') return option;
    return option[this.valueKey];
  }

  getLabel(option: any): string {
    if (option === null || option === undefined) return '';
    if (typeof option !== 'object') return String(option);
    return String(option[this.labelKey] ?? '');
  }

  getSecondary(option: any): string {
    if (option === null || option === undefined || typeof option !== 'object') return '';
    return String(option[this.secondaryKey] ?? '');
  }

  private markTouched(): void {
    this.touched = true;
    this.onTouched();
  }

  private filter(text: string): void {
    const term = this.normalize(text);
    if (!term) {
      this.filteredOptions = [...(this.options ?? [])].slice(0, 80);
      return;
    }

    this.filteredOptions = (this.options ?? [])
      .filter(option => this.normalize(this.composeDisplay(option)).includes(term))
      .slice(0, 80);
  }

  private syncDisplayedValue(): void {
    const option = (this.options ?? []).find(o => String(this.getValue(o)) === String(this.value));
    if (option) {
      this.lastSelectedText = this.composeDisplay(option);
      this.searchCtrl.setValue(this.lastSelectedText, { emitEvent: false });
    } else if (this.value === null || this.value === undefined || this.value === '') {
      this.lastSelectedText = '';
      this.searchCtrl.setValue('', { emitEvent: false });
    } else {
      this.lastSelectedText = String(this.value);
      this.searchCtrl.setValue(this.lastSelectedText, { emitEvent: false });
    }
    this.filter(this.searchCtrl.value ?? '');
  }

  private composeDisplay(option: any): string {
    const label = this.getLabel(option);
    const secondary = this.getSecondary(option);
    return secondary ? `${label} · ${secondary}` : label;
  }

  private normalize(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
