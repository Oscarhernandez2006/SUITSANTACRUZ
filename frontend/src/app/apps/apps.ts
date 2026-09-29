import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Sidebar } from '../shared/sidebar/sidebar';
import { AppCard, AppCardData } from '../shared/app-card/app-card';
import { AuthService } from '../services/auth.service';
import { Application, ApplicationsService } from '../services/applications.service';
import { AdminService, ApplicationPayload, ManagedApplication } from '../services/admin.service';
import { SiesaService } from '../services/siesa.service';

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
  selector: 'app-apps-page',
  standalone: true,
  imports: [FormsModule, Sidebar, AppCard],
  templateUrl: './apps.html',
  styleUrl: './apps.scss',
})
export class AppsPage implements OnInit {
  private authService = inject(AuthService);
  private applicationsService = inject(ApplicationsService);
  private adminService = inject(AdminService);
  private siesaService = inject(SiesaService);
  private http = inject(HttpClient);

  readonly user = this.authService.currentUser;
  get canCreateApp(): boolean { return this.authService.can('apps.create'); }
  get canEditApp(): boolean { return this.authService.can('apps.edit'); }
  get canDeleteApp(): boolean { return this.authService.can('apps.delete'); }
  get canManageApps(): boolean { return this.canCreateApp || this.canEditApp || this.canDeleteApp; }

  // ---- Apps ----
  readonly apps = signal<AppCardData[]>([]);
  readonly appsLoading = signal(true);
  readonly searchQuery = signal('');
  readonly managedApps = signal<ManagedApplication[]>([]);

  readonly filteredApps = computed(() => {
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

  // ---- Admin modal ----
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

  // ---- Siesa ----
  readonly siesaStatus = this.authService.siesaStatus;
  readonly siesaConnected = computed(() => !!this.siesaStatus()?.has_credentials);
  readonly siesaModalOpen = signal(false);
  readonly siesaSaving = signal(false);
  readonly siesaError = signal('');
  readonly showSiesaPassword = signal(false);
  siesaUsername = '';
  siesaPassword = '';

  // ---- Toast ----
  readonly toastMessage = signal('');
  readonly toastVisible = signal(false);

  ngOnInit(): void {
    this.authService.refreshUser();
    this.loadApplications();
    if (this.canManageApps) this.loadManagedApps();
  }

  private loadApplications(): void {
    this.appsLoading.set(true);
    this.applicationsService.getApplications().subscribe({
      next: (apps) => {
        this.apps.set(apps.map((a) => this.mapApplication(a)));
        this.appsLoading.set(false);
      },
      error: () => this.appsLoading.set(false),
    });
  }

  private mapApplication(app: Application): AppCardData {
    return {
      name: app.name, description: app.description, icon: app.icon,
      url: app.url, category: app.category, color: app.color,
      logo: app.logo ?? undefined, keywords: app.keywords ?? undefined,
      slug: app.slug, ssoEnabled: app.sso_enabled,
      statusText: app.sso_enabled ? 'SSO' : 'Disponible',
      statusOn: app.sso_enabled,
    };
  }

  private matchesSearch(item: AppCardData, query: string): boolean {
    const kws = query.toLowerCase().trim().split(/\s+/);
    const text = `${item.name} ${item.category} ${item.description} ${item.keywords ?? ''}`.toLowerCase();
    return kws.every((kw) => text.includes(kw));
  }

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

  onAppClick(app: AppCardData): void {
    if (app.slug === 'siesa') {
      this.siesaConnected() ? window.open('/siesa-launch', '_blank') : this.openSiesaModal();
      return;
    }
    if (app.ssoEnabled && app.slug) {
      this.showToast(`Iniciando sesión en ${app.name}...`);
      this.applicationsService.requestSsoTicket(app.slug).subscribe({
        next: (res) => window.open(res.redirect_url, '_blank'),
        error: () => {
          this.showToast(`No se pudo iniciar sesión. Abriendo ${app.name}...`);
          setTimeout(() => window.open(app.url, '_blank'), 1200);
        },
      });
      return;
    }
    this.showToast(`Redirigiendo a ${app.name}...`);
    setTimeout(() => window.open(app.url, '_blank'), 1000);
  }

  onCardSecondary(app: AppCardData): void {
    if (app.slug === 'siesa') { this.openSiesaModal(); return; }
    if (this.canEditApp) {
      const managed = this.managedApps().find((m) => m.slug === app.slug);
      if (managed) this.openEditApp(managed);
    }
  }

  // ---- Siesa modal ----
  openSiesaModal(): void {
    this.siesaError.set('');
    this.siesaPassword = '';
    this.siesaUsername = this.siesaStatus()?.username ?? '';
    this.siesaModalOpen.set(true);
  }

  closeSiesaModal(): void { this.siesaModalOpen.set(false); }

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
        this.showToast('Credenciales de Siesa guardadas');
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
        this.showToast('Credenciales de Siesa eliminadas');
      },
      error: () => this.siesaSaving.set(false),
    });
  }

  // ---- Admin CRUD ----
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

  removeLogo(): void { this.updateAppField('logo', ''); this.logoError.set(''); }

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
        this.appFormError.set(err?.error?.message || 'No se pudo guardar la aplicación.');
      },
    });
  }

  askDeleteApp(): void {
    const f = this.appForm();
    const managed = this.managedApps().find((m) => m.id === f.id);
    if (managed) { this.appModalOpen.set(false); this.appConfirmDelete.set(managed); }
  }

  cancelDeleteApp(): void { this.appConfirmDelete.set(null); }

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
      error: () => { this.appConfirmDelete.set(null); this.showToast('No se pudo eliminar'); },
    });
  }

  private showToast(message: string, duration = 2500): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), duration);
  }
}
