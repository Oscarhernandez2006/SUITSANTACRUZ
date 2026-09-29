import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AuthService } from '../../services/auth.service';
import { AdminService, PresenceMonthly, PresenceRankingRow, PresenceReport, PresenceSummary } from '../../services/admin.service';

export interface Delta { text: string; dir: 'up' | 'down' | 'flat'; }

@Component({
  selector: 'app-presence-admin',
  imports: [Sidebar, DatePipe, FormsModule, NgTemplateOutlet],
  templateUrl: './presence.html',
  styleUrl: './presence.scss',
})
export class PresenceAdmin implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly canExport = this.auth.can('presence.export');
  readonly canRevoke = this.auth.can('presence.revoke');
  readonly menuOpen = signal<number | null>(null);
  readonly toast = signal('');
  readonly rankSearch = signal('');
  readonly userFilter = signal<number | null>(null);

  readonly filteredRanking = computed(() => {
    const q = this.rankSearch().trim().toLowerCase();
    const rows = this.monthly()?.ranking ?? [];
    return q ? rows.filter((u) => u.user.toLowerCase().includes(q) || (u.cedula ?? '').includes(q)) : rows;
  });

  /** Usuarios conocidos (del ranking) para el filtro del detalle diario. */
  readonly knownUsers = computed(() => (this.monthly()?.ranking ?? []).map((u) => ({ id: u.user_id, name: u.user })));

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.rank__menu')) this.menuOpen.set(null);
  }

  readonly view = signal<'mensual' | 'diario'>('mensual');

  // Vista diaria
  readonly report = signal<PresenceReport | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly from = signal(this.isoDaysAgo(6));
  readonly to = signal(this.isoDaysAgo(0));

  // Vista mensual (ranking)
  readonly monthly = signal<PresenceMonthly | null>(null);
  readonly monthLoading = signal(false);
  readonly month = signal(new Date().toISOString().slice(0, 7));

  ngOnInit(): void {
    this.loadMonthly();
  }

  setView(v: 'mensual' | 'diario'): void {
    this.view.set(v);
    if (v === 'mensual' && !this.monthly()) this.loadMonthly();
    if (v === 'diario' && !this.report()) this.load();
  }

  // ---- Mensual ----
  loadMonthly(): void {
    this.monthLoading.set(true);
    this.adminService.getPresenceMonthly(this.month()).subscribe({
      next: (m) => {
        this.monthly.set(m);
        this.monthLoading.set(false);
      },
      error: () => this.monthLoading.set(false),
    });
  }

  monthLabel(): string {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  complianceClass(pct: number): string {
    if (pct >= 90) return 'good';
    if (pct >= 70) return 'mid';
    return 'low';
  }

  /** Diferencia contra el mes anterior para una métrica del resumen. */
  delta(key: keyof PresenceSummary, kind: 'count' | 'hours' | 'pct'): Delta | null {
    const m = this.monthly();
    const prev = m?.previous_summary;
    if (!m || !prev) return null;
    const diff = Number(m.summary[key] ?? 0) - Number(prev[key] ?? 0);
    const dir = diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'flat';
    const abs = Math.abs(diff);
    const text = kind === 'hours' ? this.fmtHours(abs) : kind === 'pct' ? `${abs.toFixed(1)}%` : `${Math.round(abs)}`;
    return { text, dir };
  }

  showDaily(u: PresenceRankingRow): void {
    this.menuOpen.set(null);
    const [y, m] = this.month().split('-').map(Number);
    this.from.set(`${this.month()}-01`);
    this.to.set(new Date(y, m, 0).toLocaleDateString('en-CA'));
    this.userFilter.set(u.user_id);
    this.view.set('diario');
    this.load();
  }

  revokeConsent(u: PresenceRankingRow): void {
    this.menuOpen.set(null);
    if (!confirm(`¿Revocar el consentimiento de cámara de ${u.user}? Deberá aceptarlo de nuevo al ingresar para volver a ser monitoreado.`)) return;
    this.adminService.revokePresenceConsent(u.user_id).subscribe({
      next: () => {
        this.showToast('Consentimiento revocado');
        this.loadMonthly();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo revocar el consentimiento'),
    });
  }

  exportMonth(): void {
    const [y, m] = this.month().split('-').map(Number);
    this.download(`${this.month()}-01`, new Date(y, m, 0).toLocaleDateString('en-CA'));
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }

  initials(name: string): string {
    const parts = name.split(' ').filter((w) => w.length > 0);
    if (parts.length < 2) return parts.map((w) => w[0]).join('').substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // ---- Diaria ----
  load(): void {
    this.loading.set(true);
    this.adminService.getPresence(this.from(), this.to(), this.userFilter() ?? undefined).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  exportCsv(): void {
    this.download(this.from(), this.to());
  }

  private download(from: string, to: string): void {
    this.exporting.set(true);
    this.adminService.exportPresence(from, to).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `presencia-${from}_a_${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  fmt(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  fmtHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  pct(present: number, absent: number): number {
    const total = present + absent;
    return total === 0 ? 0 : Math.round((present / total) * 100);
  }

  private isoDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  goBack(): void {
    this.router.navigate(['/portal']);
  }
}
