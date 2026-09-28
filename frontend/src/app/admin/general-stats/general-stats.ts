import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AdminService, CrossApp, CrossMetric, PresenceReport } from '../../services/admin.service';
import { DashboardStats, StatsService } from '../../services/stats.service';

const REFRESH_MS = 60_000;

/** Estadísticas generales: indicadores del día de todas las apps conectadas. */
@Component({
  selector: 'app-general-stats',
  imports: [Sidebar, DatePipe, RouterLink],
  templateUrl: './general-stats.html',
  styleUrl: './general-stats.scss',
})
export class GeneralStats implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private statsService = inject(StatsService);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly apps = signal<CrossApp[]>([]);
  readonly generatedAt = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly suite = signal<DashboardStats | null>(null);
  readonly presence = signal<PresenceReport | null>(null);

  readonly skeletons = [1, 2, 3, 4, 5, 6];

  readonly connectedCount = computed(() => this.apps().filter((a) => a.status === 'ok').length);

  readonly onlineNow = computed(() => {
    const r = this.presence();
    if (!r) return 0;
    const limit = Date.now() - 5 * 60 * 1000;
    return new Set(
      r.rows.filter((row) => row.last_seen_at && new Date(row.last_seen_at).getTime() > limit).map((row) => row.user_id),
    ).size;
  });

  readonly withRecordToday = computed(() => this.presence()?.by_user?.length ?? 0);

  ngOnInit(): void {
    this.load();
    this.timer = setInterval(() => this.load(true), REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.error.set(false);
    this.admin.getCrossOverview().subscribe({
      next: (res) => {
        this.apps.set(res.apps);
        this.generatedAt.set(res.generated_at);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.statsService.getStats().subscribe({ next: (s) => this.suite.set(s), error: () => {} });
    const today = new Date().toLocaleDateString('en-CA');
    this.admin.getPresence(today, today).subscribe({ next: (r) => this.presence.set(r), error: () => {} });
  }

  format(m: CrossMetric): string {
    const v = Number(m.value) || 0;
    if (m.format === 'currency') {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: v >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: v >= 1e6 ? 1 : 0 }).format(v);
    }
    const n = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
    return m.format === 'kg' ? `${n} kg` : n;
  }

  appColor(app: CrossApp): string {
    return app.color || '#2f8f4e';
  }
}
