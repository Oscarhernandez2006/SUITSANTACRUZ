import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AuthService } from '../../services/auth.service';
import { AdminService, Role, RolePayload, SuiteModule, SuiteModuleGroup } from '../../services/admin.service';

type RoleFilter = 'all' | 'full' | 'custom' | 'system';

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar',
  revoke: 'Revocar', import: 'Importar', face: 'Rostro', stats: 'Indicadores',
};

@Component({
  selector: 'app-groups',
  imports: [Sidebar, FormsModule],
  templateUrl: './groups.html',
  styleUrl: './groups.scss',
})
export class Groups implements OnInit {
  private adminService = inject(AdminService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly roles = signal<Role[]>([]);
  readonly catalog = signal<SuiteModuleGroup[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly toast = signal('');

  readonly search = signal('');
  readonly filter = signal<RoleFilter>('all');
  readonly menuOpen = signal<number | null>(null);

  readonly modalOpen = signal(false);
  readonly editing = signal<Role | null>(null);
  readonly fName = signal('');
  readonly fDescription = signal('');
  readonly fColor = signal('#2f8f4e');
  readonly fIsAdmin = signal(false);
  readonly fPerms = signal<Set<string>>(new Set());

  readonly fullAdmin = !!this.auth.currentUser()?.is_admin;
  readonly canCreate = this.auth.can('roles.create');
  readonly canEdit = this.auth.can('roles.edit');
  readonly canDelete = this.auth.can('roles.delete');

  readonly modules = computed<SuiteModule[]>(() => this.catalog().flatMap((g) => g.modules));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.roles().filter((r) => {
      if (f === 'full' && !r.is_admin) return false;
      if (f === 'custom' && r.is_admin) return false;
      if (f === 'system' && !r.is_system) return false;
      return !q || r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q);
    });
  });

  ngOnInit(): void {
    this.adminService.getRoleCatalog().subscribe({ next: (c) => this.catalog.set(c.groups) });
    this.load();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.gcard__menu')) this.menuOpen.set(null);
  }

  load(): void {
    this.loading.set(true);
    this.adminService.getRoles().subscribe({
      next: (r) => { this.roles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ---- Resumen por tarjeta ----
  moduleCount(role: Role): number {
    const set = new Set(role.permissions);
    return this.modules().filter((m) => set.has(m.key)).length;
  }

  roleModules(role: Role): SuiteModule[] {
    const set = new Set(role.permissions);
    return this.modules().filter((m) => set.has(m.key));
  }

  actionCount(role: Role): number {
    return role.permissions.filter((p) => p.includes('.')).length;
  }

  totalActions(): number {
    return this.modules().reduce((n, m) => n + m.actions.length, 0);
  }

  level(role: Role): { label: string; sub: string } {
    if (role.is_admin) return { label: 'Acceso completo', sub: 'Todos los módulos y acciones' };
    const n = this.actionCount(role);
    if (n === 0) return { label: 'Solo ver', sub: 'Sin acciones de edición' };
    return { label: 'Personalizado', sub: `${n} de ${this.totalActions()} acciones` };
  }

  /** Tipos de acción presentes en el grupo (Crear, Editar, ...). */
  actionKinds(role: Role): { key: string; label: string; on: boolean }[] {
    const kinds = new Set(role.permissions.filter((p) => p.includes('.')).map((p) => p.split('.')[1]));
    return ['create', 'edit', 'delete', 'export', 'revoke'].map((k) => ({ key: k, label: ACTION_LABELS[k], on: role.is_admin || kinds.has(k) }));
  }

  canEditRole(role: Role): boolean {
    return this.canEdit && (this.fullAdmin || !role.is_admin);
  }

  canDeleteRole(role: Role): boolean {
    return this.canDelete && !role.is_system && (this.fullAdmin || !role.is_admin);
  }

  viewUsers(role: Role): void {
    this.router.navigate(['/admin/usuarios'], { queryParams: { grupo: role.id } });
  }

  // ---- Editor ----
  openCreate(): void {
    this.editing.set(null);
    this.fName.set('');
    this.fDescription.set('');
    this.fColor.set('#2f8f4e');
    this.fIsAdmin.set(false);
    this.fPerms.set(new Set(['dashboard', 'apps']));
    this.error.set('');
    this.modalOpen.set(true);
  }

  openEdit(role: Role): void {
    this.editing.set(role);
    this.fName.set(role.name);
    this.fDescription.set(role.description ?? '');
    this.fColor.set(role.color ?? '#2f8f4e');
    this.fIsAdmin.set(role.is_admin);
    this.fPerms.set(new Set(role.permissions));
    this.error.set('');
    this.modalOpen.set(true);
  }

  duplicate(role: Role): void {
    this.openEdit(role);
    this.editing.set(null);
    this.fName.set(`${role.name} (copia)`);
    if (!this.fullAdmin) this.fIsAdmin.set(false);
  }

  closeModal(): void {
    if (!this.saving()) this.modalOpen.set(false);
  }

  has(key: string): boolean {
    return this.fIsAdmin() || this.fPerms().has(key);
  }

  /** Solo se puede otorgar lo que uno mismo tiene. */
  grantable(key: string): boolean {
    return this.fullAdmin || this.auth.can(key);
  }

  toggleModule(m: SuiteModule): void {
    if (m.locked || this.fIsAdmin() || !this.grantable(m.key)) return;
    const next = new Set(this.fPerms());
    if (next.has(m.key)) {
      next.delete(m.key);
      m.actions.forEach((a) => next.delete(`${m.key}.${a.key}`));
    } else {
      next.add(m.key);
    }
    this.fPerms.set(next);
  }

  toggleAction(m: SuiteModule, actionKey: string): void {
    const key = `${m.key}.${actionKey}`;
    if (this.fIsAdmin() || !this.fPerms().has(m.key) || !this.grantable(key)) return;
    const next = new Set(this.fPerms());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.fPerms.set(next);
  }

  setAll(on: boolean): void {
    if (this.fIsAdmin()) return;
    const next = new Set<string>(['dashboard', 'apps']);
    if (on) {
      for (const m of this.modules()) {
        if (this.grantable(m.key)) next.add(m.key);
        for (const a of m.actions) {
          const key = `${m.key}.${a.key}`;
          if (this.grantable(key)) next.add(key);
        }
      }
    }
    this.fPerms.set(next);
  }

  enabledCount(): number {
    return this.modules().filter((m) => this.has(m.key)).length;
  }

  save(): void {
    if (!this.fName().trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const payload: RolePayload = {
      name: this.fName().trim(),
      description: this.fDescription().trim() || null,
      color: this.fColor(),
      is_admin: this.fIsAdmin(),
      permissions: Array.from(this.fPerms()),
    };
    const editing = this.editing();
    const req = editing ? this.adminService.updateRole(editing.id, payload) : this.adminService.createRole(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.showToast(editing ? 'Grupo actualizado' : 'Grupo creado');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'No se pudo guardar el grupo.');
      },
    });
  }

  remove(role: Role): void {
    this.menuOpen.set(null);
    if (!confirm(`¿Eliminar el grupo "${role.name}"? Sus ${role.users_count} usuario(s) quedarán sin grupo.`)) return;
    this.adminService.deleteRole(role.id).subscribe({
      next: () => { this.showToast('Grupo eliminado'); this.load(); },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo eliminar el grupo'),
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
