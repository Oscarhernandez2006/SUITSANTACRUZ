import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { AdminService, AppAccess, AppProvisioningCatalog, CatalogApplication } from '../../services/admin.service';

/**
 * Accesos de un usuario a las aplicaciones externas (tarjetas por app + modal
 * de rol/módulos). Se usa dentro del asistente de usuario; el padre llama a
 * `persist(userId)` después de guardar el usuario.
 */
@Component({
  selector: 'app-user-app-access',
  imports: [FormsModule],
  templateUrl: './user-app-access.html',
  styleUrl: './user-app-access.scss',
})
export class UserAppAccess implements OnInit {
  private adminService = inject(AdminService);

  /** Usuario existente (null en un alta). */
  readonly userId = input<number | null>(null);
  readonly userName = input('');
  readonly readonly = input(false);

  readonly applications = signal<CatalogApplication[]>([]);
  readonly loadingAccess = signal(false);
  readonly activeConfigAppId = signal<number | null>(null);
  readonly appTab = signal<'all' | 'granted'>('all');
  readonly appSearch = signal('');

  readonly granted = signal<Map<number, Set<string>>>(new Map());
  readonly appRoles = signal<Map<number, string>>(new Map());
  readonly appPerms = signal<Map<number, Set<string>>>(new Map());
  readonly appCompanyPerms = signal<Map<number, Map<string, Set<string>>>>(new Map());
  readonly appCompanies = signal<Map<number, Set<string>>>(new Map());
  readonly appCompanySellers = signal<Map<number, Map<string, string>>>(new Map());
  readonly activeCompany = signal<Map<number, string>>(new Map());
  readonly catalogs = signal<Map<number, AppProvisioningCatalog>>(new Map());
  readonly loadingCatalog = signal<Set<number>>(new Set());
  private original = '';

  readonly visibleApps = computed(() => {
    const q = this.appSearch().trim().toLowerCase();
    const granted = this.granted();
    return this.applications().filter((a) => {
      if (this.appTab() === 'granted' && !granted.has(a.id)) return false;
      return !q || a.name.toLowerCase().includes(q) || (a.category ?? '').toLowerCase().includes(q);
    });
  });

  readonly grantedCount = computed(() => this.granted().size);
  readonly configuredCount = computed(() => {
    const roles = this.appRoles();
    return Array.from(this.granted().keys()).filter((id) => !!roles.get(id)).length;
  });
  readonly ssoCount = computed(() => this.applications().filter((a) => this.granted().has(a.id) && a.sso_enabled).length);

  readonly activeConfigApp = computed(() => {
    const id = this.activeConfigAppId();
    return id === null ? null : this.applications().find((a) => a.id === id) ?? null;
  });

  /** Nombres de las apps concedidas (para el resumen del asistente). */
  readonly grantedApps = computed(() => this.applications().filter((a) => this.granted().has(a.id)));

  ngOnInit(): void {
    this.adminService.getPermissionCatalog().subscribe({
      next: (res) => {
        this.applications.set(res.applications);
        this.preloadCatalogs();
      },
    });
    const id = this.userId();
    if (id) this.loadAccess(id);
    else this.original = this.serialize();
  }

  private loadAccess(userId: number): void {
    this.loadingAccess.set(true);
    // Refresca contra las apps externas: el rol/permisos pueden cambiar también allá.
    this.adminService.refreshUserApplications(userId).subscribe({
      next: (res) => {
        const map = new Map<number, Set<string>>();
        const roles = new Map<number, string>();
        const perms = new Map<number, Set<string>>();
        const companyPerms = new Map<number, Map<string, Set<string>>>();
        const companiesEnabled = new Map<number, Set<string>>();
        const companySellers = new Map<number, Map<string, string>>();
        const access = res.access ?? res.application_ids.map((id) => ({
          application_id: id,
          abilities: ['view'],
          role: null as string | null,
          permissions: [] as string[],
          companyPermissions: {} as Record<string, string[]>,
          companySellers: {} as Record<string, string>,
          companies: [] as string[],
        }));
        for (const entry of access) {
          map.set(entry.application_id, new Set(entry.abilities.length ? entry.abilities : ['view']));
          if (entry.role) roles.set(entry.application_id, entry.role);
          if (entry.permissions?.length) perms.set(entry.application_id, new Set(entry.permissions));
          const cp = entry.companyPermissions;
          if (cp && Object.keys(cp).length) {
            const byCompany = new Map<string, Set<string>>();
            for (const [cid, list] of Object.entries(cp)) byCompany.set(cid, new Set(list ?? []));
            companyPerms.set(entry.application_id, byCompany);
          }
          if (entry.companies?.length) companiesEnabled.set(entry.application_id, new Set(entry.companies));
          const cs = entry.companySellers;
          if (cs && Object.keys(cs).length) {
            const sellers = new Map<string, string>();
            for (const [cid, code] of Object.entries(cs)) sellers.set(cid, code);
            companySellers.set(entry.application_id, sellers);
          }
        }
        this.granted.set(map);
        this.appRoles.set(roles);
        this.appPerms.set(perms);
        this.appCompanyPerms.set(companyPerms);
        this.appCompanies.set(companiesEnabled);
        this.appCompanySellers.set(companySellers);
        this.original = this.serialize();
        this.loadingAccess.set(false);
        this.preloadCatalogs();
      },
      error: () => this.loadingAccess.set(false),
    });
  }

