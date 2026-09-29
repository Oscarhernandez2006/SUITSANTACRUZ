import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AppCard, AppCardData } from '../shared/app-card/app-card';
import { Sidebar } from '../shared/sidebar/sidebar';
import { AuthService } from '../services/auth.service';
import { Application, ApplicationsService } from '../services/applications.service';
import { DashboardStats, StatsService } from '../services/stats.service';
import { AdminService, AnnouncementItem, ApplicationPayload, ManagedApplication, ServiceHealth } from '../services/admin.service';
import { PresenceService } from '../services/presence.service';
import { SiesaService } from '../services/siesa.service';
import { OnboardingTour } from '../shared/onboarding/onboarding';
import {
  BarChart,
  BarDatum,
  ChartCard,
  ChartCardState,
  DonutChart,
  DonutDatum,
  LineChart,
  LinePoint,
  CHART_SEMANTIC,
} from '../shared/charts';

const ICON_OPTIONS: string[] = [
  'apps', 'dashboard', 'grid_view', 'widgets', 'inventory_2', 'inventory', 'warehouse',
  'forklift', 'pallet', 'package_2', 'local_shipping', 'shopping_cart', 'store',
  'storefront', 'sell', 'local_offer', 'redeem', 'card_giftcard', 'receipt_long',
  'description', 'assignment', 'fact_check', 'task', 'checklist', 'event', 'calendar_month',
  'schedule', 'payments', 'account_balance', 'attach_money', 'paid', 'savings',
  'request_quote', 'badge', 'group', 'groups', 'person', 'manage_accounts',
  'support_agent', 'headset_mic', 'build', 'handyman', 'construction', 'engineering',
  'settings', 'tune', 'monitoring', 'analytics', 'bar_chart', 'pie_chart', 'trending_up',
  'insights', 'table_chart', 'folder', 'folder_open', 'cloud', 'cloud_upload', 'database',
  'dns', 'lan', 'hub', 'devices', 'computer', 'smartphone', 'qr_code_scanner',
  'label', 'water_drop', 'agriculture', 'factory', 'scale', 'verified', 'shield',
  'lock', 'key', 'mail', 'chat', 'notifications', 'map', 'location_on', 'work', 'home',
];

type AppFormModel = {
  id: number | null;
  slug: string; name: string; description: string; icon: string; url: string;
  category: string; color: string; logo: string; keywords: string;
  type: 'app' | 'form'; sso_enabled: boolean; is_active: boolean; sort_order: number;
};

function emptyAppForm(): AppFormModel {
  return {
    id: null, slug: '', name: '', description: '', icon: 'apps', url: '',
    category: '', color: '#57AD31', logo: '', keywords: '',
    type: 'app', sso_enabled: false, is_active: true, sort_order: 0,
  };
}

