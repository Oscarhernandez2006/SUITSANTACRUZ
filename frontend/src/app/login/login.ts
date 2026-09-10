import { Component, ElementRef, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { FaceService } from '../services/face.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit, OnDestroy {
  cedula = '';
  password = '';
  showPassword = signal(false);
  errorMessage = signal('');
  loading = signal(false);
  shakeError = signal(false);

  // --- Segundo factor facial ---
  faceStep = signal(false);
  faceUserName = signal('');
  faceMessage = signal('');
  faceError = signal('');
  faceBusy = signal(false);
  faceModelsLoading = signal(false);
  private challenge = '';
  private stream: MediaStream | null = null;
  readonly faceVideo = viewChild<ElementRef<HTMLVideoElement>>('faceVideo');

  activeSlide = signal(0);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // --- Recuperación de contraseña (paso "olvidé mi contraseña") ---
  forgotStep = signal(false);
  forgotEmail = '';
  forgotBusy = signal(false);
  forgotError = signal('');
  forgotSent = signal(false);

  readonly slides = [

    {
      type: 'tagline' as const,
    },
    {
      type: 'features' as const,
      title: 'Siesa Cloud',
      subtitle: 'ERP en la Nube',
      logo: 'logo-siesa.png',
      icon: 'cloud_sync',
      features: [
        { name: 'Contabilidad', icon: 'account_balance' },
        { name: 'Inventario', icon: 'inventory_2' },
        { name: 'Facturaci\u00f3n', icon: 'receipt_long' },
        { name: 'Inicio de sesi\u00f3n autom\u00e1tico', icon: 'lock_open' },
      ],
    },
    {
      type: 'features' as const,
      title: 'SIGCOM',
      subtitle: 'Gesti\u00f3n Comercial y Toma de Pedidos',
      logo: 'logo-sigcom.png',
      icon: 'shopping_cart',
      features: [
        { name: 'Pedidos', icon: 'shopping_cart' },
        { name: 'Clientes', icon: 'groups' },
        { name: 'Precios y listas', icon: 'sell' },
        { name: 'Integraci\u00f3n Siesa', icon: 'sync_alt' },
      ],
    },
    {
      type: 'features' as const,
      title: 'SIGCOMPRO',
      subtitle: 'Operaciones, Despacho y Cuadre',
      logo: 'logo-sigcompro.png',
      icon: 'inventory',
      features: [
        { name: 'Pedidos', icon: 'receipt_long' },
        { name: 'Despacho', icon: 'local_shipping' },
        { name: 'Clientes', icon: 'groups' },
        { name: 'Cuadre de caja', icon: 'point_of_sale' },
      ],
    },
    {
      type: 'features' as const,
      title: 'Incapacidades',
      subtitle: 'Gesti\u00f3n de Incapacidades M\u00e9dicas',
      logo: null,
      icon: 'medical_information',
      features: [
        { name: 'Registro de incapacidades', icon: 'assignment' },
        { name: 'Seguimiento', icon: 'monitoring' },
        { name: 'Personal', icon: 'groups' },
        { name: 'Reportes', icon: 'summarize' },
      ],
    },
    {
      type: 'features' as const,
      title: 'Ejecutables',
      subtitle: 'Procesador de Integraciones Siesa',
      logo: 'logo-ejecutables.svg',
      icon: 'factory',
      features: [
        { name: 'Pedidos', icon: 'shopping_cart' },
        { name: 'Requisiciones', icon: 'swap_horiz' },
        { name: 'Sobrecostos', icon: 'price_change' },
        { name: 'Carga de archivos Excel', icon: 'upload_file' },
      ],
    },
  ];

  constructor(private router: Router, private authService: AuthService, private faceService: FaceService) {}

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      this.activeSlide.update((i) => (i + 1) % this.slides.length);
    }, 8000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.stopFaceCamera();
  }

  goToSlide(index: number): void {
    this.activeSlide.set(index);
  }

  onLogin(): void {
    if (!this.cedula || !this.password) {
      this.errorMessage.set('Ingresa tu c\u00e9dula y contrase\u00f1a');
      this.triggerShake();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.cedula, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        // El backend exige verificación facial: pasamos al segundo paso.
        if (res.face_required && res.challenge) {
          this.challenge = res.challenge;
          this.faceUserName.set(res.user_name ?? '');
          this.startFaceStep();
          return;
        }
        this.router.navigate(['/portal']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Error al iniciar sesi\u00f3n');
        this.triggerShake();
      },
    });
  }

  /** Muestra el paso facial, carga los modelos y enciende la cámara. */
  private async startFaceStep(): Promise<void> {
    this.faceStep.set(true);
    this.faceError.set('');
    this.faceMessage.set('Preparando la c\u00e1mara...');
    this.faceModelsLoading.set(true);
    try {
      await this.faceService.loadModels();
      // Espera a que el <video> del paso facial esté en el DOM.
      await new Promise((r) => setTimeout(r, 0));
      const video = this.faceVideo()?.nativeElement;
      if (!video) throw new Error('No se encontr\u00f3 la c\u00e1mara');
      this.stream = await this.faceService.startCamera(video);
      this.faceModelsLoading.set(false);
      this.faceMessage.set('Cent\u00e9ra tu rostro y presiona Verificar.');
    } catch {
      this.faceModelsLoading.set(false);
      this.faceError.set('No se pudo acceder a la c\u00e1mara o a los modelos. Verifica permisos o contacta al administrador.');
    }
  }

  /** Captura el rostro en vivo y lo envía al backend para verificar. */
  async verifyFace(): Promise<void> {
    const video = this.faceVideo()?.nativeElement;
    if (!video || this.faceBusy()) return;

    this.faceBusy.set(true);
    this.faceError.set('');
    this.faceMessage.set('Analizando rostro...');

    try {
      const descriptor = await this.faceService.detectDescriptor(video);
      if (!descriptor) {
        this.faceBusy.set(false);
        this.faceMessage.set('');
        this.faceError.set('No detectamos un rostro claro. Ac\u00e9rcate y aseg\u00farate de tener buena luz.');
        return;
      }

      this.authService.loginFace(this.challenge, this.faceService.toArray(descriptor)).subscribe({
        next: () => {
          this.faceBusy.set(false);
          this.stopFaceCamera();
          this.router.navigate(['/portal']);
        },
        error: (err) => {
          this.faceBusy.set(false);
          this.faceMessage.set('');
          this.faceError.set(err.error?.message || 'No pudimos verificar tu rostro. Intenta de nuevo.');
        },
      });
    } catch {
      this.faceBusy.set(false);
      this.faceMessage.set('');
      this.faceError.set('Ocurri\u00f3 un error al analizar el rostro. Intenta de nuevo.');
    }
  }

  /** Cancela el paso facial y vuelve al formulario de credenciales. */
  cancelFace(): void {
    this.stopFaceCamera();
    this.faceStep.set(false);
    this.challenge = '';
    this.faceError.set('');
    this.faceMessage.set('');
  }

  private stopFaceCamera(): void {
    this.faceService.stopCamera(this.faceVideo()?.nativeElement ?? null, this.stream);
    this.stream = null;
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  private triggerShake(): void {
    this.shakeError.set(true);
    setTimeout(() => this.shakeError.set(false), 500);
  }

  onlyNumbers(event: KeyboardEvent): void {
    if (!/[0-9]/.test(event.key)) {
      event.preventDefault();
    }
  }

  /** Abre el panel de recuperación de contraseña. */
  openForgot(event?: Event): void {
    event?.preventDefault();
    this.forgotStep.set(true);
    this.forgotError.set('');
    this.forgotSent.set(false);
  }

  /** Cierra el panel de recuperación de contraseña. */
  closeForgot(): void {
    if (this.forgotBusy()) return;
    this.forgotStep.set(false);
    this.forgotError.set('');
    this.forgotSent.set(false);
  }

  /** Envía la solicitud de enlace de recuperación al backend. */
  submitForgot(): void {
    const email = (this.forgotEmail || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.forgotError.set('Ingresa un correo v\u00e1lido.');
      return;
    }

    this.forgotBusy.set(true);
    this.forgotError.set('');

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.forgotBusy.set(false);
        this.forgotSent.set(true);
      },
      error: (err) => {
        this.forgotBusy.set(false);
        this.forgotError.set(err.error?.message || 'No pudimos procesar la solicitud. Intenta de nuevo.');
      },
    });
  }
}
