import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { AppAccessConfig, AppAccessSelection } from '../../shared/app-access-config/app-access-config';
import { FaceService } from '../../services/face.service';
import { AuthService } from '../../services/auth.service';
import {
  AdminService,
  AppProvisioningCatalog,
  CatalogApplication,
  ManagedUser,
  Role,
  UserPayload,
} from '../../services/admin.service';

interface UserFormModel {
  id: number | null;
  name: string;
  cedula: string;
  email: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
  role_id: number | null;
  application_ids: number[];
  appRoles: Record<number, string>;
  appPerms: Record<number, string[]>;
  siesa_username: string;
  siesa_password: string;
}

function emptyForm(): UserFormModel {
  return {
    id: null,
    name: '',
    cedula: '',
    email: '',
    password: '',
    is_admin: false,
    is_active: true,
    role_id: null,
    application_ids: [],
    appRoles: {},
    appPerms: {},
    siesa_username: '',
    siesa_password: '',
  };
}

@Component({
  selector: 'app-users-admin',
  imports: [FormsModule, DatePipe, Sidebar, AppAccessConfig],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class UsersAdmin implements OnInit {
  private adminService = inject(AdminService);
  private faceService = inject(FaceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  readonly fullAdmin = !!this.auth.currentUser()?.is_admin;
  can(...perms: string[]): boolean { return this.auth.can(...perms); }

  readonly users = signal<ManagedUser[]>([]);
  readonly catalog = signal<CatalogApplication[]>([]);
  readonly roles = signal<Role[]>([]);
  // Catálogo completo (roles + módulos) por app externa, cargado bajo demanda.
  readonly appCatalogs = signal<Map<number, AppProvisioningCatalog>>(new Map());
  readonly loadingCatalogs = signal<Set<number>>(new Set());
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly modalOpen = signal(false);
  readonly editing = signal(false);
  readonly form = signal<UserFormModel>(emptyForm());
  readonly formError = signal('');
  readonly showPassword = signal(false);
  readonly showSiesaPassword = signal(false);

  readonly confirmDelete = signal<ManagedUser | null>(null);

  readonly toastMessage = signal('');
  readonly toastVisible = signal(false);

  readonly searchQuery = signal('');

  // --- Biometría facial (enrolamiento y bypass) ---
  readonly faceModalUser = signal<ManagedUser | null>(null);
  readonly faceSamples = signal<number[][]>([]);
  readonly faceCapturing = signal(false);
  readonly faceSaving = signal(false);
  readonly faceModelsLoading = signal(false);
  readonly faceMessage = signal('');
  readonly faceError = signal('');
  bypassMinutes = 60;
  private faceStream: MediaStream | null = null;
  readonly enrollVideo = viewChild<ElementRef<HTMLVideoElement>>('enrollVideo');

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const roleId = this.roleFilter();
    const byRole = roleId ? this.users().filter((u) => u.role_id === roleId) : this.users();
    if (!q) return byRole;
    return byRole.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.cedula.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
    );
  });

  /** Filtro por grupo (llega como ?grupo=ID desde la página de Grupos). */
  readonly roleFilter = signal<number | null>(null);
  readonly roleFilterName = computed(() => this.roles().find((r) => r.id === this.roleFilter())?.name ?? null);

  ngOnInit(): void {
    const grupo = Number(this.route.snapshot.queryParamMap.get('grupo'));
    if (grupo) this.roleFilter.set(grupo);
    this.load();
  }

  clearRoleFilter(): void {
    this.roleFilter.set(null);
    this.router.navigate([], { queryParams: {} });
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getManagedUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.adminService.getApplications().subscribe({
      next: (apps) => this.catalog.set(apps),
      error: () => this.catalog.set([]),
    });
    this.adminService.getRoles().subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.roles.set([]),
    });
  }

  openCreate(): void {
    this.form.set(emptyForm());
    this.editing.set(false);
    this.formError.set('');
    this.showPassword.set(false);
    this.showSiesaPassword.set(false);
    this.modalOpen.set(true);
  }

  openEdit(user: ManagedUser): void {
    this.form.set({
      id: user.id,
      name: user.name,
      cedula: user.cedula,
      email: user.email ?? '',
      password: '',
      is_admin: user.is_admin,
      is_active: user.is_active,
      role_id: user.role_id,
      application_ids: [...user.application_ids],
      appRoles: {},
      appPerms: {},
      siesa_username: '',
      siesa_password: '',
    });
    this.editing.set(true);
    this.formError.set('');
    this.showPassword.set(false);
    this.showSiesaPassword.set(false);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
  }

  updateField<K extends keyof UserFormModel>(key: K, value: UserFormModel[K]): void {
    this.form.set({ ...this.form(), [key]: value });
  }

  toggleApp(appId: number): void {
    const f = this.form();
    const ids = f.application_ids.includes(appId)
      ? f.application_ids.filter((id) => id !== appId)
      : [...f.application_ids, appId];
    this.form.set({ ...f, application_ids: ids });
    const app = this.catalog().find((a) => a.id === appId);
    if (app && this.isProvisionable(app) && ids.includes(appId)) {
      this.ensureAppCatalog(appId);
    }
  }

  hasApp(appId: number): boolean {
    return this.form().application_ids.includes(appId);
  }

  /** ¿La app admite rol por aplicación (SIGCOM/SIGCOMPRO)? */
  isProvisionable(app: CatalogApplication): boolean {
    return app.provisionable === true || app.sso_enabled === true;
  }

  /** Apps aprovisionables seleccionadas (para pedir el rol en el alta). */
  readonly selectedProvisionableApps = computed(() =>
    this.catalog().filter(
      (a) => this.isProvisionable(a) && this.form().application_ids.includes(a.id),
    ),
  );

  appRolesFor(appId: number): string[] {
    return this.appCatalogs().get(appId)?.roles ?? [];
  }

  /** Catálogo completo de la app (para el editor granular reutilizable). */
  appCatalogFor(appId: number): AppProvisioningCatalog | null {
    return this.appCatalogs().get(appId) ?? null;
  }

  isLoadingCatalog(appId: number): boolean {
    return this.loadingCatalogs().has(appId);
  }

  /** Modelo de selección (rol + permisos) que consume el editor reutilizable. */
  selectionFor(appId: number): AppAccessSelection {
    const f = this.form();
    return { role: f.appRoles[appId] ?? '', permissions: f.appPerms[appId] ?? [] };
  }

  onSelectionChange(appId: number, selection: AppAccessSelection): void {
    const f = this.form();
    this.form.set({
      ...f,
      appRoles: { ...f.appRoles, [appId]: selection.role },
      appPerms: { ...f.appPerms, [appId]: selection.permissions },
    });
  }

  getAppRole(appId: number): string {
    return this.form().appRoles[appId] ?? '';
  }

  setAppRole(appId: number, role: string): void {
    const f = this.form();
    this.form.set({ ...f, appRoles: { ...f.appRoles, [appId]: role } });
  }

  private ensureAppCatalog(appId: number): void {
    if (this.appCatalogs().has(appId) || this.loadingCatalogs().has(appId)) return;
    this.loadingCatalogs.update((s) => new Set(s).add(appId));
    this.adminService.getAppCatalog(appId).subscribe({
      next: (cat) => {
        this.appCatalogs.update((m) => new Map(m).set(appId, cat));
        this.loadingCatalogs.update((s) => {
          const next = new Set(s);
          next.delete(appId);
          return next;
        });
      },
      error: () => {
        this.loadingCatalogs.update((s) => {
          const next = new Set(s);
          next.delete(appId);
          return next;
        });
      },
    });
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleSiesaPassword(): void {
    this.showSiesaPassword.update((v) => !v);
  }

  save(): void {
    if (this.saving()) return;
    const f = this.form();

    if (!f.name.trim() || !f.cedula.trim()) {
      this.formError.set('Nombre y cédula son obligatorios.');
      return;
    }
    if (!this.editing() && f.password.trim().length < 6) {
      this.formError.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (this.editing() && f.password.trim() && f.password.trim().length < 6) {
      this.formError.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const email = (f.email ?? '').trim();
    const payload: UserPayload = {
      name: f.name.trim(),
      cedula: f.cedula.trim(),
      email: email || null,
      is_admin: f.is_admin,
      is_active: f.is_active,
      role_id: f.role_id,
      application_ids: f.application_ids,
    };
    if (f.password.trim()) payload.password = f.password;
    if (f.siesa_username.trim()) payload.siesa_username = f.siesa_username.trim();
    if (f.siesa_password.trim()) payload.siesa_password = f.siesa_password;

    // En el alta se define el rol por app: se envía app_access con el rol elegido
    // para cada app habilitada (la edición de rol/módulos va en Permisos).
    if (!this.editing()) {
      payload.app_access = f.application_ids.map((application_id) => ({
        application_id,
        role: f.appRoles[application_id] || null,
        permissions: f.appPerms[application_id] ?? [],
      }));
    }

    this.saving.set(true);
    this.formError.set('');

    const request$ =
      this.editing() && f.id
        ? this.adminService.updateUser(f.id, payload)
        : this.adminService.createUser(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.showToast(this.editing() ? 'Usuario actualizado' : 'Usuario creado');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const errors = err?.error?.errors;
        const msg = errors
          ? Object.values(errors).flat().join(' ')
          : err?.error?.message || 'No se pudo guardar el usuario.';
        this.formError.set(msg);
      },
    });
  }

  askDelete(user: ManagedUser): void {
    this.confirmDelete.set(user);
  }

  cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  doDelete(): void {
    const user = this.confirmDelete();
    if (!user) return;
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.confirmDelete.set(null);
        this.showToast('Usuario eliminado');
        this.load();
      },
      error: (err) => {
        this.confirmDelete.set(null);
        this.showToast(err?.error?.message || 'No se pudo eliminar el usuario');
      },
    });
  }

  appName(appId: number): string {
    return this.catalog().find((a) => a.id === appId)?.name ?? '';
  }

  /** Rol legible del usuario. */
  roleLabel(user: ManagedUser): string {
    return user.role_name ?? (user.is_admin ? 'Administrador' : 'Usuario');
  }

  goBack(): void {
    this.router.navigate(['/portal']);
  }

  // ============================================================
  // Biometría facial
  // ============================================================

  /** ¿El usuario tiene un bypass facial vigente? */
  isBypassActive(user: ManagedUser): boolean {
    return !!user.face_bypass_until && new Date(user.face_bypass_until).getTime() > Date.now();
  }

  /** Abre el modal de enrolamiento y enciende la cámara. */
  async openFaceModal(user: ManagedUser): Promise<void> {
    this.faceModalUser.set(user);
    this.faceSamples.set([]);
    this.faceError.set('');
    this.faceMessage.set('Preparando la c\u00e1mara...');
    this.faceModelsLoading.set(true);
    try {
      await this.faceService.loadModels();
      await new Promise((r) => setTimeout(r, 0));
      const video = this.enrollVideo()?.nativeElement;
      if (!video) throw new Error('sin cámara');
      this.faceStream = await this.faceService.startCamera(video);
      this.faceModelsLoading.set(false);
      this.faceMessage.set('Captura 3 tomas del rostro desde distintos \u00e1ngulos.');
    } catch {
      this.faceModelsLoading.set(false);
      this.faceError.set('No se pudo acceder a la c\u00e1mara o a los modelos.');
    }
  }

  /** Captura una muestra (descriptor) del rostro en vivo. */
  async captureSample(): Promise<void> {
    const video = this.enrollVideo()?.nativeElement;
    if (!video || this.faceCapturing()) return;
    this.faceCapturing.set(true);
    this.faceError.set('');
    try {
      const descriptor = await this.faceService.detectDescriptor(video);
      if (!descriptor) {
        this.faceError.set('No se detect\u00f3 un rostro claro. Intenta de nuevo.');
      } else {
        this.faceSamples.set([...this.faceSamples(), this.faceService.toArray(descriptor)]);
        this.faceMessage.set(`Tomas capturadas: ${this.faceSamples().length} / 3`);
      }
    } catch {
      this.faceError.set('Error al analizar el rostro.');
    } finally {
      this.faceCapturing.set(false);
    }
  }

  /** Guarda el enrolamiento (envía los descriptores al backend). */
  saveFace(): void {
    const user = this.faceModalUser();
    if (!user || this.faceSaving() || this.faceSamples().length === 0) return;
    this.faceSaving.set(true);
    this.adminService.enrollFace(user.id, this.faceSamples()).subscribe({
      next: () => {
        this.faceSaving.set(false);
        this.closeFaceModal();
        this.showToast('Rostro enrolado correctamente');
        this.load();
      },
      error: (err) => {
        this.faceSaving.set(false);
        this.faceError.set(err?.error?.message || 'No se pudo guardar el rostro.');
      },
    });
  }

  /** Elimina el rostro enrolado de un usuario. */
  removeFace(user: ManagedUser): void {
    this.adminService.removeFace(user.id).subscribe({
      next: () => {
        this.showToast('Rostro eliminado');
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo eliminar el rostro'),
    });
  }

  /** Otorga un bypass temporal del factor facial. */
  grantBypass(user: ManagedUser): void {
    const minutes = Number(this.bypassMinutes) || 60;
    this.adminService.grantFaceBypass(user.id, minutes).subscribe({
      next: () => {
        this.showToast(`Bypass otorgado por ${minutes} min`);
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo otorgar el bypass'),
    });
  }

  /** Revoca el bypass temporal del factor facial. */
  revokeBypass(user: ManagedUser): void {
    this.adminService.revokeFaceBypass(user.id).subscribe({
      next: () => {
        this.showToast('Bypass revocado');
        this.load();
      },
      error: (err) => this.showToast(err?.error?.message || 'No se pudo revocar el bypass'),
    });
  }

  /** Cierra el modal de enrolamiento y apaga la cámara. */
  closeFaceModal(): void {
    if (this.faceSaving()) return;
    this.faceService.stopCamera(this.enrollVideo()?.nativeElement ?? null, this.faceStream);
    this.faceStream = null;
    this.faceModalUser.set(null);
    this.faceSamples.set([]);
    this.faceMessage.set('');
    this.faceError.set('');
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 2500);
  }
}
