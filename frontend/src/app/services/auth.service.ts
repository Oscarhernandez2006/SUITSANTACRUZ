import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { SiesaStatus } from './siesa.service';

export interface AuthUser {
  id: number;
  name: string;
  cedula: string;
  email: string;
  is_admin?: boolean;
}

interface LoginRequest {
  cedula: string;
  password: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface LoginResponse {
  message: string;
  token?: string;
  user?: AuthUser;
  siesa?: SiesaStatus;
  // Segundo factor facial: cuando el backend lo exige, no envía token.
  face_required?: boolean;
  challenge?: string;
  user_name?: string;
  face_status?: string;
}

interface MeResponse extends AuthUser {
  siesa?: SiesaStatus;
}

export interface LoginHistoryEntry {
  id: number;
  status: string;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  ip_address: string | null;
  at: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'sc_tools_token';
  private readonly USER_KEY = 'sc_tools_user';
  private readonly SIESA_KEY = 'sc_tools_siesa';

  currentUser = signal<AuthUser | null>(this.getStoredUser());
  isAuthenticated = signal<boolean>(this.hasToken());
  // Estado de credenciales Siesa: se hidrata en el login para no pedirlo aparte.
  siesaStatus = signal<SiesaStatus | null>(this.getStoredSiesa());

  constructor(private http: HttpClient, private router: Router) {}

  login(cedula: string, password: string): Observable<LoginResponse> {
    return new Observable<LoginResponse>((observer) => {
      this.getGeolocation().then((coords) => {
        const body: LoginRequest = {
          cedula,
          password,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        };

        this.http.post<LoginResponse>('/api/auth/login', body).subscribe({
          next: (res) => {
            // Solo se persiste la sesión cuando el backend devuelve token.
            // Si exige verificación facial, el token llega en el 2º paso.
            if (res.token && res.user) {
              this.persistSession(res.token, res.user, res.siesa ?? null);
            }
            observer.next(res);
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
      });
    });
  }

  /**
   * Segundo paso del login: envía el descriptor facial capturado en vivo junto
   * con el reto emitido en el primer paso. Si el rostro coincide, persiste la
   * sesión.
   */
  loginFace(challenge: string, descriptor: number[]): Observable<LoginResponse> {
    return new Observable<LoginResponse>((observer) => {
      this.getGeolocation().then((coords) => {
        const body = {
          challenge,
          descriptor,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        };

        this.http.post<LoginResponse>('/api/auth/login/face', body).subscribe({
          next: (res) => {
            if (res.token && res.user) {
              this.persistSession(res.token, res.user, res.siesa ?? null);
            }
            observer.next(res);
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
      });
    });
  }

  /** Persiste token + usuario + estado Siesa en memoria y localStorage. */
  private persistSession(token: string, user: AuthUser, siesa: SiesaStatus | null): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    this.setSiesaStatus(siesa);
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({
      complete: () => this.clearSession(),
      error: () => this.clearSession(),
    });
  }

  getMe(): Observable<MeResponse> {
    return this.http.get<MeResponse>('/api/auth/me');
  }

  /** Cambia la contraseña del usuario autenticado. */
  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>('/api/auth/password', {
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: newPassword,
    });
  }

  /** Paso 1 de la recuperación: solicita el enlace de restablecimiento por correo. */
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { email });
  }

  /** Paso 2 de la recuperación: establece la nueva contraseña con el token del correo. */
  resetPassword(email: string, token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/reset-password', {
      email,
      token,
      password: newPassword,
      password_confirmation: newPassword,
    });
  }

  /** Historial de accesos del propio usuario. */
  getMyLogins(limit = 50): Observable<LoginHistoryEntry[]> {
    return this.http.get<LoginHistoryEntry[]>('/api/auth/my-logins', { params: { limit } as never });
  }

  /** Refresca los datos del usuario (incluido is_admin) desde el backend. */
  refreshUser(): void {
    this.getMe().subscribe({
      next: (user) => {
        const { siesa, ...profile } = user;
        localStorage.setItem(this.USER_KEY, JSON.stringify(profile));
        this.currentUser.set(profile);
        if (siesa) this.setSiesaStatus(siesa);
      },
      error: () => {},
    });
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  private getStoredUser(): AuthUser | null {
    const data = localStorage.getItem(this.USER_KEY);
    return data ? JSON.parse(data) : null;
  }

  private getStoredSiesa(): SiesaStatus | null {
    const data = localStorage.getItem(this.SIESA_KEY);
    return data ? JSON.parse(data) : null;
  }

  /** Actualiza el estado de Siesa en memoria y en localStorage. */
  setSiesaStatus(status: SiesaStatus | null): void {
    this.siesaStatus.set(status);
    if (status) {
      localStorage.setItem(this.SIESA_KEY, JSON.stringify(status));
    } else {
      localStorage.removeItem(this.SIESA_KEY);
    }
  }

  private clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.SIESA_KEY);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.siesaStatus.set(null);
    this.router.navigate(['/login']);
  }

  private getGeolocation(): Promise<GeolocationCoordinates | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  }
}
