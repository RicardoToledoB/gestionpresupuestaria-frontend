import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
  form: ReturnType<FormBuilder['group']>;

  constructor(private readonly fb: FormBuilder, private readonly auth: AuthService, private readonly router: Router) {
    this.form = this.fb.group({
      username: ['admin', [Validators.required]],
      password: ['admin123', [Validators.required]]
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { username, password } = this.form.getRawValue();
    this.auth.login(username!, password!).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: err => {
        this.loading = false;
        this.error = err?.error?.message ?? 'No fue posible iniciar sesión.';
      }
    });
  }
}