  private preloadCatalogs(): void {
    for (const app of this.applications()) {
      if (this.granted().has(app.id) && this.isProvisionable(app)) this.loadCatalog(app.id);
    }
  }

  // ---- Compañías (apps multi-compañía como SIGCOM) ----
  isMultiCompany(appId: number): boolean {
    return (this.catalogFor(appId)?.companies.length ?? 0) > 0;
  }

  companiesFor(appId: number): { id: string; name: string }[] {
    return this.catalogFor(appId)?.companies ?? [];
  }

  isCompanyEnabled(appId: number, companyId: string): boolean {
    return this.appCompanies().get(appId)?.has(companyId) ?? false;
  }

  toggleCompany(appId: number, companyId: string): void {
    if (!this.isGranted(appId) || this.readonly()) return;
    const next = new Map(this.appCompanies());
    const set = new Set(next.get(appId) ?? []);
    if (set.has(companyId)) set.delete(companyId);
    else {
      set.add(companyId);
      this.setActiveCompany(appId, companyId);
    }
    next.set(appId, set);
    this.appCompanies.set(next);
  }

  companySeller(appId: number, companyId: string): string {
    return this.appCompanySellers().get(appId)?.get(companyId) ?? '';
  }

  setCompanySeller(appId: number, companyId: string, code: string): void {
    const next = new Map(this.appCompanySellers());
    const byCompany = new Map(next.get(appId) ?? new Map<string, string>());
    if (code) byCompany.set(companyId, code);
    else byCompany.delete(companyId);
    next.set(appId, byCompany);
    this.appCompanySellers.set(next);
  }

  enabledCompaniesFor(appId: number): { id: string; name: string }[] {
    return this.companiesFor(appId).filter((c) => this.isCompanyEnabled(appId, c.id));
  }

  activeCompanyId(appId: number): string {
    const active = this.activeCompany().get(appId);
    const enabled = this.enabledCompaniesFor(appId);
    if (active && enabled.some((c) => c.id === active)) return active;
    return enabled[0]?.id ?? '';
  }

  setActiveCompany(appId: number, companyId: string): void {
    this.activeCompany.set(new Map(this.activeCompany()).set(appId, companyId));
  }

  appCompanyHasPerm(appId: number, companyId: string, key: string): boolean {
    return this.appCompanyPerms().get(appId)?.get(companyId)?.has(key) ?? false;
  }

