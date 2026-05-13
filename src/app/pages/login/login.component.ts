import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  loading = false;
  error = '';
  info = '';
  private readonly returnUrl: string;
  form: ReturnType<FormBuilder['group']>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {
    this.form = this.fb.group({
      username: ['admin', [Validators.required]],
      password: ['admin123', [Validators.required]]
    });
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
    const sessionMessage = this.auth.consumeSessionMessage();
    if (sessionMessage) this.info = sessionMessage;
    else if (this.route.snapshot.queryParamMap.has('expired')) this.info = 'Su sesión expiró. Ingrese nuevamente.';
  }

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    this.info = '';
    const { username, password } = this.form.getRawValue();
    this.auth.login(username!, password!).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: err => {
        this.loading = false;
        this.error = err?.error?.message ?? 'No fue posible iniciar sesión.';
      }
    });
  }
}
