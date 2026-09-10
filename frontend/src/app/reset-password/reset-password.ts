import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  private email = '';
  private token = '';

  password = '';
  confirm = '';
  showPassword = signal(false);
  loading = signal(false);
  errorMessage = signal('');
  done = signal(false);
  invalidLink = signal(false);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.email = this.route.snapshot.queryParamMap.get('email') ?? '';
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.email || !this.token) {
      this.invalidLink.set(true);
    }
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  onSubmit(): void {
    this.errorMessage.set('');

    if (this.password.length < 6) {
      this.errorMessage.set('La contrase\u00f1a debe tener al menos 6 caracteres.');
      return;
    }
    if (this.password !== this.confirm) {
      this.errorMessage.set('Las contrase\u00f1as no coinciden.');
      return;
    }

    this.loading.set(true);
    this.authService.resetPassword(this.email, this.token, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'No pudimos restablecer tu contrase\u00f1a. Solicita un enlace nuevo.');
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