  toggleAppCompanyPerm(appId: number, companyId: string, key: string): void {
    if (!this.isGranted(appId) || this.readonly()) return;
    const next = new Map(this.appCompanyPerms());
    const byCompany = new Map(next.get(appId) ?? new Map<string, Set<string>>());
    const set = new Set(byCompany.get(companyId) ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    byCompany.set(companyId, set);
    next.set(appId, byCompany);
    this.appCompanyPerms.set(next);
  }

  // ---- Catálogo por app ----
  isProvisionable(app: CatalogApplication): boolean {
    return app.provisionable === true || app.sso_enabled === true;
  }

  catalogFor(appId: number): AppProvisioningCatalog | undefined {
    return this.catalogs().get(appId);
  }

  isLoadingCatalog(appId: number): boolean {
    return this.loadingCatalog().has(appId);
  }

  private loadCatalog(appId: number): void {
    if (this.catalogs().has(appId) || this.loadingCatalog().has(appId)) return;
    this.loadingCatalog.set(new Set(this.loadingCatalog()).add(appId));
    const done = () => {
      const s = new Set(this.loadingCatalog());
      s.delete(appId);
      this.loadingCatalog.set(s);
    };
    this.adminService.getAppCatalog(appId).subscribe({
      next: (cat) => {
        this.catalogs.set(new Map(this.catalogs()).set(appId, cat));
        done();
      },
      error: done,
    });
  }

  appRole(appId: number): string {
    return this.appRoles().get(appId) ?? '';
  }

  setAppRole(appId: number, role: string): void {
    if (this.readonly()) return;
    const next = new Map(this.appRoles());
    if (role) next.set(appId, role);
    else next.delete(appId);
    this.appRoles.set(next);
  }

  appHasPerm(appId: number, key: string): boolean {
    return this.appPerms().get(appId)?.has(key) ?? false;
  }

  toggleAppPerm(appId: number, key: string): void {
    if (!this.isGranted(appId) || this.readonly()) return;
    const next = new Map(this.appPerms());
    const set = new Set(next.get(appId) ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    if (set.size) next.set(appId, set);
    else next.delete(appId);
    this.appPerms.set(next);
  }

  modOn(appId: number, key: string): boolean {
    return this.isMultiCompany(appId)
      ? this.appCompanyHasPerm(appId, this.activeCompanyId(appId), key)
      : this.appHasPerm(appId, key);
  }

  toggleMod(appId: number, key: string): void {
    if (this.isMultiCompany(appId)) this.toggleAppCompanyPerm(appId, this.activeCompanyId(appId), key);
    else this.toggleAppPerm(appId, key);
  }

  groupOnCount(appId: number, modules: { key: string }[]): number {
    return modules.filter((m) => this.modOn(appId, m.key)).length;
  }

  modulesOnCount(appId: number): number {
    return (this.catalogFor(appId)?.groups ?? []).reduce((n, g) => n + this.groupOnCount(appId, g.modules), 0);
  }

  modulesTotal(appId: number): number {
    return (this.catalogFor(appId)?.groups ?? []).reduce((n, g) => n + g.modules.length, 0);
  }

  setGroup(appId: number, modules: { key: string }[], on: boolean): void {
    for (const m of modules) {
      if (this.modOn(appId, m.key) !== on) this.toggleMod(appId, m.key);
    }
  }

  // ---- Acceso a apps ----
  isGranted(appId: number): boolean {
    return this.granted().has(appId);
  }

  toggleApp(appId: number): void {
    if (this.readonly()) return;
    const next = new Map(this.granted());
    if (next.has(appId)) {
      next.delete(appId);
      if (this.activeConfigAppId() === appId) this.closeAppConfig();
    } else {
      next.set(appId, new Set(['view']));
      const app = this.applications().find((a) => a.id === appId);
      if (app && this.isProvisionable(app)) this.loadCatalog(appId);
    }
    this.granted.set(next);
  }

  openAppConfig(app: CatalogApplication): void {
    if (!this.isGranted(app.id) || !this.isProvisionable(app)) return;
    this.activeConfigAppId.set(app.id);
    this.loadCatalog(app.id);
  }

  closeAppConfig(): void {
    this.activeConfigAppId.set(null);
  }

  isDirty(): boolean {
    return this.serialize() !== this.original;
  }

  /** Guarda los accesos del usuario (solo si hubo cambios). */
  persist(userId: number): Observable<unknown> {
    if (this.readonly() || !this.isDirty()) return of(null);
    return this.adminService.updateUserAccess(userId, this.buildAccess());
  }

  private buildAccess(): AppAccess[] {
    return Array.from(this.granted().entries()).map(([application_id, set]) => {
      const entry: AppAccess = {
        application_id,
        abilities: Array.from(set),
        role: this.appRoles().get(application_id) ?? null,
      };
      if (this.isMultiCompany(application_id)) {
        const enabled = this.appCompanies().get(application_id) ?? new Set<string>();
        const modules = this.appCompanyPerms().get(application_id);
        const sellers = this.appCompanySellers().get(application_id);
        const byCompany: Record<string, string[]> = {};
        const sellerMap: Record<string, string> = {};
        for (const cid of enabled) {
          byCompany[cid] = Array.from(modules?.get(cid) ?? []);
          const code = sellers?.get(cid);
          if (code) sellerMap[cid] = code;
        }
        entry.companyPermissions = byCompany;
        entry.companySellers = sellerMap;
        entry.companies = Array.from(enabled);
      } else {
        entry.permissions = Array.from(this.appPerms().get(application_id) ?? []);
      }
      return entry;
    });
  }

  private serialize(): string {
    const setStr = (s: Set<string>) => Array.from(s).sort().join(',');
    const mapStr = <V>(m: Map<number, V>, f: (v: V) => string) =>
      Array.from(m.entries()).map(([k, v]) => `${k}:${f(v)}`).sort().join('|');
    const nested = (m: Map<string, Set<string>>) =>
      Array.from(m.entries()).map(([k, v]) => `${k}=${setStr(v)}`).sort().join(';');
    const sellers = (m: Map<string, string>) =>
      Array.from(m.entries()).map(([k, v]) => `${k}=${v}`).sort().join(';');
    return [
      mapStr(this.granted(), setStr),
      mapStr(this.appRoles(), (v) => v),
      mapStr(this.appPerms(), setStr),
      mapStr(this.appCompanyPerms(), nested),
      mapStr(this.appCompanies(), setStr),
      mapStr(this.appCompanySellers(), sellers),
    ].join('||');
  }
}