@Component({
  selector: 'app-portal',
  imports: [FormsModule, DatePipe, AppCard, Sidebar, ChartCard, LineChart, BarChart, DonutChart, OnboardingTour, RouterLink],
  templateUrl: './portal.html',
  styleUrl: './portal.scss',
})
export class Portal implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private applicationsService = inject(ApplicationsService);
  private statsService = inject(StatsService);
  private adminService = inject(AdminService);
  readonly presence = inject(PresenceService);
  private siesaService = inject(SiesaService);
  private http = inject(HttpClient);
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadApplications();
    this.authService.refreshUser();
    this.loadStats();
    this.loadHealth();
    this.presence.init();
    if (this.canManageApps) this.loadManagedApps();
    // Onboarding: mostrar solo la primera vez
    if (!localStorage.getItem('suite-onboarding-done')) {
      this.showOnboarding.set(true);
    }
    // Anuncios activos no vistos
    this.adminService.getActiveAnnouncements().subscribe({
      next: (a) => this.announcements.set(a),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.topbar__user')) {
      this.userMenuOpen.set(false);
    }
    if (!target.closest('.topbar__calendar-wrapper')) {
      this.calendarOpen.set(false);
    }
    if (!target.closest('.profile-modal') && !target.closest('.topbar__dropdown-item')) {
      this.profileOpen.set(false);
    }
  }

  sidebarCollapsed = signal(false);
  searchQuery = signal('');
  toastMessage = signal('');
  toastVisible = signal(false);
  userMenuOpen = signal(false);
  profileOpen = signal(false);
  calendarOpen = signal(false);

  // Vista activa del portal (controlada por el sidebar)
  activeView = signal<'inicio'>('inicio');

  // Reloj en tiempo real
  currentTime = signal(new Date());

  // Clima
  weatherTemp = signal<number | null>(null);
  weatherDesc = signal('');
  weatherIcon = signal('');
  weatherCity = signal('');

  // Calendario
  calendarDate = signal(new Date());
  selectedDay = signal<number | null>(null);

  readonly user = this.authService.currentUser;

  get isAdmin(): boolean {
    return !!this.user()?.is_admin;
  }

  get canAdminStats(): boolean { return this.authService.can('dashboard.stats'); }
  get canGeneralStats(): boolean { return this.authService.can('stats'); }
  get canCreateApp(): boolean { return this.authService.can('apps.create'); }
  get canEditApp(): boolean { return this.authService.can('apps.edit'); }
  get canDeleteApp(): boolean { return this.authService.can('apps.delete'); }
  get canManageApps(): boolean { return this.canCreateApp || this.canEditApp || this.canDeleteApp; }

  goToPermissions(): void {
    this.userMenuOpen.set(false);
    this.router.navigate(['/admin/usuarios']);
  }

  goToAppsAdmin(): void {
    this.openCreateApp();
  }

  goToApps(): void {
    this.router.navigate(['/apps']);
  }

  get currentUserName(): string {
    return this.user()?.name ?? 'Usuario';
  }

  get currentUserFirstName(): string {
    return (this.user()?.name ?? 'Usuario').split(' ')[0];
  }

  get currentUserInitials(): string {
    const parts = (this.user()?.name ?? '').split(' ').filter(w => w.length > 0);
    if (parts.length < 3) return parts.map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[2][0]).toUpperCase();
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  get greetingIcon(): string {
    const h = new Date().getHours();
    if (h < 12) return 'wb_sunny';
    if (h < 18) return 'wb_twilight';
    return 'dark_mode';
  }

  readonly currentDate = new Date();

  get greetingDate(): string {
    const d = new Date();
    const weekday = d.toLocaleDateString('es-CO', { weekday: 'long' });
    const month = d.toLocaleDateString('es-CO', { month: 'long' });
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(weekday)}, ${d.getDate()} de ${month} de ${d.getFullYear()}`;
  }

  // Calendario helpers
  get calendarMonth(): string {
    return this.calendarDate().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  get calendarDays(): (number | null)[] {
    const d = this.calendarDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const blanks: (number | null)[] = Array(firstDay).fill(null);
    const days: (number | null)[] = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return [...blanks, ...days];
  }

  isToday(day: number | null): boolean {
    if (!day) return false;
    const now = new Date();
    const d = this.calendarDate();
    return day === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  hasEvent(day: number | null): boolean {
    if (!day) return false;
    const d = this.calendarDate();
    const key = `${d.getFullYear()}-${d.getMonth()}-${day}`;
    return this.companyEvents.has(key);
  }

  getEventsForDay(day: number): string[] {
    const d = this.calendarDate();
    const key = `${d.getFullYear()}-${d.getMonth()}-${day}`;
    return this.companyEvents.get(key) ?? [];
  }

  changeMonth(offset: number): void {
    const d = new Date(this.calendarDate());
    d.setMonth(d.getMonth() + offset);
    this.calendarDate.set(d);
    this.selectedDay.set(null);
  }

  selectDay(day: number | null): void {
    if (day) this.selectedDay.set(this.selectedDay() === day ? null : day);
  }

  // Eventos de ejemplo de la empresa
  readonly companyEvents = new Map<string, string[]>([
    [`2026-3-1`, ['Día del Trabajo']],
    [`2026-3-15`, ['Pago de nómina quincenal']],
    [`2026-3-30`, ['Pago de nómina fin de mes']],
    [`2026-4-1`, ['Reunión de resultados mensual']],
    [`2026-4-15`, ['Pago de nómina quincenal']],
    [`2026-4-18`, ['Corpus Christi - Festivo']],
  ]);

  // Clima
  private fetchWeather(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
        this.http.get<any>(url).subscribe({
          next: (res) => {
            this.weatherTemp.set(Math.round(res.current.temperature_2m));
            const code = res.current.weather_code;
            this.weatherIcon.set(this.getWeatherIcon(code));
            this.weatherDesc.set(this.getWeatherDesc(code));
          },
        });
      },
      () => {
        // Si no da permisos, usar coordenadas de Bogotá
        const url = `https://api.open-meteo.com/v1/forecast?latitude=4.71&longitude=-74.07&current=temperature_2m,weather_code&timezone=auto`;
        this.http.get<any>(url).subscribe({
          next: (res) => {
            this.weatherTemp.set(Math.round(res.current.temperature_2m));
            const code = res.current.weather_code;
            this.weatherIcon.set(this.getWeatherIcon(code));
            this.weatherDesc.set(this.getWeatherDesc(code));
            this.weatherCity.set('Bogotá');
          },
        });
      }
    );
  }

  private getWeatherIcon(code: number): string {
    if (code === 0) return 'wb_sunny';
    if (code <= 3) return 'partly_cloudy_day';
    if (code <= 48) return 'cloud';
    if (code <= 67) return 'rainy';
    if (code <= 77) return 'weather_snowy';
    if (code <= 82) return 'thunderstorm';
    return 'cloud';
  }

  private getWeatherDesc(code: number): string {
    if (code === 0) return 'Despejado';
    if (code <= 3) return 'Parcialmente nublado';
    if (code <= 48) return 'Nublado';
    if (code <= 55) return 'Llovizna';
    if (code <= 67) return 'Lluvia';
    if (code <= 77) return 'Nieve';
    if (code <= 82) return 'Aguacero';
    if (code <= 99) return 'Tormenta';
    return 'Variable';
  }

  // Perfil
  openProfile(): void {
    this.userMenuOpen.set(false);
    this.profileOpen.set(true);
  }

  closeProfile(): void {
    this.profileOpen.set(false);
    this.resetPasswordForm();
  }

  // ---- Cambio de contraseña propio ----
  readonly pwdOpen = signal(false);
  readonly pwdSaving = signal(false);
  readonly pwdError = signal('');
  readonly pwdSuccess = signal('');
  readonly showPwdCurrent = signal(false);
  readonly showPwdNew = signal(false);
  pwdCurrent = '';
  pwdNew = '';
  pwdConfirm = '';

  togglePwdSection(): void {
    this.pwdOpen.update((v) => !v);
    this.pwdError.set('');
    this.pwdSuccess.set('');
  }

  private resetPasswordForm(): void {
    this.pwdOpen.set(false);
    this.pwdCurrent = '';
    this.pwdNew = '';
    this.pwdConfirm = '';
    this.pwdError.set('');
    this.pwdSuccess.set('');
    this.showPwdCurrent.set(false);
    this.showPwdNew.set(false);
  }

  changePassword(): void {
    if (this.pwdSaving()) return;
    if (!this.pwdCurrent) {
      this.pwdError.set('Ingresa tu contraseña actual.');
      return;
    }
    if (this.pwdNew.length < 6) {
      this.pwdError.set('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (this.pwdNew !== this.pwdConfirm) {
      this.pwdError.set('Las contraseñas no coinciden.');
      return;
    }
    this.pwdSaving.set(true);
    this.pwdError.set('');
    this.pwdSuccess.set('');
    this.authService.changePassword(this.pwdCurrent, this.pwdNew).subscribe({
      next: () => {
        this.pwdSaving.set(false);
        this.pwdSuccess.set('Contraseña actualizada correctamente');
        this.pwdCurrent = '';
        this.pwdNew = '';
        this.pwdConfirm = '';
      },
      error: (err) => {
        this.pwdSaving.set(false);
        this.pwdError.set(err?.error?.message || 'No se pudo cambiar la contraseña');
      },
    });
  }

  readonly sidebarLinks = computed(() => {
    const links: { icon: string; label: string; view: 'inicio'; route?: string; adminOnly?: boolean }[] = [
      { icon: 'home', label: 'Inicio', view: 'inicio' },
      { icon: 'grid_view', label: 'Aplicaciones', view: 'inicio', route: '/apps' },
    ];
    if (this.isAdmin) {
      links.push({ icon: 'group', label: 'Usuarios', view: 'inicio', route: '/admin/usuarios', adminOnly: true });
      links.push({ icon: 'groups', label: 'Grupos', view: 'inicio', route: '/admin/roles', adminOnly: true });
      links.push({ icon: 'history', label: 'Auditoría', view: 'inicio', route: '/admin/auditoria', adminOnly: true });
      links.push({ icon: 'devices', label: 'Sesiones', view: 'inicio', route: '/admin/sesiones', adminOnly: true });
      links.push({ icon: 'timer', label: 'Presencia', view: 'inicio', route: '/admin/presencia', adminOnly: true });
    }
    return links;
  });

  selectSidebar(item: { view: 'inicio'; route?: string }): void {
    if (item.route) {
      this.router.navigate([item.route]);
      return;
    }
    this.activeView.set(item.view);
  }

  readonly apps = signal<AppCardData[]>([]);

  readonly forms = signal<AppCardData[]>([]);

  readonly appsLoading = signal<boolean>(true);

  readonly skeletonItems = [1, 2, 3, 4];
  readonly skeletonKpis = [1, 2, 3, 4, 5];

  readonly recentApps = computed(() => this.apps().slice(0, 4).map((a) => a.name));

  private mapApplication(app: Application): AppCardData {
    return {
      name: app.name,
      description: app.description,
      icon: app.icon,
      url: app.url,
      category: app.category,
      color: app.color,
      logo: app.logo ?? undefined,
      keywords: app.keywords ?? undefined,
      slug: app.slug,
      ssoEnabled: app.sso_enabled,
      // Badge por defecto: SSO para las apps con inicio automático, Disponible para el resto.
      statusText: app.sso_enabled ? 'SSO' : 'Disponible',
      statusOn: app.sso_enabled,
    };
  }

  private loadApplications(): void {
    this.appsLoading.set(true);
    this.applicationsService.getApplications().subscribe({
      next: (applications) => {
        const mapped = applications.map((a) => this.mapApplication(a));
        this.apps.set(mapped.filter((_, i) => applications[i].type === 'app'));
        this.forms.set(mapped.filter((_, i) => applications[i].type === 'form'));
        this.appsLoading.set(false);
      },
      error: () => {
        this.apps.set([]);
        this.forms.set([]);
        this.appsLoading.set(false);
      },
    });
  }

  private matchesSearch(item: AppCardData, query: string): boolean {
    const keywords = query.toLowerCase().trim().split(/\s+/);
    const text = `${item.name} ${item.category} ${item.description} ${item.keywords ?? ''}`.toLowerCase();
    return keywords.every((kw) => text.includes(kw));
  }

  filteredApps = computed(() => {
    const all = this.apps().map((a) => {
      if (a.slug === 'siesa') return this.decorateSiesaCard(a);
      return this.canEditApp
        ? { ...a, secondaryActionIcon: 'edit', secondaryActionLabel: 'Editar aplicación' }
        : a;
    });
    const q = this.searchQuery().trim();
    if (!q) return all;
    return all.filter((a) => this.matchesSearch(a, q));
  });

  filteredForms = computed(() => {
    const q = this.searchQuery().trim();
    if (!q) return this.forms();
    return this.forms().filter((f) => this.matchesSearch(f, q));
  });

  activeModules = computed(() => this.apps().length);

  // ---- Dashboard de estadísticas (solo admin) ----
  readonly stats = signal<DashboardStats | null>(null);
  readonly statsLoading = signal<boolean>(false);
  readonly statsError = signal<boolean>(false);

  // ---- Estado de servicios (health checks) ----
  readonly servicesHealth = signal<ServiceHealth[]>([]);
  readonly healthLoading = signal<boolean>(false);

  loadHealth(): void {
    if (!this.canAdminStats) return;
    this.healthLoading.set(true);
    this.adminService.getServicesHealth().subscribe({
      next: (res) => {
        this.servicesHealth.set(res.services);
        this.healthLoading.set(false);
      },
      error: () => this.healthLoading.set(false),
    });
  }

  /** Formatea segundos a "Xh Ym". */
  fmtDuration(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  loadStats(): void {
    if (!this.canAdminStats) return;
    this.statsLoading.set(true);
    this.statsError.set(false);
    this.statsService.getStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.statsLoading.set(false);
      },
      error: () => {
        this.stats.set(null);
        this.statsError.set(true);
        this.statsLoading.set(false);
      },
    });
  }

  readonly accentColor = CHART_SEMANTIC.primary;
  readonly infoColor = CHART_SEMANTIC.info;

  /** Accesos por aplicación → barras horizontales (conserva color/icono). */
  readonly accessBars = computed<BarDatum[]>(() =>
    (this.stats()?.access_per_app ?? []).map((a) => ({
      label: a.name,
      value: a.users_count,
      color: a.color || CHART_SEMANTIC.primary,
      icon: a.icon,
    }))
  );

  /** Ingresos SSO por app → barras horizontales. */
  readonly ssoBars = computed<BarDatum[]>(() =>
    (this.stats()?.sso_by_app ?? []).map((a) => ({
      label: a.application,
      value: a.count,
      color: CHART_SEMANTIC.info,
    }))
  );

  /** Tendencia de ingresos → serie temporal para la gráfica de líneas. */
  readonly trendPoints = computed<LinePoint[]>(() =>
    (this.stats()?.logins_trend ?? []).map((t) => ({ x: t.day, y: t.count }))
  );

  /** Apps por categoría → proporciones (dona). */
  readonly categoryDonut = computed<DonutDatum[]>(() =>
    (this.stats()?.apps_by_category ?? []).map((c) => ({ label: c.category, value: c.count }))
  );

  /** Usuarios activos vs inactivos. */
  readonly usersStatusDonut = computed<DonutDatum[]>(() => {
    const s = this.stats()?.summary;
    if (!s) return [];
    return [
      { label: 'Activos', value: s.users_active, color: CHART_SEMANTIC.positive },
      { label: 'Inactivos', value: s.users_inactive, color: CHART_SEMANTIC.neutral },
    ];
  });

  /** Tasa de éxito de autenticación en los últimos 7 días. */
  readonly loginRateDonut = computed<DonutDatum[]>(() => {
    const s = this.stats()?.summary;
    if (!s || !s.logins_last_7d) return [];
    return [
      { label: 'Exitosos', value: s.logins_ok_last_7d, color: CHART_SEMANTIC.positive },
      { label: 'Fallidos', value: Math.max(0, s.logins_last_7d - s.logins_ok_last_7d), color: CHART_SEMANTIC.negative },
    ];
  });

  /** Estado para cada tarjeta de gráfica (loading / error / empty / ready). */
  cardState(hasData: boolean): ChartCardState {
    if (this.statsLoading()) return 'loading';
    if (this.statsError()) return 'error';
    return hasData ? 'ready' : 'empty';
  }

  // ---- Integración Siesa ----
  // El estado vive en AuthService: se hidrata en el login (sin petición extra).
  readonly siesaStatus = this.authService.siesaStatus;
  readonly siesaModalOpen = signal(false);
  readonly siesaSaving = signal(false);
  readonly siesaError = signal('');
  siesaUsername = '';
  siesaPassword = '';
  showSiesaPassword = signal(false);

  readonly siesaConnected = computed(() => !!this.siesaStatus()?.has_credentials);

  // ---- Onboarding ----
  readonly showOnboarding = signal(false);

  // ---- Anuncios ----
  readonly announcements = signal<AnnouncementItem[]>([]);

  dismissAnnouncement(ann: AnnouncementItem): void {
    this.adminService.markAnnouncementViewed(ann.id).subscribe({ next: () => {} });
    this.announcements.update((list) => list.filter((a) => a.id !== ann.id));
  }

  // ---- Gestión inline de aplicaciones (admin) ----
  readonly managedApps = signal<ManagedApplication[]>([]);
  readonly appModalOpen = signal(false);
  readonly appEditing = signal(false);
  readonly appForm = signal<AppFormModel>(emptyAppForm());
  readonly appFormError = signal('');
  readonly appConfirmDelete = signal<ManagedApplication | null>(null);
  readonly appSaving = signal(false);
  readonly iconPickerOpen = signal(false);
  readonly iconSearch = signal('');
  readonly logoError = signal('');
  readonly filteredIcons = computed(() => {
    const q = this.iconSearch().trim().toLowerCase();
    return (q ? ICON_OPTIONS.filter((i) => i.includes(q)) : ICON_OPTIONS).slice(0, 60);
  });

  /**
   * Siesa se carga desde la DB como una app más (respeta permisos). Aquí sólo
   * le añadimos, de forma reactiva, el botón de credenciales y el estado de
   * conexión del usuario sobre la card que viene del backend.
   */
  private decorateSiesaCard(app: AppCardData): AppCardData {
    const connected = this.siesaConnected();
    const username = this.siesaStatus()?.username;
    return {
      ...app,
      icon: app.icon || 'cloud_sync',
      secondaryActionIcon: 'key',
      secondaryActionLabel: connected ? 'Editar credenciales de Siesa' : 'Configurar credenciales de Siesa',
      statusText: connected ? (username ? 'Conectado · ' + username : 'Conectado') : 'Sin credenciales',
      statusOn: connected,
    };
  }

  openSiesaModal(): void {
    this.siesaError.set('');
    this.siesaPassword = '';
    this.siesaUsername = this.siesaStatus()?.username ?? '';
    this.siesaModalOpen.set(true);
  }

  closeSiesaModal(): void {
    this.siesaModalOpen.set(false);
  }

  toggleSiesaPassword(): void {
    this.showSiesaPassword.update((v) => !v);
  }

  saveSiesaCredentials(): void {
    if (!this.siesaUsername || !this.siesaPassword) {
      this.siesaError.set('Ingresa tu usuario y contraseña de Siesa');
      return;
    }
    this.siesaSaving.set(true);
    this.siesaError.set('');
    this.siesaService.saveCredentials(this.siesaUsername.trim(), this.siesaPassword).subscribe({
      next: (s) => {
        this.authService.setSiesaStatus({ has_credentials: true, domain: s.domain, username: s.username });
        this.siesaSaving.set(false);
        this.siesaPassword = '';
        this.siesaModalOpen.set(false);
        this.toastMessage.set('Credenciales de Siesa guardadas');
        this.toastVisible.set(true);
        setTimeout(() => this.toastVisible.set(false), 2000);
      },
      error: (err) => {
        this.siesaSaving.set(false);
        this.siesaError.set(err.error?.message || 'No se pudieron guardar las credenciales');
      },
    });
  }

  deleteSiesaCredentials(): void {
    this.siesaSaving.set(true);
    this.siesaService.deleteCredentials().subscribe({
      next: () => {
        this.authService.setSiesaStatus({ has_credentials: false, domain: 'awssiesacloud', username: null });
        this.siesaSaving.set(false);
        this.siesaModalOpen.set(false);
        this.toastMessage.set('Credenciales de Siesa eliminadas');
        this.toastVisible.set(true);
        setTimeout(() => this.toastVisible.set(false), 2000);
      },
      error: () => this.siesaSaving.set(false),
    });
  }

  openSiesa(): void {
    // Auto-login puro sin extensión: la página /siesa-launch arma el cliente
    // HTML5 de Siesa con las credenciales del usuario y abre la sesión. Si no
    // hay credenciales guardadas, redirige al login manual de Siesa.
    if (this.siesaConnected()) {
      window.open('/siesa-launch', '_blank');
    } else {
      window.open(this.siesaService.siesaUrl, '_blank');
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  onAppClick(app: AppCardData): void {
    // Siesa: abre el auto-login (o el modal si aún no hay credenciales).
    if (app.slug === 'siesa') {
      if (this.siesaConnected()) {
        this.openSiesa();
      } else {
        this.openSiesaModal();
      }
      return;
    }

    // Apps con SSO: pedimos un ticket de un solo uso y abrimos ya logueado.
    if (app.ssoEnabled && app.slug) {
      this.toastMessage.set(`Iniciando sesión en ${app.name}...`);
      this.toastVisible.set(true);
      this.applicationsService.requestSsoTicket(app.slug).subscribe({
        next: (res) => {
          this.toastVisible.set(false);
          window.open(res.redirect_url, '_blank');
        },
        error: () => {
          // Si falla el SSO, abrimos la app normalmente como respaldo.
          this.toastMessage.set(`No se pudo iniciar sesión automáticamente. Abriendo ${app.name}...`);
          setTimeout(() => {
            this.toastVisible.set(false);
            window.open(app.url, '_blank');
          }, 1200);
        },
      });
      return;
    }

    this.toastMessage.set(`Redirigiendo a ${app.name}...`);
    this.toastVisible.set(true);
    setTimeout(() => {
      this.toastVisible.set(false);
      window.open(app.url, '_blank');
    }, 1000);
  }

  /** Acción secundaria: credenciales Siesa para todos; editar app para admins. */
  onCardSecondary(app: AppCardData): void {
    if (app.slug === 'siesa') {
      this.openSiesaModal();
      return;
    }
    if (this.canEditApp) {
      const managed = this.managedApps().find((m) => m.slug === app.slug);
      if (managed) this.openEditApp(managed);
    }
  }

  logout(): void {
    this.authService.logout();
  }

  // ---- CRUD inline de aplicaciones ----

  private showToast(message: string, duration = 2500): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), duration);
  }

  private loadManagedApps(): void {
    this.adminService.getManagedApplications().subscribe({
      next: (apps) => this.managedApps.set(apps),
      error: () => {},
    });
  }

  openCreateApp(): void {
    this.appForm.set(emptyAppForm());
    this.appEditing.set(false);
    this.appFormError.set('');
    this.logoError.set('');
    this.iconPickerOpen.set(false);
    this.appModalOpen.set(true);
  }

  openEditApp(app: ManagedApplication): void {
    this.appForm.set({
      id: app.id, slug: app.slug, name: app.name,
      description: app.description ?? '', icon: app.icon ?? 'apps',
      url: app.url, category: app.category ?? '', color: app.color ?? '#57AD31',
      logo: app.logo ?? '', keywords: app.keywords ?? '',
      type: app.type, sso_enabled: app.sso_enabled,
      is_active: app.is_active, sort_order: app.sort_order,
    });
    this.appEditing.set(true);
    this.appFormError.set('');
    this.logoError.set('');
    this.iconPickerOpen.set(false);
    this.appModalOpen.set(true);
  }

  closeAppModal(): void {
    if (this.appSaving()) return;
    this.appModalOpen.set(false);
    this.iconPickerOpen.set(false);
  }

  onAppNameChange(value: string): void {
    const f = this.appForm();
    const auto = this.slugify(value);
    const next = { ...f, name: value };
    if (!this.appEditing() && (f.slug === '' || f.slug === this.slugify(f.name))) next.slug = auto;
    this.appForm.set(next);
  }

  private slugify(text: string): string {
    return text.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  updateAppField<K extends keyof AppFormModel>(key: K, value: AppFormModel[K]): void {
    this.appForm.set({ ...this.appForm(), [key]: value });
  }

  selectAppIcon(icon: string): void {
    this.updateAppField('icon', icon);
    this.iconPickerOpen.set(false);
    this.iconSearch.set('');
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.logoError.set('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.logoError.set('El archivo debe ser una imagen.'); input.value = ''; return; }
    if (file.size > 1024 * 1024) { this.logoError.set('La imagen supera 1 MB.'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => this.updateAppField('logo', reader.result as string);
    reader.onerror = () => this.logoError.set('No se pudo leer la imagen.');
    reader.readAsDataURL(file);
    input.value = '';
  }

  removeLogo(): void {
    this.updateAppField('logo', '');
    this.logoError.set('');
  }

  saveApp(): void {
    if (this.appSaving()) return;
    const f = this.appForm();
    if (!f.name.trim() || !f.slug.trim() || !f.url.trim()) {
      this.appFormError.set('Nombre, identificador y enlace son obligatorios.');
      return;
    }
    this.appSaving.set(true);
    this.appFormError.set('');
    const payload: ApplicationPayload = {
      slug: f.slug.trim(), name: f.name.trim(),
      description: f.description?.trim() || null, icon: f.icon?.trim() || null,
      url: f.url.trim(), category: f.category?.trim() || null,
      color: f.color || null, logo: f.logo?.trim() || null,
      keywords: f.keywords?.trim() || null, type: f.type,
      sso_enabled: f.sso_enabled, is_active: f.is_active,
      sort_order: Number(f.sort_order) || 0,
    };
    const req$ = this.appEditing() && f.id
      ? this.adminService.updateApplication(f.id, payload)
      : this.adminService.createApplication(payload);
    req$.subscribe({
      next: () => {
        this.appSaving.set(false);
        this.appModalOpen.set(false);
        this.showToast(this.appEditing() ? 'Aplicación actualizada' : 'Aplicación creada');
        this.loadApplications();
        this.loadManagedApps();
      },
      error: (err) => {
        this.appSaving.set(false);
        const msg = err?.error?.message || 'No se pudo guardar la aplicación.';
        this.appFormError.set(msg);
      },
    });
  }

  askDeleteApp(): void {
    const f = this.appForm();
    const managed = this.managedApps().find((m) => m.id === f.id);
    if (managed) { this.appModalOpen.set(false); this.appConfirmDelete.set(managed); }
  }

  cancelDeleteApp(): void {
    this.appConfirmDelete.set(null);
  }

  doDeleteApp(): void {
    const app = this.appConfirmDelete();
    if (!app) return;
    this.adminService.deleteApplication(app.id).subscribe({
      next: () => {
        this.appConfirmDelete.set(null);
        this.showToast('Aplicación eliminada');
        this.loadApplications();
        this.loadManagedApps();
      },
      error: () => {
        this.appConfirmDelete.set(null);
        this.showToast('No se pudo eliminar');
      },
    });
  }
}
