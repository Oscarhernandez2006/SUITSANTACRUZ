import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AdminService, AdminUser, AppAccess, AppProvisioningCatalog, CatalogApplication } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';

/** Etiquetas legibles para cada habilidad granular. */
const ABILITY_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
  manage: 'Administrar',
};

@Component({
  selector: 'app-permissions',
  imports: [FormsModule, Sidebar],
  templateUrl: './permissions.html',
  styleUrl: './permissions.scss',
})
export class Permissions implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly canEdit = this.auth.can('permissions.edit');
  readonly canImport = this.auth.can('permissions.import');
  readonly appTab = signal<'all' | 'granted'>('all');
  readonly appSearch = signal('');

  readonly visibleApps = computed(() => {
    const q = this.appSearch().trim().toLowerCase();
    const granted = this.granted();
    return this.applications().filter((a) => {
      if (this.appTab() === 'granted' && !granted.has(a.id)) return false;
      return !q || a.name.toLowerCase().includes(q) || (a.category ?? '').toLowerCase().includes(q);
    });
  });

  /** Apps concedidas que ya tienen un rol específico configurado en la app externa. */
  readonly configuredCount = computed(() => {
    const roles = this.appRoles();
    return Array.from(this.granted().keys()).filter((id) => !!roles.get(id)).length;
  });

  readonly ssoCount = computed(() =>
    this.applications().filter((a) => this.granted().has(a.id) && a.sso_enabled).length,
  );

  readonly users = signal<AdminUser[]>([]);
  readonly applications = signal<CatalogApplication[]>([]);
  readonly abilities = signal<string[]>([]);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly activeConfigAppId = signal<number | null>(null);

  // Acceso granular: appId -> set de habilidades otorgadas.
  readonly granted = signal<Map<number, Set<string>>>(new Map());
  // Rol por app externa: appId -> rol.
  readonly appRoles = signal<Map<number, string>>(new Map());
  // Módulos por app externa: appId -> set de claves de módulo.
  readonly appPerms = signal<Map<number, Set<string>>>(new Map());
  // Módulos por compañía (apps multi-compañía como Sigcom):
  // appId -> (companyId -> set de módulos).
  readonly appCompanyPerms = signal<Map<number, Map<string, Set<string>>>>(new Map());
  // Compañías habilitadas por app: appId -> set de companyId.
  readonly appCompanies = signal<Map<number, Set<string>>>(new Map());
  // Código de vendedor por compañía: appId -> (companyId -> código).
  readonly appCompanySellers = signal<Map<number, Map<string, string>>>(new Map());
  // Pestaña de compañía activa por app: appId -> companyId.
  readonly activeCompany = signal<Map<number, string>>(new Map());
  // Catálogo de roles/módulos por app externa (cargado bajo demanda).
  readonly catalogs = signal<Map<number, AppProvisioningCatalog>>(new Map());
  readonly loadingCatalog = signal<Set<number>>(new Set());
  private original = '';

  readonly searchQuery = signal('');
  readonly loadingUsers = signal(true);
  readonly loadingAccess = signal(false);
  readonly saving = signal(false);
  readonly importing = signal(false);
  readonly toastMessage = signal('');
  readonly toastVisible = signal(false);

  readonly activeConfigApp = computed(() => {
    const appId = this.activeConfigAppId();
    if (appId === null) return null;
    return this.applications().find((app) => app.id === appId) ?? null;
  });

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(
      (u) => u.name.toLowerCase().includes(q) || u.cedula.toLowerCase().includes(q)
    );
  });

  readonly grantedCount = computed(() => this.granted().size);

  readonly hasChanges = computed(() => this.serialize(this.granted()) !== this.original);

  abilityLabel(ability: string): string {
    return ABILITY_LABELS[ability] ?? ability;
  }

  ngOnInit(): void {
    this.adminService.getPermissionCatalog().subscribe({
      next: (res) => {
        this.applications.set(res.applications);
        this.abilities.set(res.abilities);
      },
    });
    this.loadUsers();
    // Al entrar, sincroniza en segundo plano desde las apps externas (los
    // permisos también se pueden cambiar allá) y recarga la lista al terminar.
    this.autoImport();
  }

  private loadUsers(): void {
    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loadingUsers.set(false);
      },
      error: () => this.loadingUsers.set(false),
    });
  }

  private autoImport(): void {
    if (this.importing()) return;
    this.importing.set(true);
    this.adminService.importUsersFromApps().subscribe({
      next: () => {
        this.importing.set(false);
        this.loadUsers();
      },
      error: () => this.importing.set(false),
    });
  }

  selectUser(user: AdminUser): void {
    if (this.selectedUser()?.id === user.id) return;
    this.closeAppConfig();
    this.selectedUser.set(user);
    this.loadingAccess.set(true);
    this.granted.set(new Map());
    this.appRoles.set(new Map());
    this.appPerms.set(new Map());
    this.appCompanyPerms.set(new Map());
    this.appCompanies.set(new Map());
    this.appCompanySellers.set(new Map());
    // Refresca contra las apps externas al abrir el detalle: refleja el rol y
    // permisos actuales (por si cambiaron directamente en la app).
    this.adminService.refreshUserApplications(user.id).subscribe({
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
            for (const [cid, list] of Object.entries(cp)) {
              byCompany.set(cid, new Set(list ?? []));
            }
            companyPerms.set(entry.application_id, byCompany);
          }
          if (entry.companies?.length) {
            companiesEnabled.set(entry.application_id, new Set(entry.companies));
          }
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
        this.original = this.serialize(map);
        this.loadingAccess.set(false);
        // Precarga los catálogos de las apps aprovisionables ya otorgadas.
        for (const app of this.applications()) {
          if (map.has(app.id) && this.isProvisionable(app)) {
            this.loadCatalog(app.id);
          }
        }
      },
      error: () => this.loadingAccess.set(false),
    });
  }

  /** ¿La app maneja módulos por compañía (Sigcom)? */
  isMultiCompany(appId: number): boolean {
    return (this.catalogFor(appId)?.companies.length ?? 0) > 0;
  }

  companiesFor(appId: number): { id: string; name: string }[] {
    return this.catalogFor(appId)?.companies ?? [];
  }

  /** ¿La compañía está habilitada (el usuario tiene acceso) en esa app? */
  isCompanyEnabled(appId: number, companyId: string): boolean {
    return this.appCompanies().get(appId)?.has(companyId) ?? false;
  }

  toggleCompany(appId: number, companyId: string): void {
    if (!this.isGranted(appId)) return;
    const next = new Map(this.appCompanies());
    const set = new Set(next.get(appId) ?? []);
    if (set.has(companyId)) {
      set.delete(companyId);
    } else {
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
    if (code) {
      byCompany.set(companyId, code);
    } else {
      byCompany.delete(companyId);
    }
    next.set(appId, byCompany);
    this.appCompanySellers.set(next);
  }

  /** Compañías habilitadas (para las pestañas de módulos). */
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
    const next = new Map(this.activeCompany());
    next.set(appId, companyId);
    this.activeCompany.set(next);
  }

  appCompanyHasPerm(appId: number, companyId: string, key: string): boolean {
    return this.appCompanyPerms().get(appId)?.get(companyId)?.has(key) ?? false;
  }

  toggleAppCompanyPerm(appId: number, companyId: string, key: string): void {
    if (!this.isGranted(appId)) return;
    const next = new Map(this.appCompanyPerms());
    const byCompany = new Map(next.get(appId) ?? new Map<string, Set<string>>());
    const set = new Set(byCompany.get(companyId) ?? []);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    byCompany.set(companyId, set);
    next.set(appId, byCompany);
    this.appCompanyPerms.set(next);
  }

  /** ¿La app admite rol/módulos por aplicación (SIGCOM/SIGCOMPRO)? */
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
    const loading = new Set(this.loadingCatalog());
    loading.add(appId);
    this.loadingCatalog.set(loading);
    this.adminService.getAppCatalog(appId).subscribe({
      next: (cat) => {
        const next = new Map(this.catalogs());
        next.set(appId, cat);
        this.catalogs.set(next);
        const done = new Set(this.loadingCatalog());
        done.delete(appId);
        this.loadingCatalog.set(done);
      },
      error: () => {
        const done = new Set(this.loadingCatalog());
        done.delete(appId);
        this.loadingCatalog.set(done);
      },
    });
  }

  appRole(appId: number): string {
    return this.appRoles().get(appId) ?? '';
  }

  setAppRole(appId: number, role: string): void {
    const next = new Map(this.appRoles());
    if (role) {
      next.set(appId, role);
    } else {
      next.delete(appId);
    }
    this.appRoles.set(next);
  }

  appHasPerm(appId: number, key: string): boolean {
    return this.appPerms().get(appId)?.has(key) ?? false;
  }

  /** Módulo activo según el modo de la app (por compañía o global). */
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

  /** Activa o desactiva todos los módulos de un grupo. */
  setGroup(appId: number, modules: { key: string }[], on: boolean): void {
    for (const m of modules) {
      if (this.modOn(appId, m.key) !== on) this.toggleMod(appId, m.key);
    }
  }

  toggleAppPerm(appId: number, key: string): void {
    if (!this.isGranted(appId)) return;
    const next = new Map(this.appPerms());
    const set = new Set(next.get(appId) ?? []);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    if (set.size) {
      next.set(appId, set);
    } else {
      next.delete(appId);
    }
    this.appPerms.set(next);
  }

  isGranted(appId: number): boolean {
    return this.granted().has(appId);
  }

  hasAbility(appId: number, ability: string): boolean {
    return this.granted().get(appId)?.has(ability) ?? false;
  }

  toggleApp(appId: number): void {
    if (!this.canEdit) return;
    const next = new Map(this.granted());
    if (next.has(appId)) {
      next.delete(appId);
      if (this.activeConfigAppId() === appId) {
        this.closeAppConfig();
      }
    } else {
      next.set(appId, new Set(['view']));
      const app = this.applications().find((a) => a.id === appId);
      if (app && this.isProvisionable(app)) {
        this.loadCatalog(appId);
      }
    }
    this.granted.set(next);
  }

  openAppConfig(app: CatalogApplication, event?: Event): void {
    event?.stopPropagation();
    if (!this.isGranted(app.id) || !this.isProvisionable(app)) return;
    this.activeConfigAppId.set(app.id);
    this.loadCatalog(app.id);
  }

  closeAppConfig(): void {
    this.activeConfigAppId.set(null);
  }

  toggleAbility(appId: number, ability: string): void {
    if (!this.isGranted(appId) || ability === 'view') return;
    const next = new Map(this.granted());
    const set = new Set(next.get(appId) ?? ['view']);
    if (set.has(ability)) {
      set.delete(ability);
    } else {
      set.add(ability);
    }
    next.set(appId, set);
    this.granted.set(next);
  }

  /** Importa a la suite los usuarios/roles/permisos de las apps externas. */
  importFromApps(): void {
    if (this.importing()) return;
    this.importing.set(true);
    this.adminService.importUsersFromApps().subscribe({
      next: (res) => {
        this.importing.set(false);
        const parts = Object.entries(res.summary).map(([slug, s]) =>
          s.error
            ? `${slug}: error`
            : `${slug}: +${s.created ?? 0} nuevos, ${s.linked ?? 0} vinculados`,
        );
        this.showToast(`Importado — ${parts.join(' · ')}`);
        this.adminService.getUsers().subscribe({ next: (users) => this.users.set(users) });
      },
      error: () => {
        this.importing.set(false);
        this.showToast('Error al importar desde las apps');
      },
    });
  }

  save(): void {
    const user = this.selectedUser();
    if (!user || this.saving()) return;
    this.saving.set(true);
    const access = Array.from(this.granted().entries()).map(([application_id, set]) => {
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
    this.adminService.updateUserAccess(user.id, access).subscribe({
      next: () => {
        this.original = this.serialize(this.granted());
        this.saving.set(false);
        this.showToast('Permisos guardados y sincronizados');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al guardar los permisos');
      },
    });
  }

  resetChanges(): void {
    const current = this.selectedUser();
    if (current) {
      this.selectedUser.set(null);
      this.selectUser(current);
    }
  }

  private serialize(map: Map<number, Set<string>>): string {
    const abilities = Array.from(map.entries())
      .map(([id, set]) => `${id}:${Array.from(set).sort().join(',')}`)
      .sort()
      .join('|');
    const roles = Array.from(this.appRoles().entries())
      .map(([id, role]) => `${id}=${role}`)
      .sort()
      .join('|');
    const perms = Array.from(this.appPerms().entries())
      .map(([id, set]) => `${id}#${Array.from(set).sort().join(',')}`)
      .sort()
      .join('|');
    const companyPerms = Array.from(this.appCompanyPerms().entries())
      .map(([id, byCompany]) => {
        const inner = Array.from(byCompany.entries())
          .map(([cid, set]) => `${cid}:${Array.from(set).sort().join(',')}`)
          .sort()
          .join(';');
        return `${id}{${inner}}`;
      })
      .sort()
      .join('|');
    const companiesOn = Array.from(this.appCompanies().entries())
      .map(([id, set]) => `${id}[${Array.from(set).sort().join(',')}]`)
      .sort()
      .join('|');
    const sellers = Array.from(this.appCompanySellers().entries())
      .map(([id, byCompany]) => {
        const inner = Array.from(byCompany.entries())
          .map(([cid, code]) => `${cid}=${code}`)
          .sort()
          .join(';');
        return `${id}(${inner})`;
      })
      .sort()
      .join('|');
    return `${abilities}||${roles}||${perms}||${companyPerms}||${companiesOn}||${sellers}`;
  }

  userInitials(user: AdminUser): string {
    const parts = user.name.split(' ').filter((w) => w.length > 0);
    if (parts.length < 2) return parts.map((w) => w[0]).join('').substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  goBack(): void {
    this.router.navigate(['/portal']);
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 2500);
  }
}
