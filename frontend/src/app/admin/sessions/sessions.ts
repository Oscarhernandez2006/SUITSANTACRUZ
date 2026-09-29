import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { browserLogo } from '../../shared/browser-logo';
import { AuthService } from '../../services/auth.service';
import { PresenceService } from '../../services/presence.service';
import { AdminService, SessionEntry } from '../../services/admin.service';

type StatusFilter = 'all' | 'active' | 'camera' | 'idle';
type SortKey = 'activity' | 'login' | 'name';

const ACTIVE_MS = 15 * 60 * 1000;
// El heartbeat de presencia se envía cada 30 s; 2 min tolera un par de envíos perdidos.
const CAMERA_MS = 2 * 60 * 1000;
const REFRESH_MS = 30_000;

@Component({
  selector: 'app-sessions',
  imports: [Sidebar, DatePipe, FormsModule],
  templateUrl: './sessions.html',
  styleUrl: './sessions.scss',
})
export class Sessions implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
  private auth = inject(AuthService);
  private presenceLive = inject(PresenceService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  readonly canRevoke = this.auth.can('sessions.revoke');

  readonly sessions = signal<SessionEntry[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly revoking = signal<number | null>(null);
  readonly updatedAt = signal<Date | null>(null);
  readonly now = signal(Date.now());
  readonly toast = signal('');

  readonly search = signal('');
  readonly status = signal<StatusFilter>('all');
  readonly sort = signal<SortKey>('activity');
  readonly brokenLogos = signal<Set<string>>(new Set());

  readonly activeCount = computed(() => this.sessions().filter((s) => this.isActive(s)).length);
  readonly cameraCount = computed(() => this.sessions().filter((s) => this.onCamera(s)).length);
  readonly idleCount = computed(() => this.sessions().length - this.activeCount());
  readonly usersCount = computed(() => new Set(this.sessions().map((s) => s.user_id)).size);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const st = this.status();
    const rows = this.sessions().filter((s) => {
      if (q && !(s.user ?? '').toLowerCase().includes(q) && !(s.role ?? '').toLowerCase().includes(q)) return false;
      if (st === 'active') return this.isActive(s);
      if (st === 'idle') return !this.isActive(s);
      if (st === 'camera') return this.onCamera(s);
      return true;
    });
    const time = (v: string | null) => (v ? new Date(v).getTime() : 0);
    const sort = this.sort();
    return [...rows].sort((a, b) => {
      if (sort === 'name') return (a.user ?? '').localeCompare(b.user ?? '');
      if (sort === 'login') return time(b.created_at) - time(a.created_at);
      return time(b.last_used_at) - time(a.last_used_at);
    });
  });

  ngOnInit(): void {
    this.load();
    this.timer = setInterval(() => this.load(true), REFRESH_MS);
    this.clock = setInterval(() => this.now.set(Date.now()), 10_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.clock) clearInterval(this.clock);
  }

  load(silent = false): void {
    if (silent) this.refreshing.set(true);
    else this.loading.set(true);
    this.adminService.getSessions().subscribe({
      next: (s) => {
        this.sessions.set(s);
        this.loading.set(false);
        this.refreshing.set(false);
        this.updatedAt.set(new Date());
        this.now.set(Date.now());
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  isActive(s: SessionEntry): boolean {
    return !!s.last_used_at && this.now() - new Date(s.last_used_at).getTime() < ACTIVE_MS;
  }

  /** En cámara = la cámara detectó el rostro recientemente (en vivo para la sesión propia). */
  onCamera(s: SessionEntry): boolean {
    if (s.is_current && this.presenceLive.cameraOn()) return this.presenceLive.faceDetected();
    return !!s.last_present_at && this.now() - new Date(s.last_present_at).getTime() < CAMERA_MS;
  }

  logo(s: SessionEntry): string | null {
    const url = browserLogo(s.browser);
    return url && !this.brokenLogos().has(url) ? url : null;
  }

  onLogoError(url: string): void {
    this.brokenLogos.update((set) => new Set(set).add(url));
  }

  ago(value: string | Date | null): string {
    if (!value) return 'Sin actividad';
    const diff = Math.max(0, this.now() - new Date(value).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `Hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Hace ${h} h`;
    return `Hace ${Math.floor(h / 24)} d`;
  }

  deviceIcon(s: SessionEntry): string {
    const t = (s.device_type ?? '').toLowerCase();
    if (t.includes('mobile') || t.includes('phone')) return 'smartphone';
    if (t.includes('tablet')) return 'tablet';
    return 'computer';
  }

  initials(name: string | null): string {
    const parts = (name ?? '').split(' ').filter((w) => w.length > 0);
    if (parts.length === 0) return '?';
    if (parts.length < 3) return parts.map((w) => w[0]).join('').substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[2][0]).toUpperCase();
  }

  revoke(session: SessionEntry): void {
    if (this.revoking()) return;
    if (!confirm(`¿Revocar la sesión de ${session.user}? El usuario deberá iniciar sesión de nuevo.`)) return;
    this.revoking.set(session.id);
    this.adminService.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.set(this.sessions().filter((s) => s.id !== session.id));
        this.revoking.set(null);
        this.showToast('Sesión revocada');
      },
      error: (err) => {
        this.revoking.set(null);
        this.showToast(err?.error?.message || 'No se pudo revocar la sesión');
      },
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
